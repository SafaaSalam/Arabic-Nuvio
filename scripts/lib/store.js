/**
 * Persistent catalog store + merge + paging helpers.
 *
 * Every catalog row (e.g. "akwam_latest_movies") is kept in data/store/<id>.json as an ordered
 * list (newest -> oldest). Each sync run:
 *   1. crawls the first N pages of the source (fresh items, newest first)  -> placed at the HEAD
 *   2. crawls a few deeper pages (backfill, cursor saved in the store)      -> appended at the TAIL
 *   3. de-duplicates (by id, IMDb id and normalised title) and writes paged files:
 *        addon/catalog/<type>/<id>.json              (page 0, first PAGE_SIZE items)
 *        addon/catalog/<type>/<id>/skip=<N>.json     (Stremio/Nuvio "skip" pagination)
 *
 * Nothing is ever dropped just because the source's first page moved on, so rows only grow.
 */
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const STORE_DIR = path.join(ROOT_DIR, "data", "store");
const ADDON_DIR = path.join(ROOT_DIR, "addon");
const PAGE_SIZE = 100;

// ---------------------------------------------------------------- io helpers
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

/** Write only when content changed (keeps git history free of no-op commits). */
function writeIfChanged(filePath, text) {
  try {
    if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8") === text) return false;
  } catch (_) {}
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, text, "utf8");
  return true;
}
function writeJsonIfChanged(filePath, data, pretty = true) {
  return writeIfChanged(filePath, (pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)) + "\n");
}

// ------------------------------------------------------------ title / keys
const TASHKEEL = /[ً-ٰٟـ]/g;
function normalizeTitle(name) {
  let s = String(name || "").toLowerCase();
  s = s.replace(TASHKEEL, "");
  s = s.replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
  // strip episode / season decorations so "Show - الحلقة 12" and "Show" collapse together
  s = s.replace(/(?:الحلقه|الحلقة|حلقه|episode|ep)\s*\d+/g, " ");
  s = s.replace(/(?:مترجم[ةه]?|مدبلج[ةه]?|اون لاين|اونلاين|online|مشاهدة|مشاهده|تحميل|كامل[ةه]?|مسلسل|فيلم|انمي|أنمي)/g, " ");
  s = s.replace(/[\s|\-–—_:()\[\]{}.,!?"'`~·•/\\]+/g, " ").trim();
  return s;
}
function imdbOf(item) {
  const m = String(item.id || "").match(/^(tt\d{5,12})/i);
  return m ? m[1].toLowerCase() : null;
}
function keysOf(item) {
  const keys = ["id:" + item.id];
  const imdb = item.imdb_id || imdbOf(item);
  if (imdb) keys.push("imdb:" + item.type + ":" + imdb);
  const t = normalizeTitle(item.name);
  if (t.length >= 2) keys.push("t:" + item.type + ":" + t + ":" + (item.releaseInfo || ""));
  return keys;
}
function quality(item) {
  return (imdbOf(item) ? 4 : 0) + (item.poster ? 2 : 0) + (item.description && item.description !== item.name ? 1 : 0);
}

/** De-duplicate preserving order; when two entries collide the better-quality one wins in place. */
function dedupe(items) {
  const out = [];
  const index = new Map(); // key -> position in out
  for (const it of items) {
    if (!it || !it.id || !it.name) continue;
    const keys = keysOf(it);
    let hit = -1;
    for (const k of keys) { if (index.has(k)) { hit = index.get(k); break; } }
    if (hit === -1) {
      const pos = out.push(it) - 1;
      for (const k of keys) index.set(k, pos);
    } else {
      if (quality(it) > quality(out[hit])) {
        out[hit] = Object.assign({}, it);
        for (const k of keys) index.set(k, hit);
      } else {
        for (const k of keys) if (!index.has(k)) index.set(k, hit);
      }
    }
  }
  return out;
}

// -------------------------------------------------------------------- store
function storePath(id) { return path.join(STORE_DIR, `${id}.json`); }

function loadStore(id, type) {
  try {
    const s = JSON.parse(fs.readFileSync(storePath(id), "utf8"));
    if (s && Array.isArray(s.items)) return s;
  } catch (_) {}
  // First run: migrate whatever is already published so nothing is lost.
  let items = [];
  try {
    const old = JSON.parse(fs.readFileSync(path.join(ADDON_DIR, "catalog", type, `${id}.json`), "utf8"));
    if (Array.isArray(old.metas)) items = old.metas;
  } catch (_) {}
  return { id, type, items: dedupe(items), cursor: { next: 1, done: false }, updatedAt: null };
}
function saveStore(store) {
  writeJsonIfChanged(storePath(store.id), store, false);
}

/**
 * head  = freshly crawled items (source order, newest first)
 * tail  = deeper/backfilled items
 */
function mergeIntoStore(store, head, tail) {
  const headKeys = new Set();
  const headDeduped = dedupe(head || []);
  for (const it of headDeduped) for (const k of keysOf(it)) headKeys.add(k);
  const rest = (store.items || []).filter(it => !keysOf(it).some(k => headKeys.has(k)));
  store.items = dedupe([...headDeduped, ...rest, ...(tail || [])]);
  return store;
}

// ------------------------------------------------------------------ paging
function pageFileFor(type, id, skip) {
  return skip === 0
    ? path.join(ADDON_DIR, "catalog", type, `${id}.json`)
    : path.join(ADDON_DIR, "catalog", type, id, `skip=${skip}.json`);
}

function writePagedCatalog(type, id, items, pageSize = PAGE_SIZE) {
  let changed = 0;
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  for (let p = 0; p < pages; p++) {
    const skip = p * pageSize;
    if (writeJsonIfChanged(pageFileFor(type, id, skip), { metas: items.slice(skip, skip + pageSize) }, false)) changed++;
  }
  // remove stale pages left over from a previous (larger) run
  const dir = path.join(ADDON_DIR, "catalog", type, id);
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^skip=(\d+)\.json$/);
      if (m && parseInt(m[1], 10) >= pages * pageSize) {
        try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
      }
    }
  }
  return { pages, changed };
}

