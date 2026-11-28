/**
 * Structural verification of the generated addon + collections.  node scripts/verify-catalogs.js
 * Creates empty page-zero stubs when a manifest catalog file is missing.
 * Fails (exit 1) on unreadable JSON, oversized pages, duplicate IDs/prefixes, or invalid collection references/pairs.
 * Empty catalog files may stay available to collection links without being declared in the manifest.
 */
const fs = require("fs");
const path = require("path");
const { keysOf } = require("./lib/store.js");

const ROOT = path.resolve(__dirname, "..");
const ADDON = path.join(ROOT, "addon");
const errors = [];
const warnings = [];
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, ""));
const catalogMetas = (type, id) => {
  const filePath = path.join(ADDON, "catalog", type, `${id}.json`);
  if (!fs.existsSync(filePath)) {
    errors.push(`Missing collection catalog file: ${type}/${id}`);
    return null;
  }
  try {
    const metas = readJson(filePath).metas;
    if (!Array.isArray(metas)) {
      errors.push(`${filePath}: metas not an array`);
      return null;
    }
    return metas;
  } catch (e) {
    errors.push(`${filePath}: invalid JSON`);
    return null;
  }
};

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
      if (!s.catalogId) continue;
      const key = `${s.type}/${s.catalogId}`;
      if (!defined.has(key)) {
        const metas = catalogMetas(s.type, s.catalogId);
        if (metas && metas.length > 0) {
          errors.push(`collection ${col.id}/${f.id}: populated catalog is missing from manifest: ${s.type}/${s.catalogId}`);
        }
      }
    }
  }
}

for (const prefix of manifest.idPrefixes || []) {
  if (typeof prefix !== "string" || !prefix.endsWith("_")) continue;
  const providerPrefix = prefix === "cine_"
    ? "cinemana"
    : prefix.slice(0, -1).replace(/[^a-z0-9]/gi, "").toLowerCase();
  const canonicalProvider = {
    alooy: "alooytv",
    animephoenix: "anime-phoenix",
    faselhd2: "fasselhd",
  }[providerPrefix] || providerPrefix;
  const sourceKey = canonicalProvider.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const collection = collections.find(col => col.id === `${canonicalProvider}-collection`);
  const collectionCatalogs = new Set(
    (collection && collection.folders || []).flatMap(folder =>
      (folder.catalogSources || []).map(source => `${source.type}:${source.catalogId}`)
    )
  );
  for (const type of ["movie", "series"]) {
    const catalogId = `src_${sourceKey}_${type === "movie" ? "movies" : "series"}`;
    const metas = catalogMetas(type, catalogId);
    if (metas && metas.length > 0 && !defined.has(`${type}/${catalogId}`)) {
      errors.push(`Populated ${type} catalog missing from manifest for idPrefix ${prefix}: ${catalogId}`);
    }
    if (!collectionCatalogs.has(`${type}:${catalogId}`)) {
      errors.push(`Collection ${canonicalProvider}-collection is missing ${type} catalog tab: ${catalogId}`);
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
