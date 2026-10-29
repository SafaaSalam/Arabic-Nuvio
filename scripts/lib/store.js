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

/** Ids must be plain ASCII so file names and Stremio/Nuvio URLs always match: non-ASCII chars become %xx. */
function asciiId(id) {
  // Allowed: A-Z a-z 0-9 _ - . ~     Everything else (incl. %xx and non-ASCII) becomes ~xx (UTF-8 bytes, lower-case hex).
  // Idempotent: running it on an already converted id changes nothing. "%" is avoided on purpose because
  // clients and GitHub treat %xx in URLs as escapes, which would break meta file lookups.
  const enc = String(id)
    .replace(/%([0-9a-fA-F]{2})/g, (_, h) => "~" + h.toLowerCase())
    .replace(/[^A-Za-z0-9_\-.~]+/g, (run) =>
      Array.from(run).map((ch) => {
        const e = encodeURIComponent(ch);
        return (e.length > 1 ? e : "%" + ch.charCodeAt(0).toString(16).padStart(2, "0")).toLowerCase().replace(/%/g, "~");
      }).join(""));
  return fitIdLength(enc);
}

/**
 * File systems cap names at 255 bytes; long Arabic slugs (6 chars per letter) overflow that and crashed the sync.
 * Long ids are cut on a whole-character boundary and get a short hash so they stay unique. Idempotent (short ids unchanged).
 * Sites such as Akwam route by the numeric id, so a shortened slug still opens the right page; the full page URL is kept
 * in the meta "website" field for everything else.
 */
const MAX_ID_LEN = 200;
function fitIdLength(enc) {
  if (enc.length <= MAX_ID_LEN) return enc;
  const hash = require("crypto").createHash("sha1").update(enc).digest("hex").slice(0, 8);
  const tokens = enc.match(/~[0-9a-f]{2}|[\s\S]/g) || [];
  const out = [];
  let len = 0;
  const limit = MAX_ID_LEN - hash.length - 1;
  for (let i = 0; i < tokens.length; i++) {
    // a character starts at any token that is not a UTF-8 continuation byte (~80..~bf)
    if (!/^~[89ab][0-9a-f]$/.test(tokens[i])) {
      let j = i + 1;
      while (j < tokens.length && /^~[89ab][0-9a-f]$/.test(tokens[j])) j++;
      const chunk = tokens.slice(i, j).join("");
      if (len + chunk.length > limit) break;
      out.push(chunk); len += chunk.length; i = j - 1;
    } else if (len + 3 <= limit) { out.push(tokens[i]); len += 3; } else break;
  }
  return out.join("").replace(/[-_.~]+$/, "") + "-" + hash;
}
/** Inverse of asciiId for the URL part of an id: "~d9~85" -> "%d9%85" -> real characters. */
function decodeIdSlug(slug) {
  const pct = String(slug).replace(/~([0-9a-fA-F]{2})/g, "%$1");
  try { return decodeURIComponent(pct); } catch (_) { return pct; }
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
    if (s && Array.isArray(s.items)) {
      s.items = dedupe(s.items.map((it) => (it && it.id ? Object.assign(it, { id: asciiId(it.id) }) : it)));
      return s;
    }
  } catch (_) {}
  // First run: migrate whatever is already published so nothing is lost.
  let items = [];
  try {
    const old = JSON.parse(fs.readFileSync(path.join(ADDON_DIR, "catalog", type, `${id}.json`), "utf8"));
    if (Array.isArray(old.metas)) items = old.metas;
  } catch (_) {}
  return { id, type, items: dedupe(items.map((it) => (it && it.id ? Object.assign(it, { id: asciiId(it.id) }) : it))), cursor: { next: 1, done: false }, updatedAt: null };
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
  let status = null;

  for (let n = 1; n <= forwardPages; n++) {
    const r = await fetchPage(n);
    if (!r || !r.ok) { if (r && r.status) status = r.status; break; }
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
  return { reachable, status, fresh: head.length, backfilled: tail.length, total: store.items.length, done: !!store.cursor.done };
}

module.exports = {
  ROOT_DIR, ADDON_DIR, STORE_DIR, PAGE_SIZE,
  asciiId, decodeIdSlug, writeIfChanged, writeJsonIfChanged, normalizeTitle, keysOf, dedupe,
  loadStore, saveStore, mergeIntoStore, writePagedCatalog, pageFileFor, crawl,
};
