/**
 * Auto-Sync Script for Arabic Nuvio (Cinemana Edition)
 *
 * Fetches source metadata & logos from:
 *   - https://github.com/Abodabodd/re-3arabi (repo.json, builds/plugins.json, cinemana/build.gradle.kts)
 * And live catalogs, dynamic groups, posters & streams from:
 *   - https://cinemana.shabakaty.cc/api/android (with automatic fallback & cache persistence in data/cinemana-seed.json
 *     when running on GitHub Actions outside Iraq/Earthlink network)
 *
 * Generates:
 *   1. manifest.json (Nuvio JS Provider Manifest)
 *   2. addon/manifest.json + addon/catalog/{type}/{id}.json + addon/meta/... + addon/stream/...
 *   3. nuvio-collections.json (Nuvio Collections JSON - bilingual Arabic & English, using source images only)
 *   4. repo.json + plugins.json (CloudStream DEX bridge for NuvioTV)
 */

const fs = require("fs");
const path = require("path");
const store = require("./lib/store.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const ADDON_DIR = path.join(ROOT_DIR, "addon");
const SEED_PATH = path.join(ROOT_DIR, "data", "cinemana-seed.json");

const RE3ARABI_RAW_MAIN = "https://raw.githubusercontent.com/Abodabodd/re-3arabi/refs/heads/main";
const RE3ARABI_RAW_BUILDS = "https://raw.githubusercontent.com/Abodabodd/re-3arabi/refs/heads/builds";
const CINEMANA_BASE_URL = "https://cinemana.shabakaty.cc";
const CINEMANA_API = `${CINEMANA_BASE_URL}/api/android`;
const ADDON_ID = "org.nuvio.arabic.cinemana";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Bilingual translations for known Cinemana Dynamic Group titles
const GROUP_TRANSLATIONS = {
  "يعرض حاليا تركي": "Currently Airing Turkish",
  "الأفلام المميزة": "Featured Movies",
  "المسلسلات المميزة": "Featured Series",
  "4K أفلام": "4K Movies",
  "سلسلة أفلام حديقة الآثمين": "Garden of Sinners Movies",
  "4K المسلسلات الاكثر شعبية": "4K Most Popular Series",
  "4K المهمة المستحيلة": "4K Mission: Impossible",
  "4K عالم مارفل": "4K Marvel Universe",
  "4K جيمس بوند": "4K James Bond",
  "أحدث المسلسلات الآسيوية": "Latest Asian Series",
  "احدث المسلسلات": "Latest Series",
  "أحدث المسلسلات": "Latest Series"
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url, timeoutMs = 4000) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json, text/plain, */*"
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return await res.json();
  } catch (err) {
    return null;
  }
}

async function fetchText(url, timeoutMs = 5000) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return await res.text();
  } catch (err) {
    return null;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

// Only touches the file when content really changed -> no pointless commits every 15 minutes.
function writeJson(filePath, data, pretty = true) {
  return store.writeJsonIfChanged(filePath, data, pretty);
}

function loadSeedData() {
  if (!fs.existsSync(SEED_PATH)) {
    return {
      banner: [],
      videoGroups: { groups: [] },
      newlyAdded: [],
      staticSections: {},
      itemsById: {},
      fixtures: { search: {}, videoSeason: {}, transcoddedFiles: {}, allVideoInfo: {} }
    };
  }
  return JSON.parse(fs.readFileSync(SEED_PATH, "utf8").replace(/^\uFEFF/, ""));
}

function extractImdbId(str) {
  if (!str) return null;
  const m = String(str).match(/(tt\d{5,12})/i);
  return m ? m[1].toLowerCase() : null;
}

function extractMalId(str) {
  if (!str) return null;
  const m = String(str).match(/myanimelist\.net\/anime\/(\d+)/i);
  return m ? m[1] : null;
}

function formatItemTitle(item) {
  const ar = item.ar_title ? String(item.ar_title).trim() : "";
  const en = item.en_title ? String(item.en_title).trim() : "";
  if (ar && en && ar.toLowerCase() !== en.toLowerCase()) {
    return `${ar} | ${en}`;
  }
  return ar || en || "بدون عنوان | Untitled";
}

function formatItemDescription(item) {
  const ar = item.ar_content ? String(item.ar_content).trim() : "";
  const en = item.en_content ? String(item.en_content).trim() : "";
  if (ar && en && ar !== en) {
    return `${ar}\n\n${en}`;
  }
  if (ar || en) return ar || en;
  const genres = extractGenres(item);
  const yearStr = item.year ? ` (${item.year})` : "";
  return `${formatItemTitle(item)}${yearStr}${genres.length ? " • " + genres.join("، ") : ""}`;
}

function extractGenres(item) {
  if (!Array.isArray(item.categories)) return [];
  const genres = [];
  for (const cat of item.categories) {
    if (!cat) continue;
    const ar = cat.ar_title ? String(cat.ar_title).trim() : "";
    const en = cat.en_title ? String(cat.en_title).trim() : "";
    if (en.toLowerCase() === "uncategorized") continue;
    const label = (ar && en && ar !== en) ? `${ar} | ${en}` : (ar || en);
    if (label && !genres.includes(label)) {
      genres.push(label);
    }
  }
  return genres;
}

function toMetaPreview(item, fallbackType) {
  if (!item || !item.nb) return null;
  const nb = String(item.nb).trim();
  const kind = parseInt(item.kind, 10);
  const resolvedType = kind === 2 ? "series" : (kind === 1 ? "movie" : (fallbackType || "movie"));
  const imdbId = extractImdbId(item.imdbUrlRef);

  // Use standard IMDb ID when available so Nuvio's TMDB/Cinemeta & JS Provider work seamlessly,
  // or cine_{nb} for items without IMDb ID (handled by our static /meta and /stream endpoints + JS provider).
  const id = imdbId || `cine_${nb}`;
  const poster = item.imgObjUrl || item.imgThumbObjUrl || item.img || null;
  const rating = item.stars && !isNaN(parseFloat(item.stars)) ? String(parseFloat(item.stars).toFixed(1)) : undefined;

  return {
    id,
    imdb_id: imdbId || undefined,
    slug: `cinemana-${nb}`,
    type: resolvedType,
    name: formatItemTitle(item),
    poster: poster,
    posterShape: "poster",
    background: poster,
    landscapePoster: poster,
    description: formatItemDescription(item),
    releaseInfo: item.year ? String(item.year).trim() : undefined,
    imdbRating: rating,
    genres: extractGenres(item)
  };
}

/**
 * Build detailed Meta + Stream files for non-IMDb items (`cine_{nb}`)
 * so clicking them in Nuvio loads full details, cast, episodes, and playable streams.
 */
async function buildCustomItemMetaAndStreams(nb, defaultType, cinemanaLogo, isCinemanaOnline, seedData) {
  let details = null;
  if (isCinemanaOnline) {
    details = await fetchJson(`${CINEMANA_API}/allVideoInfo/id/${nb}`, 3000);
    await sleep(150);
  }
  if (!details || !details.nb) {
    details = (seedData.allVideoInfo && seedData.allVideoInfo[nb]) ||
              (seedData.fixtures && seedData.fixtures.allVideoInfo && seedData.fixtures.allVideoInfo[nb]) ||
              (seedData.itemsById && seedData.itemsById[nb]);
  }
  if (!details || !details.nb) return;

  const kind = parseInt(details.kind, 10);
  const type = kind === 2 ? "series" : (defaultType || "movie");
  const id = `cine_${nb}`;
  const imdbId = extractImdbId(details.imdbUrlRef);
  const malId = extractMalId(details.imdbUrlRef);
  const poster = details.imgObjUrl || details.img || cinemanaLogo;
  const name = formatItemTitle(details);
  const description = formatItemDescription(details);
  const genres = extractGenres(details);
  const rating = details.stars && !isNaN(parseFloat(details.stars)) ? String(parseFloat(details.stars).toFixed(1)) : undefined;

  const cast = Array.isArray(details.actorsInfo)
    ? details.actorsInfo.map(a => a && a.name ? String(a.name).trim() : null).filter(Boolean)
    : [];
  const director = Array.isArray(details.directorsInfo)
    ? details.directorsInfo.map(d => d && d.name ? String(d.name).trim() : null).filter(Boolean)
    : [];

  async function buildStreamsForVideoNb(videoNb, epLabel) {
    let trans = null;
    if (isCinemanaOnline) {
      trans = await fetchJson(`${CINEMANA_API}/transcoddedFiles/id/${videoNb}`, 3000);
      await sleep(100);
    }
    if (!Array.isArray(trans) || trans.length === 0) {
      trans = (seedData.fixtures && seedData.fixtures.transcoddedFiles && seedData.fixtures.transcoddedFiles[videoNb]) || [];
    }
    if (!Array.isArray(trans) || trans.length === 0) return [];

    let vInfo = (videoNb === nb) ? details : null;
    if (!vInfo && isCinemanaOnline) {
      vInfo = await fetchJson(`${CINEMANA_API}/allVideoInfo/id/${videoNb}`, 3000);
    }
    if (!vInfo) {
      vInfo = (seedData.fixtures && seedData.fixtures.allVideoInfo && seedData.fixtures.allVideoInfo[videoNb]) || details;
    }

    const subs = [];
    if (vInfo && Array.isArray(vInfo.translations)) {
      vInfo.translations.forEach((sub, idx) => {
        if (sub && sub.file) {
          subs.push({
            id: `cine-sub-${videoNb}-${idx}`,
            url: String(sub.file),
            lang: sub.type || "ar"
          });
        }
      });
    }
    return trans.slice().reverse().map(v => {
      if (!v || !v.videoUrl) return null;
      const res = v.resolution || "HD";
      return {
        name: `Shabakaty Cinemana (🇮🇶) - ${res}`,
        title: `${name}${epLabel ? " " + epLabel : ""} • ${res} (${String(v.container || "MP4").toUpperCase()})`,
        url: String(v.videoUrl),
        subtitles: subs,
        behaviorHints: {
          bingeGroup: `cinemana-${res}`
        }
      };
    }).filter(Boolean);
  }

  const metaObj = {
    id,
    type,
    name,
    imdb_id: imdbId || undefined,
    mal_id: malId || undefined,
    poster,
    posterShape: "poster",
    background: poster,
    landscapePoster: poster,
    logo: cinemanaLogo,
    description,
    releaseInfo: details.year ? String(details.year) : undefined,
    imdbRating: rating,
    genres,
    cast,
    director
  };

  if (type === "series") {
    let episodesRaw = null;
    if (isCinemanaOnline) {
      episodesRaw = await fetchJson(`${CINEMANA_API}/videoSeason/id/${nb}`, 3000);
    }
    if (!Array.isArray(episodesRaw)) {
      episodesRaw = (seedData.fixtures && seedData.fixtures.videoSeason && seedData.fixtures.videoSeason[nb]) || [
        {
          nb: nb,
          en_title: details.en_title,
          ar_title: details.ar_title,
          season: details.season || "1",
          episodeNummer: details.episodeNummer || "1",
          imgObjUrl: poster
        }
      ];
    }

    const videos = [];
    if (Array.isArray(episodesRaw)) {
      const sortedEps = episodesRaw.slice().sort((a, b) => {
        const sA = parseInt(a.season, 10) || 1;
        const sB = parseInt(b.season, 10) || 1;
        if (sA !== sB) return sA - sB;
        return (parseInt(a.episodeNummer, 10) || 1) - (parseInt(b.episodeNummer, 10) || 1);
      });

      for (const ep of sortedEps.slice(0, 20)) {
        if (!ep || !ep.nb) continue;
        const sNum = parseInt(ep.season, 10) || 1;
        const eNum = parseInt(ep.episodeNummer, 10) || 1;
        const videoId = `cine_${ep.nb}`;
        const epStreams = await buildStreamsForVideoNb(String(ep.nb), `S${String(sNum).padStart(2, "0")}E${String(eNum).padStart(2, "0")}`);
        videos.push({
          id: videoId,
          title: `الموسم ${sNum} - الحلقة ${eNum} | Season ${sNum} Episode ${eNum}`,
          season: sNum,
          episode: eNum,
          thumbnail: ep.imgObjUrl || poster,
          overview: formatItemDescription(ep) || description,
          streams: epStreams
        });
        writeJson(path.join(ADDON_DIR, "stream", "series", `${videoId}.json`), { streams: epStreams });
      }
    }
    metaObj.videos = videos;
  } else {
    const movieStreams = await buildStreamsForVideoNb(nb, "");
    writeJson(path.join(ADDON_DIR, "stream", "movie", `${id}.json`), { streams: movieStreams });
  }

  writeJson(path.join(ADDON_DIR, "meta", type, `${id}.json`), { meta: metaObj });
}

async function main() {
  console.log("🔄 Syncing from https://github.com/Abodabodd/re-3arabi (cinemana) and https://cinemana.shabakaty.cc ...");

  const seedData = loadSeedData();

  // 1. Fetch source metadata from Abodabodd/re-3arabi
  const sourceRepoJson = await fetchJson(`${RE3ARABI_RAW_MAIN}/repo.json`, 6000);
  const sourcePluginsJson = await fetchJson(`${RE3ARABI_RAW_BUILDS}/plugins.json`, 6000);
  const sourceBuildGradle = await fetchText(`${RE3ARABI_RAW_MAIN}/cinemana/build.gradle.kts`, 6000);

  const cinemanaPluginEntry = Array.isArray(sourcePluginsJson)
    ? sourcePluginsJson.find(p => p && String(p.internalName).toLowerCase() === "cinemana")
    : null;

  // Extract official logos and metadata strictly from the main source (Abodabodd/re-3arabi)
  const repoIconUrl = (sourceRepoJson && sourceRepoJson.iconUrl)
    ? sourceRepoJson.iconUrl
    : `${RE3ARABI_RAW_MAIN}/icon.png`;

  let cinemanaLogoUrl = cinemanaPluginEntry && cinemanaPluginEntry.iconUrl
    ? cinemanaPluginEntry.iconUrl
    : "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTZlAGH56cEnNEL93W3QqZWpUe8XR8i90olTA&s";

  let sourceVersion = cinemanaPluginEntry && cinemanaPluginEntry.version ? cinemanaPluginEntry.version : 4;
  let sourceDescriptionAr = "لا يعمل خارج العراق او اي شبكة غير ايرثلنك";

  if (sourceBuildGradle) {
    const verMatch = sourceBuildGradle.match(/version\s*=\s*(\d+)/);
    if (verMatch) sourceVersion = parseInt(verMatch[1], 10);
    const descMatch = sourceBuildGradle.match(/description\s*=\s*"([^"]+)"/);
    if (descMatch) sourceDescriptionAr = descMatch[1];
    const iconMatch = sourceBuildGradle.match(/iconUrl\s*=\s*"([^"]+)"/);
    if (iconMatch) cinemanaLogoUrl = iconMatch[1];
  }

  const providerVersion = `1.0.${sourceVersion}`;
  const bilingualDescription = `${sourceDescriptionAr} | Shabakaty Cinemana Iraq (Movies, Series & Anime up to 4K with Arabic Subtitles)`;

  // 2. Generate all 42 sequenced Nuvio JS Providers, manifest.json, and plugins.json
  require("./generate-all-providers.js");
  console.log("✅ Wrote root manifest.json and plugins.json (42 sequenced Nuvio JS Providers)");

  // 3. Write CloudStream External Repo bridge (repo.json)
  writeJson(path.join(ROOT_DIR, "repo.json"), {
    name: "Arabic Nuvio | الإضافات العربية الشاملة",
    description: "Comprehensive Arabic Nuvio Providers & Collections — Shabakaty Cinemana, CEE, 3isk, AlooyTv, Akwam, and 36+ Arabic Sources",
    iconUrl: cinemanaLogoUrl,
    manifestVersion: 1,
    pluginLists: [
      "https://raw.githubusercontent.com/SafaaSalam/Arabic-Nuvio/main/plugins.json"
    ]
  });
  console.log("✅ Wrote repo.json");

  // 4. Probe Cinemana API reachability (fast 3.5s check)
  console.log("📡 Checking Cinemana API connectivity (https://cinemana.shabakaty.cc)...");
  const liveGroupsProbe = await fetchJson(`${CINEMANA_API}/videoGroups/lang/ar/level/0`, 3500);
  const isCinemanaOnline = Boolean(liveGroupsProbe && Array.isArray(liveGroupsProbe.groups) && liveGroupsProbe.groups.length > 0);

  if (isCinemanaOnline) {
    console.log("🟢 Cinemana API is reachable! Fetching live catalogs and updating data/cinemana-seed.json...");
    seedData.videoGroups = liveGroupsProbe;
    seedData.updatedAt = new Date().toISOString().slice(0, 10);
  } else {
    console.log("🟡 Cinemana API unreachable or rate-limited from current network; using real captured Cinemana data from data/cinemana-seed.json...");
  }

  const catalogDefinitions = [];
  const catalogDataMap = new Map();
  const customNbToBuild = new Map();

  const PAGE_SIZE = store.PAGE_SIZE;
  const healthReport = {};
  const rowItems = new Map(); // catalogId -> { type, metas }  (used to build the cross-source 'Latest' rows)
  const latestCineNbs = new Set(); // cine_ items on the first page of any row (their meta/streams get refreshed)

  /**
   * Builds one Cinemana-API catalog row.
   *   rawItems : items we already have for page 1 (live response or captured seed)
   *   pager(n) : optional async (n>=2) -> raw array | null  (null = network problem, [] = end)
   */
  async function processCatalog(id, type, arTitle, enTitle, emoji, rawItems, showInHome = true, pager = null) {
    const toPreviews = (arr) => {
      const out = [];
      for (const raw of (arr || [])) {
        if (raw && raw.nb) {
          seedData.itemsById = seedData.itemsById || {};
          if (!seedData.itemsById[String(raw.nb)]) seedData.itemsById[String(raw.nb)] = raw;
        }
        const preview = toMetaPreview(raw, type);
        if (!preview || preview.type !== type) continue;
        out.push(preview);
      }
      return out;
    };

    const st = store.loadStore(id, type);
    const fetchPage = async (n) => {
      if (n === 1) return { ok: true, items: toPreviews(rawItems), end: false };
      if (!pager || !isCinemanaOnline) return { ok: false };
      const arr = await pager(n);
      if (!Array.isArray(arr)) return { ok: false };
      await sleep(120);
      return { ok: true, items: toPreviews(arr), end: arr.length === 0 };
    };
    const res = await store.crawl(st, fetchPage, { forwardPages: 1, backfillPages: pager ? 8 : 0, paginated: Boolean(pager) });
    store.saveStore(st);
    const metas = st.items;
    if (metas.length === 0) return null;

    for (const m of metas.slice(0, PAGE_SIZE)) {
      if (m.id.startsWith("cine_") && m.slug) latestCineNbs.add(m.slug.replace("cinemana-", ""));
    }
    for (const m of metas) {
      if (m.id.startsWith("cine_") && m.slug) customNbToBuild.set(m.slug.replace("cinemana-", ""), m.type);
    }

    const coverImage = metas.find(m => m.poster) ? metas.find(m => m.poster).poster : null;
    const englishName = enTitle || arTitle;
    catalogDefinitions.push({
      type,
      id,
      name: englishName,
      pageSize: PAGE_SIZE,
      extra: [{ name: "skip", isRequired: false }],
      showInHome
    });
    store.writePagedCatalog(type, id, metas);
    rowItems.set(id, { type, metas });
    healthReport[id] = { provider: "cinemana", items: metas.length, reachable: res.reachable, backfillDone: res.done, lastOk: st.updatedAt };

    const info = {
      id,
      type,
      name: englishName,
      arTitle,
      enTitle,
      emoji,
      coverImage: coverImage || cinemanaLogoUrl,
      heroBackdrop: (metas[0] && metas[0].background) || coverImage || cinemanaLogoUrl,
      count: metas.length
    };
    catalogDataMap.set(`${type}/${id}`, info);
    console.log(`   📦 Catalog [${type}] ${id} (${englishName}): ${metas.length} items`);
    return info;
  }

  // 4.1 Banner (المميز | Featured)
  let bannerRaw = isCinemanaOnline ? await fetchJson(`${CINEMANA_API}/banner/level/0`, 3500) : null;
  if (Array.isArray(bannerRaw) && bannerRaw.length > 0) {
    seedData.banner = bannerRaw;
  } else {
    bannerRaw = seedData.banner || [];
  }

  if (Array.isArray(bannerRaw) && bannerRaw.length > 0) {
    await processCatalog(
      "cinemana_banner_movies",
      "movie",
      "المميز - أفلام سينمانا",
      "Featured Movies (Cinemana)",
      "🌟",
      bannerRaw.filter(x => parseInt(x && x.kind, 10) === 1),
      true
    );
    await processCatalog(
      "cinemana_banner_series",
      "series",
      "المميز - مسلسلات سينمانا",
      "Featured Series (Cinemana)",
      "🌟",
      bannerRaw.filter(x => parseInt(x && x.kind, 10) === 2),
      true
    );
  }

  // 4.2 Dynamic Home Groups (/videoGroups/lang/ar/level/0)
  const groupsResp = seedData.videoGroups;
  const dynamicGroupInfos = [];
  if (groupsResp && Array.isArray(groupsResp.groups)) {
    for (const group of groupsResp.groups) {
      if (!group || !group.title || !Array.isArray(group.content) || group.content.length === 0) continue;
      const groupId = group.groupsID || group.list_id;
      if (!groupId) continue;

      const arTitle = String(group.title).trim();
      const firstCustomEn = group.content[0] && group.content[0].custom_en_title
        ? String(group.content[0].custom_en_title).trim()
        : null;
      const enTitle = GROUP_TRANSLATIONS[arTitle] || firstCustomEn || `Cinemana Group ${groupId}`;

      let combined = [...group.content];
      const groupPager = (n) => fetchJson(`${CINEMANA_API}/videoListPagination/groupID/${groupId}/level/0/itemsPerPage/30/page/${n - 1}/`, 5000);
      if (isCinemanaOnline) {
        await sleep(200);
        const page0 = await fetchJson(`${CINEMANA_API}/videoListPagination/groupID/${groupId}/level/0/itemsPerPage/30/page/0/`, 5000);
        if (Array.isArray(page0)) combined.push(...page0);
      }

      const movieCount = combined.filter(x => parseInt(x && x.kind, 10) === 1).length;
      const seriesCount = combined.filter(x => parseInt(x && x.kind, 10) === 2).length;
      const dominantType = seriesCount > movieCount ? "series" : "movie";
      const emoji = arTitle.includes("4K") ? "💎" : (dominantType === "series" ? "📺" : "🎬");

      const info = await processCatalog(
        `cinemana_group_${groupId}`,
        dominantType,
        arTitle,
        enTitle,
        emoji,
        combined,
        true,
        groupPager
      );
      if (info) dynamicGroupInfos.push(info);
    }
  }

  // 4.3 Newly Added (/newlyVideosItems/level/0/offset/30/page/N/)
  const newlyPager = (n) => fetchJson(`${CINEMANA_API}/newlyVideosItems/level/0/offset/30/page/${n - 1}/`, 5000);
  let newlyCombined = [];
  if (isCinemanaOnline) {
    const newlyPage0 = await fetchJson(`${CINEMANA_API}/newlyVideosItems/level/0/offset/30/page/0/`, 5000);
    if (Array.isArray(newlyPage0) && newlyPage0.length > 0) {
      newlyCombined = newlyPage0;
      seedData.newlyAdded = newlyCombined;
    }
  }
  if (newlyCombined.length === 0) {
    newlyCombined = seedData.newlyAdded || [];
  }

  if (newlyCombined.length > 0) {
    await processCatalog(
      "cinemana_newly_movies",
      "movie",
      "أحدث الإضافات - أفلام",
      "Newly Added Movies",
      "🆕",
      newlyCombined.filter(x => parseInt(x && x.kind, 10) === 1),
      true,
      newlyPager
    );
    await processCatalog(
      "cinemana_newly_series",
      "series",
      "أحدث الإضافات - مسلسلات",
      "Newly Added Series",
      "🆕",
      newlyCombined.filter(x => parseInt(x && x.kind, 10) === 2),
      true,
      newlyPager
    );
  }

  // 4.4 Static Movie & Series Categories from CinemanaProvider.kt
  const staticSections = [
    {
      id: "cinemana_mov_upload_desc",
      type: "movie",
      arTitle: "أفلام - تاريخ الرفع - الأحدث",
      enTitle: "Movies - Latest Uploaded",
      emoji: "🎬",
      url: `${CINEMANA_API}/video/V/2?videoKind=1&langNb=&itemsPerPage=30&pageNumber=@PAGE@&level=0&sortParam=desc`
    },
    {
      id: "cinemana_mov_release_desc",
      type: "movie",
      arTitle: "أفلام - تاريخ الإصدار - الأحدث",
      enTitle: "Movies - Newest Release",
      emoji: "🗓️",
      url: `${CINEMANA_API}/video/V/2?videoKind=1&langNb=&itemsPerPage=30&pageNumber=@PAGE@&level=0&sortParam=r_desc`
    },
    {
      id: "cinemana_mov_views_desc",
      type: "movie",
      arTitle: "أفلام - الأكثر مشاهدة",
      enTitle: "Movies - Most Viewed",
      emoji: "🔥",
      url: `${CINEMANA_API}/video/V/2?videoKind=1&langNb=&itemsPerPage=30&pageNumber=@PAGE@&level=0&sortParam=views_desc`
    },
    {
      id: "cinemana_mov_stars_desc",
      type: "movie",
      arTitle: "أفلام - أعلى تقييم IMDb",
      enTitle: "Movies - Top IMDb Rated",
      emoji: "⭐",
      url: `${CINEMANA_API}/video/V/2?videoKind=1&langNb=&itemsPerPage=30&pageNumber=@PAGE@&level=0&sortParam=stars_desc`
    },
    {
      id: "cinemana_ser_upload_desc",
      type: "series",
      arTitle: "مسلسلات - تاريخ الرفع - الأحدث",
      enTitle: "Series - Latest Uploaded",
      emoji: "📺",
      url: `${CINEMANA_API}/video/V/2?videoKind=2&langNb=&itemsPerPage=30&pageNumber=@PAGE@&level=0&sortParam=desc`
    },
    {
      id: "cinemana_ser_release_desc",
      type: "series",
      arTitle: "مسلسلات - تاريخ الإصدار - الأحدث",
      enTitle: "Series - Newest Release",
      emoji: "🗓️",
      url: `${CINEMANA_API}/video/V/2?videoKind=2&langNb=&itemsPerPage=30&pageNumber=@PAGE@&level=0&sortParam=r_desc`
    },
    {
      id: "cinemana_ser_views_desc",
      type: "series",
      arTitle: "مسلسلات - الأكثر مشاهدة",
      enTitle: "Series - Most Viewed",
      emoji: "🔥",
      url: `${CINEMANA_API}/video/V/2?videoKind=2&langNb=&itemsPerPage=30&pageNumber=@PAGE@&level=0&sortParam=views_desc`
    },
    {
      id: "cinemana_ser_stars_desc",
      type: "series",
      arTitle: "مسلسلات - أعلى تقييم IMDb",
      enTitle: "Series - Top IMDb Rated",
      emoji: "⭐",
      url: `${CINEMANA_API}/video/V/2?videoKind=2&langNb=&itemsPerPage=30&pageNumber=@PAGE@&level=0&sortParam=stars_desc`
    }
  ];

  seedData.staticSections = seedData.staticSections || {};
  for (const sec of staticSections) {
    let items = null;
    if (isCinemanaOnline) {
      await sleep(200);
      items = await fetchJson(sec.url.replace("@PAGE@", "0"), 5000);
      if (Array.isArray(items) && items.length > 0) {
        seedData.staticSections[sec.id] = items;
      }
    }
    if (!Array.isArray(items) || items.length === 0) {
      items = seedData.staticSections[sec.id] || [];
    }
    if (Array.isArray(items) && items.length > 0) {
      await processCatalog(sec.id, sec.type, sec.arTitle, sec.enTitle, sec.emoji, items, false,
        (n) => fetchJson(sec.url.replace("@PAGE@", String(n - 1)), 5000));
    }
  }

  // Always ensure our test direct item cine_3129755 has static meta/stream too
  customNbToBuild.set("3129755", "movie");

  // 4.5 Build static meta & stream files for non-IMDb items (`cine_{nb}`)
  // Incremental: items whose meta file already exists are skipped, except those on a first page
  // (new episodes appear there). At most MAX_BUILDS_PER_RUN items are built per run; the rest follow next run.
  const MAX_BUILDS_PER_RUN = parseInt(process.env.MAX_BUILDS_PER_RUN || "150", 10);
  const buildQueue = [];
  for (const [nb, type] of customNbToBuild.entries()) {
    const metaFile = path.join(ADDON_DIR, "meta", type, `cine_${nb}.json`);
    const missing = !fs.existsSync(metaFile);
    if (missing || (isCinemanaOnline && latestCineNbs.has(nb))) buildQueue.push({ nb, type, missing });
  }
  buildQueue.sort((a, b) => Number(b.missing) - Number(a.missing));
  console.log(`🔍 Building static meta & stream files for ${Math.min(buildQueue.length, MAX_BUILDS_PER_RUN)} of ${buildQueue.length} queued Cinemana items (${customNbToBuild.size} total)...`);
  for (const { nb, type } of buildQueue.slice(0, MAX_BUILDS_PER_RUN)) {
    await buildCustomItemMetaAndStreams(nb, type, cinemanaLogoUrl, isCinemanaOnline, seedData);
  }

  // Persist updated seed data if we fetched new data from Cinemana
  if (isCinemanaOnline) {
    writeJson(SEED_PATH, seedData, false);
    console.log("💾 Updated data/cinemana-seed.json with fresh Cinemana API snapshot");
  }

  // 4.6 Scrape Priority #2..#42 Providers (CEE, 3isk, AlooyTv, Akwam, and the rest)
  const { scrapeAllExtraCatalogs } = require("./scrape-extra-catalogs.js");
  const extraData = await scrapeAllExtraCatalogs();
  Object.assign(healthReport, extraData.health);

  const allExtraCatalogs = [
    ...extraData.ceeCatalogs,
    ...extraData.eishkCatalogs,
    ...extraData.alooyCatalogs,
    ...extraData.akwamCatalogs,
    ...extraData.remainingCatalogs
  ];

  const ceeFolders = [];
  const eishkFolders = [];
  const alooyFolders = [];
  const akwamFolders = [];
  const dramaFolders = [];
  const animeFolders = [];
  const sportsFolders = [];

  for (const cat of allExtraCatalogs) {
    if (!cat || !Array.isArray(cat.metas) || cat.metas.length === 0) continue;
    const englishName = cat.enTitle || cat.arTitle;
    catalogDefinitions.push({
      type: cat.type,
      id: cat.id,
      name: englishName,
      pageSize: PAGE_SIZE,
      extra: [{ name: "skip", isRequired: false }],
      showInHome: ["cee", "3isk", "alooytv", "akwam"].includes(cat.providerKey)
    });

    store.writePagedCatalog(cat.type, cat.id, cat.metas);
    rowItems.set(cat.id, { type: cat.type, metas: cat.metas });

    // Write static meta files for custom items so Nuvio can open their detail view and invoke the JS provider
    for (const m of cat.metas) {
      if (!m || !m.id || m.id.startsWith("tt")) continue;
      const safeId = String(m.id).replace(/[^a-zA-Z0-9_\-.]/g, "_");
      const metaObj = {
        id: m.id,
        type: m.type,
        name: m.name,
        poster: m.poster,
        posterShape: "poster",
        background: m.background || m.poster,
        landscapePoster: m.landscapePoster || m.poster,
        logo: cat.logo || cinemanaLogoUrl,
        description: m.description || m.name,
        releaseInfo: m.releaseInfo,
        imdbRating: m.imdbRating
      };
      if (m.type === "series") {
        metaObj.videos = [
          {
            id: `${m.id}:1:1`,
            title: "Episode 1",
            season: 1,
            episode: 1,
            thumbnail: m.poster
          }
        ];
      }
      writeJson(path.join(ADDON_DIR, "meta", m.type, `${safeId}.json`), { meta: metaObj }, false);
    }

    const info = {
      id: cat.id,
      type: cat.type,
      name: englishName,
      arTitle: cat.arTitle,
      enTitle: cat.enTitle,
      emoji: cat.emoji || "🎬",
      logo: cat.logo || cinemanaLogoUrl,
      coverImage: (cat.metas[0] && cat.metas[0].poster) || cat.logo || cinemanaLogoUrl,
      heroBackdrop: (cat.metas[0] && cat.metas[0].background) || (cat.metas[0] && cat.metas[0].poster) || cat.logo || cinemanaLogoUrl,
      count: cat.metas.length
    };
    catalogDataMap.set(`${cat.type}/${cat.id}`, info);
    console.log(`   📦 Extra Catalog [${cat.type}] ${cat.id} (${englishName}): ${cat.metas.length} items`);

    const bigFour = ["cee", "3isk", "alooytv", "akwam"].includes(cat.providerKey);
    const tabTitle = bigFour ? String(info.enTitle).replace(/^(CEE|3isk|AlooyTv|Akwam)\s+/i, "") : info.enTitle;
    const folderObj = {
      id: `folder-${info.id}`,
      title: tabTitle,
      name: tabTitle,
      coverImageUrl: info.coverImage,
      focusGifEnabled: true,
      coverEmoji: info.emoji,
      tileShape: "POSTER",
      hideTitle: false,
      heroBackdropUrl: info.heroBackdrop,
      titleLogoUrl: info.logo,
      sources: [{ provider: "addon", addonId: ADDON_ID, type: info.type, catalogId: info.id }],
      catalogSources: [{ addonId: ADDON_ID, type: info.type, catalogId: info.id }]
    };

    if (cat.providerKey === "cee") ceeFolders.push(folderObj);
    else if (cat.providerKey === "3isk") eishkFolders.push(folderObj);
    else if (cat.providerKey === "alooytv") alooyFolders.push(folderObj);
    else if (cat.providerKey === "akwam") akwamFolders.push(folderObj);
    else if (cat.group === "anime") animeFolders.push(folderObj);
    else if (cat.group === "sports") sportsFolders.push(folderObj);
    else dramaFolders.push(folderObj);
  }

  // 4.7 Cross-source "Latest" rows: round-robin the newest items of every source, de-duplicated across sources
  const LATEST_ROW = /(latest|newly|recent|upload_desc)/;
  const latestInfos = [];
  for (const [type, id, enTitle, arTitle, emoji] of [
    ["movie", "arabic_latest_movies", "Latest Movies — All Sources", "أحدث الأفلام — كل المصادر", "🆕"],
    ["series", "arabic_latest_series", "Latest Series — All Sources", "أحدث المسلسلات — كل المصادر", "🆕"]
  ]) {
    const rows = [...rowItems.entries()].filter(([rid, r]) => r.type === type && LATEST_ROW.test(rid)).map(([, r]) => r.metas);
    const mixed = [];
    for (let rank = 0; rank < 60; rank++) for (const metas of rows) if (metas[rank]) mixed.push(metas[rank]);
    const metas = store.dedupe(mixed).slice(0, 300);
    if (metas.length === 0) continue;
    catalogDefinitions.unshift({ type, id, name: enTitle, pageSize: PAGE_SIZE, extra: [{ name: "skip", isRequired: false }], showInHome: true });
    store.writePagedCatalog(type, id, metas);
    latestInfos.push({ id, type, enTitle, arTitle, emoji, coverImage: metas[0].poster, heroBackdrop: metas[0].background || metas[0].poster, count: metas.length });
    console.log(`   📦 Aggregated [${type}] ${id}: ${metas.length} items from ${rows.length} rows`);
  }

  // 5. Write addon/manifest.json
  const firstBannerPoster = (catalogDataMap.get("movie/cinemana_banner_movies") || {}).heroBackdrop || cinemanaLogoUrl;
  const supportedPrefixes = [
    "cine_", "cee_", "3isk_", "alooy_", "akwam_",
    "tuktukcima_", "lodynet_", "krmzy_", "eseek_", "aia2tv_",
    "5tv_", "aflaam_", "shahidwbas_", "tuniflix_",
    "anim3rb_", "anime4up_", "animerco_", "witanime_", "animephoenix_",
    "replaymatch_"
  ];
  const addonManifest = {
    id: ADDON_ID,
    name: "Arabic Nuvio",
    version: "2.0.0",
    description: "Shabakaty Cinemana, CEE, 3isk, AlooyTv, Akwam & 36+ Arabic Movie, Series, Anime & Live TV Catalogs",
    logo: cinemanaLogoUrl,
    background: firstBannerPoster,
    language: "ar",
    types: ["movie", "series"],
    idPrefixes: supportedPrefixes,
    resources: [
      "catalog",
      {
        name: "meta",
        types: ["movie", "series"],
        idPrefixes: supportedPrefixes
      },
      {
        name: "stream",
        types: ["movie", "series"],
        idPrefixes: ["cine_"]
      }
    ],
    catalogs: catalogDefinitions,
    behaviorHints: {
      configurable: false,
      configurationRequired: false
    },
  };
  writeJson(path.join(ADDON_DIR, "manifest.json"), addonManifest);
  writeJson(path.join(ROOT_DIR, "data", "health.json"), { sources: healthReport });
  console.log(`✅ Wrote addon/manifest.json with ${catalogDefinitions.length} catalogs`);

  // 6. Build nuvio-collections.json sequenced in strict priority order with English-only titles
  function makeFolder(catInfo, tileShape = "POSTER") {
    if (!catInfo) return null;
    return {
      id: `folder-${catInfo.id}`,
      title: catInfo.enTitle,
      name: catInfo.enTitle,
      coverImageUrl: catInfo.coverImage || cinemanaLogoUrl,
      focusGifEnabled: true,
      coverEmoji: catInfo.emoji || "🎬",
      tileShape: tileShape,
      hideTitle: false,
      heroBackdropUrl: catInfo.heroBackdrop || catInfo.coverImage || cinemanaLogoUrl,
      titleLogoUrl: cinemanaLogoUrl,
      sources: [
        {
          provider: "addon",
          addonId: ADDON_ID,
          type: catInfo.type,
          catalogId: catInfo.id
        }
      ],
      catalogSources: [
        {
          addonId: ADDON_ID,
          type: catInfo.type,
          catalogId: catInfo.id
        }
      ]
    };
  }

  // Priority 1: Cinemana Featured, Movies, Series
  const featuredFolders = [
    makeFolder(catalogDataMap.get("movie/cinemana_banner_movies"), "POSTER"),
    makeFolder(catalogDataMap.get("series/cinemana_banner_series"), "POSTER"),
    ...dynamicGroupInfos.map(g => makeFolder(g, "POSTER"))
  ].filter(Boolean);

  const movieFolders = [
    makeFolder(catalogDataMap.get("movie/cinemana_newly_movies"), "POSTER"),
    makeFolder(catalogDataMap.get("movie/cinemana_mov_upload_desc"), "POSTER"),
    makeFolder(catalogDataMap.get("movie/cinemana_mov_release_desc"), "POSTER"),
    makeFolder(catalogDataMap.get("movie/cinemana_mov_views_desc"), "POSTER"),
    makeFolder(catalogDataMap.get("movie/cinemana_mov_stars_desc"), "POSTER")
  ].filter(Boolean);

  const seriesFolders = [
    makeFolder(catalogDataMap.get("series/cinemana_newly_series"), "POSTER"),
    makeFolder(catalogDataMap.get("series/cinemana_ser_upload_desc"), "POSTER"),
    makeFolder(catalogDataMap.get("series/cinemana_ser_release_desc"), "POSTER"),
    makeFolder(catalogDataMap.get("series/cinemana_ser_views_desc"), "POSTER"),
    makeFolder(catalogDataMap.get("series/cinemana_ser_stars_desc"), "POSTER")
  ].filter(Boolean);

  const nuvioCollections = [
    {
      id: "arabic-latest-all-collection",
      title: "Latest — All Sources",
      name: "Latest — All Sources",
      backdropImageUrl: (latestInfos[0] && latestInfos[0].heroBackdrop) || cinemanaLogoUrl,
      pinToTop: true,
      focusGlowEnabled: true,
      viewMode: "TABBED_GRID",
      showAllTab: true,
      folders: latestInfos.map(i => makeFolder(i, "POSTER"))
    },
    {
      id: "cinemana-home-collection",
      title: "Shabakaty Cinemana Home (🇮🇶)",
      name: "Shabakaty Cinemana Home (🇮🇶)",
      backdropImageUrl: (featuredFolders[0] && featuredFolders[0].heroBackdropUrl) || cinemanaLogoUrl,
      pinToTop: false,
      focusGlowEnabled: true,
      viewMode: "TABBED_GRID",
      showAllTab: true,
      folders: featuredFolders
    },
    {
      id: "cinemana-movies-collection",
      title: "Cinemana Movies (🇮🇶)",
      name: "Cinemana Movies (🇮🇶)",
      backdropImageUrl: (movieFolders[0] && movieFolders[0].heroBackdropUrl) || cinemanaLogoUrl,
      pinToTop: false,
      focusGlowEnabled: true,
      viewMode: "TABBED_GRID",
      showAllTab: true,
      folders: movieFolders
    },
    {
      id: "cinemana-series-collection",
      title: "Cinemana Series (🇮🇶)",
      name: "Cinemana Series (🇮🇶)",
      backdropImageUrl: (seriesFolders[0] && seriesFolders[0].heroBackdropUrl) || cinemanaLogoUrl,
      pinToTop: false,
      focusGlowEnabled: true,
      viewMode: "TABBED_GRID",
      showAllTab: true,
      folders: seriesFolders
    },
    {
      id: "cee-iraq-collection",
      title: "CEE Movies & Series (🇮🇶)",
      name: "CEE Movies & Series (🇮🇶)",
      backdropImageUrl: (ceeFolders[0] && ceeFolders[0].heroBackdropUrl) || cinemanaLogoUrl,
      pinToTop: false,
      focusGlowEnabled: true,
      viewMode: "TABBED_GRID",
      showAllTab: true,
      folders: ceeFolders
    },
    {
      id: "3isk-turkish-collection",
      title: "3isk Turkish Drama & Series",
      name: "3isk Turkish Drama & Series",
      backdropImageUrl: (eishkFolders[0] && eishkFolders[0].heroBackdropUrl) || cinemanaLogoUrl,
      pinToTop: false,
      focusGlowEnabled: true,
      viewMode: "TABBED_GRID",
      showAllTab: true,
      folders: eishkFolders
    },
    {
      id: "alooytv-series-collection",
      title: "AlooyTv Gulf, Arabic & Turkish Series",
      name: "AlooyTv Gulf, Arabic & Turkish Series",
      backdropImageUrl: (alooyFolders[0] && alooyFolders[0].heroBackdropUrl) || cinemanaLogoUrl,
      pinToTop: false,
      focusGlowEnabled: true,
      viewMode: "TABBED_GRID",
      showAllTab: true,
      folders: alooyFolders
    },
    {
      id: "akwam-collection",
      title: "Akwam Movies & Series",
      name: "Akwam Movies & Series",
      backdropImageUrl: (akwamFolders[0] && akwamFolders[0].heroBackdropUrl) || cinemanaLogoUrl,
      pinToTop: false,
      focusGlowEnabled: true,
      viewMode: "TABBED_GRID",
      showAllTab: true,
      folders: akwamFolders
    },
    {
      id: "arabic-drama-hub-collection",
      title: "Arabic, Turkish & Asian Drama Hub",
      name: "Arabic, Turkish & Asian Drama Hub",
      backdropImageUrl: (dramaFolders[0] && dramaFolders[0].heroBackdropUrl) || cinemanaLogoUrl,
      pinToTop: false,
      focusGlowEnabled: true,
      viewMode: "TABBED_GRID",
      showAllTab: true,
      folders: dramaFolders
    },
    {
      id: "arabic-anime-hub-collection",
      title: "Arabic Subtitled Anime Hub",
      name: "Arabic Subtitled Anime Hub",
      backdropImageUrl: (animeFolders[0] && animeFolders[0].heroBackdropUrl) || cinemanaLogoUrl,
      pinToTop: false,
      focusGlowEnabled: true,
      viewMode: "TABBED_GRID",
      showAllTab: true,
      folders: animeFolders
    },
    {
      id: "arabic-sports-replays-collection",
      title: "Football Match Replays & Live Sports",
      name: "Football Match Replays & Live Sports",
      backdropImageUrl: (sportsFolders[0] && sportsFolders[0].heroBackdropUrl) || cinemanaLogoUrl,
      pinToTop: false,
      focusGlowEnabled: true,
      viewMode: "TABBED_GRID",
      showAllTab: true,
      folders: sportsFolders
    }
  ].filter(c => c.folders.length > 0);

  writeJson(path.join(ROOT_DIR, "nuvio-collections.json"), nuvioCollections);
  console.log(`✅ Wrote nuvio-collections.json with ${nuvioCollections.length} collections and ${nuvioCollections.reduce((s, c) => s + c.folders.length, 0)} folders`);

  // Automatically mirror all updated files to C:\Users\SSH\Documents\GitHub\Arabic-Nuvio when present locally
  try {
    const { mirrorToGitHubRepo } = require("./deploy-to-github-dir.js");
    mirrorToGitHubRepo();
  } catch (err) {
    // Ignore when running in GitHub Actions or without deploy helper
  }
}

main().catch(err => {
  console.error("❌ Sync failed:", err);
  process.exit(1);
});
