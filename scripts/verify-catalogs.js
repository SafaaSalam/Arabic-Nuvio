/**
 * Structural verification of the generated addon + collections.  node scripts/verify-catalogs.js
 * Creates empty page-zero stubs when a manifest catalog file is missing.
 * Fails (exit 1) on unreadable JSON, oversized pages, duplicate IDs/prefixes, or invalid collection references/pairs.
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

for (const res of manifest.resources) {
  if (!res || typeof res !== "object" || !Array.isArray(res.idPrefixes)) continue;
  const unique = new Set(res.idPrefixes);
  if (unique.size !== res.idPrefixes.length) {
    errors.push(`Duplicate idPrefix found in resource: ${res.name}`);
  }
}

for (const cat of manifest.catalogs) {
  defined.add(`${cat.type}/${cat.id}`);
  const hasSkip = Array.isArray(cat.extra) && cat.extra.some((e) => e.name === "skip");
  const size = cat.pageSize || 100;
  const first = path.join(ADDON, "catalog", cat.type, `${cat.id}.json`);
  if (!fs.existsSync(first)) {
    fs.mkdirSync(path.dirname(first), { recursive: true });
    fs.writeFileSync(first, JSON.stringify({ metas: [] }, null, 2) + "\n");
    console.warn(`Created missing empty catalog stub: ${path.relative(ROOT, first)}`);
  }

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

  const MIXED_DISCOVERY = new Set(["arabic_latest_additions", "arabic_trending_now", "arabic_top_10_week"]);
  const seen = new Map();
  for (const m of all) {
    if (!m.id || !m.name || !m.poster) { errors.push(`${cat.id}: item without id/name/poster (${m.id})`); continue; }
    if (!MIXED_DISCOVERY.has(cat.id) && m.type !== cat.type) errors.push(`${cat.id}: item ${m.id} has type ${m.type}`);
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

for (const prefix of manifest.idPrefixes || []) {
  if (typeof prefix !== "string" || !prefix.endsWith("_")) continue;
  const provider = prefix === "cine_"
    ? "cinemana"
    : prefix.slice(0, -1).replace(/[^a-z0-9]/gi, "").toLowerCase();
  const collection = collections.find(col => col.id === `${provider}-collection`);
  const collectionCatalogs = new Set(
    (collection && collection.folders || []).flatMap(folder =>
      (folder.catalogSources || []).map(source => `${source.type}:${source.catalogId}`)
    )
  );
  for (const type of ["movie", "series"]) {
    const catalogId = `src_${provider}_${type === "movie" ? "movies" : "series"}`;
    if (!defined.has(`${type}/${catalogId}`)) errors.push(`Missing ${type} catalog for idPrefix ${prefix}: ${catalogId}`);
    if (!collectionCatalogs.has(`${type}:${catalogId}`)) {
      errors.push(`Collection ${provider}-collection is missing ${type} catalog tab: ${catalogId}`);
    }
  }
}

if (warnings.length) console.log("⚠️  " + warnings.join("\n⚠️  "));
if (errors.length) {
  console.error("❌ " + errors.slice(0, 40).join("\n❌ ") + (errors.length > 40 ? `\n… ${errors.length - 40} more` : ""));
  process.exit(1);
}
console.log(`✅ ${manifest.catalogs.length} catalogs, ${totalItems} items, ${collections.length} collections — no duplicates, paging consistent`);
console.log("All manifests, catalogs, and collections verified successfully.");
