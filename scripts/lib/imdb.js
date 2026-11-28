/**
 * IMDb ID Resolution & Cinemeta/TMDB Metadata Enrichment
 *
 * Maps scraped catalog items to standardized IMDb IDs (tt...) and enriches
 * posters, backgrounds, titles, release years, descriptions, ratings, and
 * series episode lists (imdbId:season:episode) via IMDb + Cinemeta + TMDB.
 *
 * Persists all resolved mappings in data/imdb-cache.json so subsequent syncs
 * are instant and incremental.
 */
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const CACHE_PATH = path.join(ROOT_DIR, "data", "imdb-cache.json");
const TMDB_API_KEY = process.env.TMDB_API_KEY || "8265bd1679663a7ea12ac168da84d2e8";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

let _cache = null;
function loadCache() {
  if (_cache) return _cache;
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    _cache = {
      titleMap: raw.titleMap || {},
      metaMap: raw.metaMap || {}
    };
  } catch (_) {
    _cache = { titleMap: {}, metaMap: {} };
  }
  return _cache;
}

function saveCache() {
  if (!_cache) return;
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(_cache), "utf8");
  } catch (_) {}
}

async function fetchJson(url, timeoutMs = 5000) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res || !res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

function extractYear(str) {
  const m = String(str || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? m[1] : null;
}

function cleanSearchCandidates(rawName) {
  const s = String(rawName || "").trim();
  if (!s) return [];
  const parts = s.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
  const candidates = [];
  // Prefer English / Latin part first when bilingual "Arabic | English"
  const latin = parts.filter((p) => /[a-zA-Z]{2,}/.test(p));
  const other = parts.filter((p) => !/[a-zA-Z]{2,}/.test(p));
  for (const p of [...latin, ...other]) {
    let c = p
      .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
      .replace(/(?:فيلم|مسلسل|انمي|أنمي|برنامج|حلقة|الحلقة|الحلقه|موسم|الموسم|مترجم[ةه]?|مدبلج[ةه]?|اون\s*لاين|اونلاين|مشاهدة|مشاهده|تحميل|كامل[ةه]?|حصرياً?|جديد)/gi, " ")
      .replace(/\b(?:1080p|720p|480p|360p|2160p|4K|HD|WEB-DL|WEBRip|BluRay|DVDRip|HDRip|BRRip|HC|SUBBED|DUBBED|EP?\s*\d+|S\d{1,2}E?\d{0,3}|Season\s*\d+)\b/gi, " ")
      .replace(/\b(19\d{2}|20\d{2})\b/g, " ")
      .replace(/[-–—_:]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (c.length >= 2 && !candidates.includes(c)) candidates.push(c);
  }
  return candidates;
}

function norm(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").trim();
}

function titleMatches(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  const wa = new Set(na.split(" ").filter((w) => w.length > 1));
  const wb = nb.split(" ").filter((w) => w.length > 1);
  if (wa.size === 0 || wb.length === 0) return false;
  const overlap = wb.filter((w) => wa.has(w)).length;
  return overlap / Math.max(wa.size, wb.length) >= 0.7;
}

async function lookupImdbSuggestion(query, type, year) {
  const qSlug = encodeURIComponent(query.toLowerCase().trim());
  const data = await fetchJson(`https://v3.sg.media-imdb.com/suggestion/x/${qSlug}.json`, 4500);
  if (!data || !Array.isArray(data.d)) return null;
  const wantSeries = type === "series";
  const validQids = wantSeries
    ? new Set(["tvSeries", "tvMiniSeries", "tvSpecial"])
    : new Set(["movie", "tvMovie", "short"]);

  let best = null;
  let bestScore = -1;
  for (const d of data.d) {
    if (!d || !/^tt\d+$/i.test(d.id || "")) continue;
    if (d.qid && !validQids.has(d.qid)) continue;
    if (!titleMatches(query, d.l)) continue;
    let score = norm(query) === norm(d.l) ? 10 : 5;
    if (year && d.y) {
      const diff = Math.abs(parseInt(year, 10) - parseInt(d.y, 10));
      if (diff === 0) score += 6;
      else if (diff <= 1) score += 3;
      else if (diff > 3) score -= 4;
    }
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best && bestScore >= 5 ? best.id.toLowerCase() : null;
}

async function lookupTmdbImdb(query, type, year) {
  const tType = type === "series" ? "tv" : "movie";
  const yParam = year ? (tType === "movie" ? `&year=${year}` : `&first_air_date_year=${year}`) : "";
  const search = await fetchJson(
    `https://api.themoviedb.org/3/search/${tType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}${yParam}`,
    4500
  );
  const first = search && Array.isArray(search.results) ? search.results[0] : null;
  if (!first || !first.id) return null;
  if (!titleMatches(query, first.title || first.name || first.original_title || first.original_name)) return null;
  const ext = await fetchJson(`https://api.themoviedb.org/3/${tType}/${first.id}/external_ids?api_key=${TMDB_API_KEY}`, 4500);
  if (ext && /^tt\d+$/i.test(ext.imdb_id || "")) {
    return ext.imdb_id.toLowerCase();
  }
  return null;
}

// Items whose source already gives a TMDB id (e.g. FlixMomo "flixmomo_<tmdbId>") map to IMDb with
// one exact lookup instead of a fuzzy title search.
function tmdbIdOf(item) {
  if (item.tmdb_id && /^\d+$/.test(String(item.tmdb_id))) return String(item.tmdb_id);
  const m = String(item.id || "").match(/^flixmomo_(\d+)$/);
  return m ? m[1] : null;
}

async function lookupImdbByTmdbId(tmdbId, type) {
  const tType = type === "series" ? "tv" : "movie";
  const ext = await fetchJson(`https://api.themoviedb.org/3/${tType}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`, 4500);
  return ext && /^tt\d+$/i.test(ext.imdb_id || "") ? ext.imdb_id.toLowerCase() : null;
}

async function fetchCinemeta(imdbId, type) {
  const cache = loadCache();
  const cType = type === "series" ? "series" : "movie";
  const key = `${imdbId}|${cType}`;
  if (cache.metaMap[key]) return cache.metaMap[key];

  const res = await fetchJson(`https://v3-cinemeta.strem.io/meta/${cType}/${imdbId}.json`, 5000);
  if (!res || !res.meta || !res.meta.id) return null;
  const m = res.meta;
  const meta = {
    id: imdbId,
    imdb_id: imdbId,
    type: cType,
    name: m.name || undefined,
    poster: m.poster || undefined,
    background: m.background || m.poster || undefined,
    description: m.description || undefined,
    releaseInfo: m.releaseInfo || (m.year ? String(m.year) : undefined),
    imdbRating: m.imdbRating ? String(m.imdbRating) : undefined,
  };
  if (cType === "series" && Array.isArray(m.videos) && m.videos.length > 0) {
    meta.videos = m.videos
      .filter((v) => v && v.season != null && v.episode != null)
      .slice(0, 500)
      .map((v) => ({
        id: `${imdbId}:${v.season}:${v.episode}`,
        title: v.name || v.title || `Episode ${v.episode}`,
        season: Number(v.season),
        episode: Number(v.episode),
        thumbnail: v.thumbnail || m.poster,
        released: v.released || undefined,
      }));
  }
  cache.metaMap[key] = meta;
  return meta;
}

function applyEnrichment(item, imdbId, cm) {
  const out = Object.assign({}, item, {
    id: imdbId,
    imdb_id: imdbId,
  });
  if (cm) {
    if (cm.poster) out.poster = cm.poster;
    if (cm.background) {
      out.background = cm.background;
      out.landscapePoster = cm.background;
    }
    if (cm.description && (!out.description || out.description === out.name)) out.description = cm.description;
    if (cm.releaseInfo && !out.releaseInfo) out.releaseInfo = cm.releaseInfo;
    if (cm.imdbRating && !out.imdbRating) out.imdbRating = cm.imdbRating;
    if (cm.name && !/[a-zA-Z]{2,}/.test(out.name || "")) {
      out.name = `${out.name} | ${cm.name}`;
    } else if (cm.name && /^[^|]+$/.test(out.name || "") && out.name.length > 60) {
      out.name = cm.name;
    }
  }
  return out;
}

/**
 * Enriches an array of catalog items with IMDb IDs and Cinemeta metadata.
 * Uses data/imdb-cache.json for instant cached lookups and performs up to
 * `budget.remaining` live lookups.
 */
async function enrichItems(items, budget = { remaining: 100 }, idMap = null) {
  const cache = loadCache();
  const out = [];
  const MISS_TTL_MS = 7 * 24 * 3600 * 1000;
  // Exact TMDB-id lookups are cheap and never wrong, so they get their own allowance (also used for tail pages).
  if (typeof budget.tmdbRemaining !== "number") budget.tmdbRemaining = 0;

  for (const item of items) {
    if (!item || !item.id || !item.name) continue;
    const type = item.type === "series" ? "series" : "movie";
    const existingImdb = /^tt\d+$/i.test(item.id) ? item.id.toLowerCase() : (item.imdb_id && /^tt\d+$/i.test(item.imdb_id) ? item.imdb_id.toLowerCase() : null);

    if (existingImdb) {
      let cm = cache.metaMap[`${existingImdb}|${type}`] || null;
      if (!cm && budget.remaining > 0) {
        budget.remaining--;
        cm = await fetchCinemeta(existingImdb, type);
      }
      if (idMap && item.id !== existingImdb) idMap.set(item.id, existingImdb);
      out.push(applyEnrichment(item, existingImdb, cm));
      continue;
    }

    const candidates = cleanSearchCandidates(item.name);
    const year = item.releaseInfo ? extractYear(item.releaseInfo) : extractYear(item.name);
    let resolvedId = null;

    const tmdbId = tmdbIdOf(item);
    if (tmdbId) {
      const tKey = `tmdb|${type}|${tmdbId}`;
      const cached = cache.titleMap[tKey];
      if (typeof cached === "string") resolvedId = cached;
      else if (!(cached && cached.ts && Date.now() - cached.ts < MISS_TTL_MS) && budget.tmdbRemaining > 0) {
        budget.tmdbRemaining--;
        const found = await lookupImdbByTmdbId(tmdbId, type);
        cache.titleMap[tKey] = found || { ts: Date.now() };
        resolvedId = found;
      }
    }

    for (const q of resolvedId ? [] : candidates) {
      const cacheKey = `${type}|${norm(q)}|${year || ""}`;
      const cached = cache.titleMap[cacheKey];
      if (cached !== undefined) {
        if (cached && typeof cached === "string") {
          resolvedId = cached;
          break;
        }
        if (cached && cached.ts && Date.now() - cached.ts < MISS_TTL_MS) {
          continue;
        }
      }
      if (budget.remaining <= 0) continue;
      budget.remaining--;
      let found = await lookupImdbSuggestion(q, type, year);
      if (!found) {
        found = await lookupTmdbImdb(q, type, year);
      }
      if (found) {
        cache.titleMap[cacheKey] = found;
        resolvedId = found;
        break;
      } else {
        cache.titleMap[cacheKey] = { ts: Date.now() };
      }
    }

    if (resolvedId) {
      if (idMap) idMap.set(item.id, resolvedId);
      const cm = await fetchCinemeta(resolvedId, type);
      out.push(applyEnrichment(item, resolvedId, cm));
    } else {
      out.push(item);
    }
  }
  return out;
}

function getCachedMeta(imdbId, type) {
  const cache = loadCache();
  return cache.metaMap[`${imdbId.toLowerCase()}|${type === "series" ? "series" : "movie"}`] || null;
}

module.exports = {
  loadCache,
  saveCache,
  enrichItems,
  fetchCinemeta,
  getCachedMeta,
  cleanSearchCandidates,
};
