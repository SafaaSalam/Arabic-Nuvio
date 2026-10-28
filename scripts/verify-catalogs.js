/**
 * Structural verification of the generated addon + collections.  node scripts/verify-catalogs.js
 * Fails (exit 1) on: unreadable JSON, missing/oversized/out-of-order pages, duplicate items inside a row,
 * collection folders that point to a row that does not exist.
 * Rows that are empty (source currently unreachable / selector broken) are reported as warnings.
 */
const fs = require("fs");
const path = require("path");
const { keysOf } = require("./lib/store.js");

const ROOT = path.resolve(__dirname, "..");
const ADDON = path.join(ROOT, "addon");
const errors = [];
const warnings = [];
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, ""));

const manifest = readJson(path.join(ADDON, "manifest.json"));
const defined = new Set();
let totalItems = 0;

for (const cat of manifest.catalogs) {
  defined.add(`${cat.type}/${cat.id}`);
  const hasSkip = Array.isArray(cat.extra) && cat.extra.some((e) => e.name === "skip");
  const size = cat.pageSize || 100;
  const first = path.join(ADDON, "catalog", cat.type, `${cat.id}.json`);
  if (!fs.existsSync(first)) { errors.push(`${cat.type}/${cat.id}: page 0 missing`); continue; }

  const all = [];
  let skip = 0;
  for (;;) {
    const f = skip === 0 ? first : path.join(ADDON, "catalog", cat.type, cat.id, `skip=${skip}.json`);
    if (!fs.existsSync(f)) break;
    let metas;
    try { metas = readJson(f).metas; } catch (e) { errors.push(`${f}: invalid JSON`); break; }
    if (!Array.isArray(metas)) { errors.push(`${f}: metas not an array`); break; }
    if (metas.length > size) errors.push(`${cat.id} skip=${skip}: ${metas.length} > pageSize ${size}`);
    all.push(...metas);
    if (metas.length < size) break;
    skip += size;
  }
  if (all.length > size && !hasSkip) errors.push(`${cat.id}: has ${all.length} items but manifest lacks the "skip" extra`);

  const seen = new Map();
  for (const m of all) {
    if (!m.id || !m.name || !m.poster) { errors.push(`${cat.id}: item without id/name/poster (${m.id})`); continue; }
    if (m.type !== cat.type) errors.push(`${cat.id}: item ${m.id} has type ${m.type}`);
    for (const k of keysOf(m)) {
      if (seen.has(k)) { errors.push(`${cat.id}: duplicate (${k}) -> ${seen.get(k)} / ${m.id}`); break; }
    }
    for (const k of keysOf(m)) seen.set(k, m.id);
  }
  totalItems += all.length;
  if (all.length === 0) warnings.push(`${cat.id}: empty`);
}

const collections = readJson(path.join(ROOT, "nuvio-collections.json"));
for (const col of collections) {
  const folderIds = new Set();
  for (const f of col.folders) {
    if (folderIds.has(f.id)) errors.push(`collection ${col.id}: duplicate folder ${f.id}`);
    folderIds.add(f.id);
    for (const s of f.catalogSources || f.sources || []) {
      if (s.catalogId && !defined.has(`${s.type}/${s.catalogId}`)) errors.push(`collection ${col.id}/${f.id}: unknown catalog ${s.type}/${s.catalogId}`);
    }
  }
}

if (warnings.length) console.log("⚠️  " + warnings.join("\n⚠️  "));
if (errors.length) {
  console.error("❌ " + errors.slice(0, 40).join("\n❌ ") + (errors.length > 40 ? `\n… ${errors.length - 40} more` : ""));
  process.exit(1);
}
console.log(`✅ ${manifest.catalogs.length} catalogs, ${totalItems} items, ${collections.length} collections — no duplicates, paging consistent`);