// ---------------------------------------------------------------- crawling
/**
 * Generic crawler used by every source.
 *   fetchPage(n) -> { ok, items }   n starts at 1 ; ok=false means "network/HTTP problem, try again later"
 *                                    ok=true + items=[] means "no such page" (end of listing)
 * opts.forwardPages  pages 1..k always re-read (picks up new releases)
 * opts.backfillPages deeper pages read per run, resuming at store.cursor.next
 */
const isEnd = (r) => (r.end !== undefined ? r.end : !r.items.length);

async function crawl(store, fetchPage, opts = {}) {
  const forwardPages = opts.forwardPages || 2;
  const backfillPages = opts.backfillPages === undefined ? 6 : opts.backfillPages;
  const maxPages = opts.maxPages || 400;
  const head = [];
  let reachable = false;

  for (let n = 1; n <= forwardPages; n++) {
    const r = await fetchPage(n);
    if (!r || !r.ok) break;
    reachable = true;
    if (isEnd(r)) { store.cursor.done = true; break; }
    head.push(...r.items);
  }

  const tail = [];
  if (reachable && !store.cursor.done && opts.paginated !== false) {
    let n = Math.max(store.cursor.next || 1, forwardPages + 1);
    let emptyStreak = 0;
    for (let i = 0; i < backfillPages && n <= maxPages; i++, n++) {
      const r = await fetchPage(n);
      if (!r || !r.ok) break;               // transient problem: resume here next run
      if (isEnd(r)) { store.cursor.done = true; break; }
      const prevLen = dedupe([...head, ...store.items, ...tail]).length;
      tail.push(...r.items);
      store.cursor.next = n + 1;
      const newLen = dedupe([...head, ...store.items, ...tail]).length;
      emptyStreak = newLen === prevLen ? emptyStreak + 1 : 0;
      if (emptyStreak >= 2) { store.cursor.done = true; break; } // source ignores our page parameter
    }
    if (n > maxPages) store.cursor.done = true;
  }
  if (reachable) store.updatedAt = new Date().toISOString().slice(0, 10);
  mergeIntoStore(store, head, tail);
  return { reachable, fresh: head.length, backfilled: tail.length, total: store.items.length, done: !!store.cursor.done };
}

module.exports = {
  ROOT_DIR, ADDON_DIR, STORE_DIR, PAGE_SIZE,
  writeIfChanged, writeJsonIfChanged, normalizeTitle, keysOf, dedupe,
  loadStore, saveStore, mergeIntoStore, writePagedCatalog, pageFileFor, crawl,
};
