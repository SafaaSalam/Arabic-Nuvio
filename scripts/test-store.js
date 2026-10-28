/**
 * Offline unit tests for the catalog store (merge order, de-duplication, paging, backfill resume).
 * Runs against a temporary directory so it never touches real data.   node scripts/test-store.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nuvio-store-"));
const lib = path.resolve(__dirname, "lib", "store.js");
// redirect the store's root into tmp by loading a patched copy of the module
const src = fs.readFileSync(lib, "utf8").replace('const ROOT_DIR = path.resolve(__dirname, "..", "..");', `const ROOT_DIR = ${JSON.stringify(tmp)};`);
const patched = path.join(tmp, "store.js");
fs.writeFileSync(patched, src);
const S = require(patched);

const mk = (n, extra = {}) => ({ id: `x_${n}`, type: "movie", name: `Movie number ${n}`, poster: "p", ...extra });
// the "site": item numbers descending = newest first; 10 items / page
function site(total) {
  return async (page) => {
    const start = total - (page - 1) * 10;
    if (start <= 0) return { ok: true, items: [] };
    const items = [];
    for (let i = start; i > Math.max(0, start - 10); i--) items.push(mk(i));
    return { ok: true, items };
  };
}

(async () => {
  // 1. first run reads forward pages + a bounded backfill and resumes next run
  const st = S.loadStore("row", "movie");
  let r = await S.crawl(st, site(95), { forwardPages: 2, backfillPages: 3 });
  assert.strictEqual(st.items.length, 50, "2 forward + 3 backfill pages = 50 items");
  assert.strictEqual(st.items[0].id, "x_95");
  r = await S.crawl(st, site(95), { forwardPages: 2, backfillPages: 10 });
  assert.strictEqual(st.items.length, 95, "backfill resumes and finishes");
  assert.ok(st.cursor.done, "cursor marked done at end of listing");

  // 2. new releases arrive: they go to the head, order stays newest -> oldest, no duplicates
  await S.crawl(st, site(103), { forwardPages: 2, backfillPages: 0 });
  assert.strictEqual(st.items[0].id, "x_103");
  assert.strictEqual(st.items.length, 103 > 95 ? 103 : 95, "page-shift overlap is de-duplicated");
  const ids = st.items.map((i) => i.id);
  assert.strictEqual(new Set(ids).size, ids.length, "no duplicate ids");
  for (let i = 1; i < ids.length; i++) assert.ok(+ids[i - 1].slice(2) > +ids[i].slice(2), "strictly newest -> oldest");

  // 3. same title under a different id / episode decoration collapses; better entry (IMDb id) wins
  const d = S.dedupe([
    { id: "a_1", type: "series", name: "مسلسل عشق - الحلقة 12", poster: "p" },
    { id: "a_2", type: "series", name: "عشق", poster: "p" },
    { id: "tt1234567", type: "series", name: "عشق", poster: "p" },
    { id: "a_3", type: "movie", name: "عشق", poster: "p" },
  ]);
  assert.strictEqual(d.length, 2, "series dupes collapse, movie of same name stays");
  assert.strictEqual(d[0].id, "tt1234567");

  // 4. a source outage never loses data
  const before = st.items.length;
  await S.crawl(st, async () => ({ ok: false }), { forwardPages: 2, backfillPages: 3 });
  assert.strictEqual(st.items.length, before);

  // 5. paging files follow the Stremio skip convention and are idempotent
  const w1 = S.writePagedCatalog("movie", "row", st.items, 40);
  assert.strictEqual(w1.pages, 3);
  const p1 = path.join(tmp, "addon", "catalog", "movie");
  assert.ok(fs.existsSync(path.join(p1, "row.json")));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(p1, "row", "skip=40.json"))).metas.length, 40);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(p1, "row", "skip=80.json"))).metas.length, st.items.length - 80);
  assert.strictEqual(S.writePagedCatalog("movie", "row", st.items, 40).changed, 0, "second write changes nothing");
  S.writePagedCatalog("movie", "row", st.items.slice(0, 50), 40); // shrinks -> stale page removed
  assert.ok(!fs.existsSync(path.join(p1, "row", "skip=80.json")));

  console.log("✅ store tests passed");
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => { console.error("❌", e); process.exit(1); });
