/**
 * Live Catalog Scraper & Seed Persistence for Priority 2..42 Providers:
 *   - Priority 2: CEE (https://cee.buzz)
 *   - Priority 3: 3isk (https://3iskk.xyz)
 *   - Priority 4: AlooyTv (https://fitnur.com/alooytv -> https://ga.alooytv16.xyz)
 *   - Priority 5: Akwam (https://ak.sv -> https://akwam.ss)
 *   - Priority 6+: Eseek, Krmzy, LodyNet, TukTukcima, Asia2TV, 5TV, Aflaam,
 *                  ShahidWBas, TuniFlix, Anime3rb, Anime4Up, Animerco,
 *                  WitAnime, Anime Phoenix, FullMatchShows, TVgarden
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const EXTRA_SEED_PATH = path.join(ROOT_DIR, "data", "extra-providers-seed.json");
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const LOGOS = {
  cee: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSNEnHalnMz2EfG48BZUI6iC86seq09uafFngG8gz1OWQ&s=10",
  "3isk": "https://3esk.onl/wp-content/uploads/2021/01/3isk-logo.png",
  alooytv: "https://fitnur.com/uploads/avatars/c5ae8dadf88bcea9549657ec451a1563.jpg",
  akwam: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ2vuGLv4zY3XpoN2jza2unCQ95xFfypfe-h3k3xteMbGxl7taw-ziXyNg&s=10",
  eseek: "https://gesseh.net/wp-content/uploads/2024/10/keesatlogo.png",
  krmzy: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRwTnAJOvyri3uHzHxjkEdlaBBKs8MAvIuJtFmCoo9u5qYiuFpHZjcl6tDi&s=10",
  lodynet: "https://lodynet.watch/wp-content/themes/Lodynet2020/Img/Logo.webp",
  tuktukcima: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ10TEG3tTtkEF9_g3IslEP3xs0wx9EVhBs7b_H5M1gpg&s=10",
  aia2tv: "https://media.licdn.com/dms/image/v2/C4D0BAQEhyYSi351HRw/company-logo_200_200/company-logo_200_200/0/1630489719119?e=2147483647&v=beta&t=Br69OJ2AwT5vdJHgl-DTvliEqOmp6VQLYwUWcFqG4u4",
  "5tv": "https://raw.githubusercontent.com/SafaaSalam/Arabic-Nuvio/main/assets/icons/5tv.png",
  aflaam: "https://aflaam.com/style/assets/images/logo.png",
  shahidwbas: "https://cdn.wccftech.com/wp-content/uploads/2018/01/Youtube-music.png",
  tuniflix: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTe95deIIAAbyR9ArSievPWdM2QwiVG9bbQ6Y1uDIbRBpathzSs45b8uQ4&s=10",
  anim3rb: "https://images.anime3rb.com/favicon/apple-touch-icon.png",
  anime4up: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTkVDfHjqUpRyrWJjW8wUHH87BhSO6B9uxI-B80sAy_AQ&s=10",
  animerco: "https://raw.githubusercontent.com/SafaaSalam/Arabic-Nuvio/main/assets/icons/animerco.png",
  witanime: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ7AH2oC7LwumXRpHM8_WLpIFvDIfmS67jkjlhsCKpPaZdqcneigzUQX4g&s=10",
  "anime-phoenix": "https://yt3.googleusercontent.com/mBIIR5cqQC4Y-o7HaxbkJfs305X6tbHLSNPk6MRMCDJsH8xP0SfGhK-CBDpSmH95wSff9z99sg=s900-c-k-c0x00ffffff-no-rj",
  replaymatch: "https://fullmatchshows.com/wp-content/uploads/2024/04/LOGOSASO.png",
  tvgarden: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS9Lci-tXtOtWaHcEp9An7bqIkXs4yzH7EcfA&s",
};

async function fetchJson(url, timeoutMs = 5000) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/plain, */*" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function fetchText(url, timeoutMs = 6000) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return { text: await res.text(), url: res.url || url };
  } catch (e) {
    return null;
  }
}

function cleanHtmlText(str) {
  if (!str) return "";
  return String(str)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8211;/g, "-")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fixUrl(u, base) {
  if (!u) return null;
  const s = String(u).trim();
  if (!s || s.startsWith("data:")) return null;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("/")) return base.replace(/\/+$/, "") + s;
  return base.replace(/\/+$/, "") + "/" + s;
}

function extractImdbId(str) {
  if (!str) return null;
  const m = String(str).match(/(tt\d{5,12})/i);
  return m ? m[1].toLowerCase() : null;
}

function loadExtraSeed() {
  if (fs.existsSync(EXTRA_SEED_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(EXTRA_SEED_PATH, "utf8"));
    } catch (e) {}
  }
  return { catalogs: {}, ceeItems: {} };
}

function saveExtraSeed(seed) {
  fs.mkdirSync(path.dirname(EXTRA_SEED_PATH), { recursive: true });
  fs.writeFileSync(EXTRA_SEED_PATH, JSON.stringify(seed, null, 2) + "\n", "utf8");
}

function cleanBilingualTitle(str) {
  if (!str || typeof str !== "string") return str || "";
  const s = str.trim();
  if (s.includes(" | ")) {
    const parts = s.split(" | ").map(p => p.trim());
    const latin = parts.find(p => /[A-Za-z]/.test(p));
    if (latin) return latin;
  }
  if (s.includes(" / ")) {
    const parts = s.split(" / ").map(p => p.trim());
    const latin = parts.find(p => /[A-Za-z]/.test(p));
    if (latin) return latin;
  }
  return s;
}

function makeMetaItem({ id, type, name, poster, description, releaseInfo, imdbRating, logo }) {
  if (!id || !name || !poster) return null;
  const cleanName = cleanBilingualTitle(name);
  return {
    id,
    type: type || "series",
    name: cleanName,
    poster,
    posterShape: "poster",
    background: poster,
    landscapePoster: poster,
    logo: logo || undefined,
    description: description || cleanName,
    releaseInfo: releaseInfo ? String(releaseInfo) : undefined,
    imdbRating: imdbRating ? String(imdbRating) : undefined,
  };
}

/**
 * 1. Priority #2: CEE (https://cee.buzz)
 */
async function scrapeCeeCatalogs(seed) {
  const ceeApi = "https://cee.buzz/api/android";
  const sections = [
    {
      id: "cee_newly_movies",
      type: "movie",
      arTitle: "أحدث أفلام CEE",
      enTitle: "CEE Newly Added Movies",
      emoji: "🎬",
      url: `${ceeApi}/newlyVideosItems/level/0/offset/40/page/0`,
      filterKind: 1,
    },
    {
      id: "cee_newly_series",
      type: "series",
      arTitle: "أحدث مسلسلات CEE",
      enTitle: "CEE Newly Added Series",
      emoji: "📺",
      url: `${ceeApi}/newlyVideosItems/level/0/offset/40/page/0`,
      filterKind: 2,
    },
    {
      id: "cee_popular_movies",
      type: "movie",
      arTitle: "الأكثر مشاهدة - أفلام CEE",
      enTitle: "CEE Most Viewed Movies",
      emoji: "🔥",
      url: `${ceeApi}/video/V/2?videoKind=1&langNb=&itemsPerPage=24&pageNumber=0&level=0&sortParam=views_desc`,
      filterKind: 1,
    },
    {
      id: "cee_top_movies",
      type: "movie",
      arTitle: "أعلى تقييم - أفلام CEE",
      enTitle: "CEE Top Rated Movies",
      emoji: "⭐",
      url: `${ceeApi}/video/V/2?videoKind=1&langNb=&itemsPerPage=24&pageNumber=0&level=0&sortParam=stars_desc`,
      filterKind: 1,
    },
    {
      id: "cee_popular_series",
      type: "series",
      arTitle: "الأكثر مشاهدة - مسلسلات CEE",
      enTitle: "CEE Most Viewed Series",
      emoji: "🔥",
      url: `${ceeApi}/video/V/2?videoKind=2&langNb=&itemsPerPage=24&pageNumber=0&level=0&sortParam=views_desc`,
      filterKind: 2,
    },
    {
      id: "cee_top_series",
      type: "series",
      arTitle: "أعلى تقييم - مسلسلات CEE",
      enTitle: "CEE Top Rated Series",
      emoji: "⭐",
      url: `${ceeApi}/video/V/2?videoKind=2&langNb=&itemsPerPage=24&pageNumber=0&level=0&sortParam=stars_desc`,
      filterKind: 2,
    },
  ];

  const out = [];
  const urlCache = new Map();

  for (const sec of sections) {
    let raw = urlCache.get(sec.url);
    if (!raw) {
      raw = await fetchJson(sec.url, 4500);
      if (Array.isArray(raw) && raw.length > 0) {
        urlCache.set(sec.url, raw);
      }
    }
    let items = Array.isArray(raw)
      ? raw.filter((x) => !sec.filterKind || parseInt(x && x.kind, 10) === sec.filterKind)
      : [];

    if (items.length > 0) {
      seed.catalogs[sec.id] = items;
    } else {
      items = seed.catalogs[sec.id] || [];
    }

    const metas = [];
    const seen = new Set();
    for (const item of items) {
      if (!item || !item.nb) continue;
      seed.ceeItems[String(item.nb)] = item;
      const imdbId = extractImdbId(item.imdbUrlRef);
      const id = imdbId || `cee_${item.nb}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const ar = item.ar_title ? String(item.ar_title).trim() : "";
      const en = item.en_title ? String(item.en_title).trim() : "";
      let name = ar || en;
      if (en && /[A-Za-z]/.test(en)) {
        name = cleanBilingualTitle(en);
      } else if (ar && /[A-Za-z]/.test(ar)) {
        name = cleanBilingualTitle(ar);
      } else if (en) {
        name = en;
      }
      const poster = item.imgObjUrl || item.imgThumbObjUrl || item.img;
      const meta = makeMetaItem({
        id,
        type: sec.type,
        name,
        poster,
        description: item.ar_content || item.en_content || name,
        releaseInfo: item.year,
        imdbRating: item.stars && !isNaN(parseFloat(item.stars)) ? parseFloat(item.stars).toFixed(1) : undefined,
        logo: LOGOS.cee,
      });
      if (meta) metas.push(meta);
    }

    if (metas.length > 0) {
      out.push({
        ...sec,
        providerKey: "cee",
        logo: LOGOS.cee,
        metas,
      });
    }
  }
  return out;
}

/**
 * 2. Priority #3: 3isk (https://3iskk.xyz)
 */
async function scrape3iskCatalogs(seed) {
  const res = await fetchText("https://3iskk.xyz", 6000) || await fetchText("https://3esk.onl", 6000);
  const baseUrl = res ? new URL(res.url).origin : "https://3iskk.xyz";
  const resSeries = await fetchText(`${baseUrl}/all-turkish-series/`, 6000);

  function parse3iskHtml(html) {
    const list = [];
    const seen = new Set();
    if (!html) return list;
    const liRegex = /<(?:li|article)[^>]*class=["'][^"']*(?:type_item_box|post)[^"']*["'][^>]*>([\s\S]*?)<\/(?:li|article)>/gi;
    let m;
    while ((m = liRegex.exec(html)) !== null) {
      const block = m[1];
      const aM = block.match(/<a[^>]*href=["']([^"']+)["'][^>]*title=["']([^"']+)["']/i) ||
                 block.match(/<a[^>]*href=["']([^"']+)["']/i);
      const imgM = block.match(/data-image=["']([^"']+)["']/i) ||
                   block.match(/url\(['"]?([^'")]+)['"]?\)/i) ||
                   block.match(/src=["']([^"']+)["']/i);
      const titleDiv = block.match(/<div[^>]*class=["'][^"']*(?:item_title|title)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      if (!aM || !imgM) continue;
      const href = aM[1];
      const title = cleanHtmlText(titleDiv ? titleDiv[1] : aM[2]);
      const poster = fixUrl(imgM[1], baseUrl);
      if (!title || !poster) continue;
      const slug = href.replace(/^https?:\/\/[^/]+\/?/, "").replace(/\/+$/, "").replace(/\//g, "__");
      const id = `3isk_${slug}`;
      if (seen.has(id)) continue;
      seen.add(id);
      list.push(
        makeMetaItem({
          id,
          type: "series",
          name: title,
          poster,
          description: `${title} — 3isk (قصة عشق)`,
          logo: LOGOS["3isk"],
        })
      );
    }
    return list;
  }

  const latestEpisodes = parse3iskHtml(res ? res.text : "");
  const seriesList = parse3iskHtml(resSeries ? resSeries.text : "");

  if (latestEpisodes.length > 0) seed.catalogs["3isk_latest_episodes"] = latestEpisodes;
  if (seriesList.length > 0) seed.catalogs["3isk_turkish_series"] = seriesList;

  const finalEpisodes = latestEpisodes.length > 0 ? latestEpisodes : seed.catalogs["3isk_latest_episodes"] || [];
  const finalSeries = seriesList.length > 0 ? seriesList : seed.catalogs["3isk_turkish_series"] || [];

  const out = [];
  if (finalEpisodes.length > 0) {
    out.push({
      id: "3isk_latest_episodes",
      type: "series",
      arTitle: "قصة عشق - أحدث الحلقات التركية",
      enTitle: "3isk Latest Turkish Episodes",
      emoji: "🇹🇷",
      providerKey: "3isk",
      logo: LOGOS["3isk"],
      metas: finalEpisodes,
    });
  }
  if (finalSeries.length > 0) {
    out.push({
      id: "3isk_turkish_series",
      type: "series",
      arTitle: "قصة عشق - المسلسلات التركية",
      enTitle: "3isk Featured Turkish Series",
      emoji: "❤️",
      providerKey: "3isk",
      logo: LOGOS["3isk"],
      metas: finalSeries,
    });
  }
  return out;
}

/**
 * 3. Priority #4: AlooyTv (https://fitnur.com/alooytv -> https://ga.alooytv16.xyz)
 */
async function scrapeAlooytvCatalogs(seed) {
  const gate = await fetchText("https://fitnur.com/alooytv", 5000);
  let domain = "https://ga.alooytv16.xyz";
  if (gate && gate.text) {
    const dm = gate.text.match(/href=["'](https?:\/\/[^"']*alooytv[^"']*\.xyz)[^"']*["']/i);
    if (dm && dm[1]) domain = new URL(dm[1]).origin;
  }

  const pages = [
    {
      id: "alooy_latest_series",
      path: "/tv-series.html",
      arTitle: "علوي تي في - أحدث المسلسلات",
      enTitle: "AlooyTv Latest Series",
      emoji: "📺",
    },
    {
      id: "alooy_gulf_ramadan",
      path: "/genre/ramadan-kleeji-2026.html",
      arTitle: "علوي تي في - مسلسلات خليجية",
      enTitle: "AlooyTv Gulf Series",
      emoji: "🌙",
    },
    {
      id: "alooy_arabic_ramadan",
      path: "/genre/ramadan-arabi-2026.html",
      arTitle: "علوي تي في - مسلسلات عربية",
      enTitle: "AlooyTv Arabic Series",
      emoji: "🌟",
    },
    {
      id: "alooy_turkish_series",
      path: "/genre/turki.html",
      arTitle: "علوي تي في - مسلسلات تركية",
      enTitle: "AlooyTv Turkish Series",
      emoji: "🇹🇷",
    },
  ];

  const out = [];
  for (const pg of pages) {
    const res = await fetchText(`${domain}${pg.path}`, 5500);
    const metas = [];
    const seen = new Set();
    if (res && res.text) {
      const cardRegex = /<div[^>]*class=["'][^"']*latest-movie-img-container[^"']*["'][^>]*>([\s\S]*?)<\/h3>\s*<\/div>\s*<\/div>\s*<\/div>/gi;
      let m;
      while ((m = cardRegex.exec(res.text)) !== null) {
        const block = m[1];
        const imgM = block.match(/data-src=["']([^"']+)["']/i) || block.match(/src=["']([^"']+)["']/i);
        const titleM = block.match(/<h3>\s*<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
        if (!imgM || !titleM) continue;
        const poster = fixUrl(imgM[1], domain);
        const href = titleM[1];
        const title = cleanHtmlText(titleM[2]);
        const slug = href.replace(/^https?:\/\/[^/]+\/watch\//i, "").replace(/\.html$/i, "");
        const id = `alooy_${slug}`;
        if (seen.has(id) || !title || !poster) continue;
        seen.add(id);
        metas.push(
          makeMetaItem({
            id,
            type: "series",
            name: title,
            poster,
            description: `${title} — AlooyTv`,
            logo: LOGOS.alooytv,
          })
        );
      }
    }
    if (metas.length > 0) {
      seed.catalogs[pg.id] = metas;
    }
    const finalMetas = metas.length > 0 ? metas : seed.catalogs[pg.id] || [];
    if (finalMetas.length > 0) {
      out.push({
        id: pg.id,
        type: "series",
        arTitle: pg.arTitle,
        enTitle: pg.enTitle,
        emoji: pg.emoji,
        providerKey: "alooytv",
        logo: LOGOS.alooytv,
        metas: finalMetas,
      });
    }
  }
  return out;
}

/**
 * 4. Priority #5: Akwam (https://akwam.ss / https://ak.sv)
 */
async function scrapeAkwamCatalogs(seed) {
  const pages = [
    {
      id: "akwam_latest_movies",
      type: "movie",
      path: "/movies",
      arTitle: "أكوام - أحدث الأفلام",
      enTitle: "Akwam Latest Movies",
      emoji: "🎬",
    },
    {
      id: "akwam_latest_series",
      type: "series",
      path: "/series",
      arTitle: "أكوام - أحدث المسلسلات",
      enTitle: "Akwam Latest Series",
      emoji: "📺",
    },
    {
      id: "akwam_arabic_movies",
      type: "movie",
      path: "/movies?section=29",
      arTitle: "أكوام - أفلام عربية",
      enTitle: "Akwam Arabic Movies",
      emoji: "🎞️",
    },
    {
      id: "akwam_arabic_series",
      type: "series",
      path: "/series?section=29",
      arTitle: "أكوام - مسلسلات عربية",
      enTitle: "Akwam Arabic Series",
      emoji: "🌙",
    },
  ];

  const out = [];
  for (const pg of pages) {
    const res =
      (await fetchText(`https://akwam.ss${pg.path}`, 7000)) ||
      (await fetchText(`https://ak.sv${pg.path}`, 7000));
    const metas = [];
    const seen = new Set();
    if (res && res.text) {
      const baseOrigin = new URL(res.url).origin;
      const parts = res.text.split(/<div[^>]*class=["'][^"']*entry-box\b/i).slice(1);
      for (const block of parts) {
        const aM = block.match(/<a[^>]*href=["'](https?:\/\/[^"']+\/(?:movie|series|shows)\/[^"']+)["']/i);
        const imgM = block.match(/data-src=["']([^"']+)["']/i) || block.match(/xlink:href=["']([^"']+)["']/i);
        const altM = block.match(/<img[^>]*alt=["']([^"']+)["']/i);
        const h3M = block.match(/<h3[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
        const ratingM = block.match(/<span[^>]*class=["'][^"']*rating[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
        if (!aM || !imgM) continue;
        const poster = fixUrl(imgM[1], baseOrigin);
        const href = aM[1];
        const title = cleanHtmlText(h3M ? h3M[1] : altM ? altM[1] : "");
        const rating = ratingM ? cleanHtmlText(ratingM[1]).match(/(\d+(?:\.\d+)?)/)?.[1] : undefined;
        const slug = href.replace(/^https?:\/\/[^/]+\/?/, "").replace(/\/+$/, "").replace(/\//g, "__");
        const id = `akwam_${slug}`;
        if (seen.has(id) || !title || !poster) continue;
        seen.add(id);
        metas.push(
          makeMetaItem({
            id,
            type: pg.type,
            name: title,
            poster,
            imdbRating: rating,
            description: `${title} — Akwam (أكوام)`,
            logo: LOGOS.akwam,
          })
        );
      }
    }
    if (metas.length > 0) {
      seed.catalogs[pg.id] = metas;
    }
    const finalMetas = metas.length > 0 ? metas : seed.catalogs[pg.id] || [];
    if (finalMetas.length > 0) {
      out.push({
        id: pg.id,
        type: pg.type,
        arTitle: pg.arTitle,
        enTitle: pg.enTitle,
        emoji: pg.emoji,
        providerKey: "akwam",
        logo: LOGOS.akwam,
        metas: finalMetas,
      });
    }
  }
  return out;
}

/**
 * 5. Priority #6+: Remaining Online Providers
 */
async function scrapeGenericProviderCatalog(seed, cfg) {
  const res = await fetchText(cfg.url, 6000);
  const metas = [];
  const seen = new Set();

  if (res && res.text) {
    const baseOrigin = new URL(res.url).origin;
    const itemBlocks = res.text.match(cfg.itemRegex) || [];
    for (const block of itemBlocks) {
      const aM = block.match(cfg.linkRegex || /<a[^>]*href=["']([^"']+)["']/i);
      const titleM = cfg.titleRegex ? block.match(cfg.titleRegex) : block.match(/title=["']([^"']+)["']/i) || block.match(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/i);
      let poster = null;
      if (cfg.styleBg) {
        const bgM = block.match(/url\(['"]?([^'")]+)['"]?\)/i);
        if (bgM) poster = fixUrl(bgM[1], baseOrigin);
      }
      if (!poster) {
        const imgM = block.match(/data-(?:src|image|lazy-src|original)=["']([^"']+)["']/i) || block.match(/<img[^>]*src=["']([^"']+)["']/i);
        if (imgM) poster = fixUrl(imgM[1], baseOrigin);
      }
      if (!aM || !titleM || !poster) continue;
      const href = fixUrl(aM[1], baseOrigin);
      const title = cleanHtmlText(titleM[1] || titleM[2]);
      if (!href || !title || title.length < 2) continue;
      const slug = href.replace(/^https?:\/\/[^/]+\/?/, "").replace(/\/+$/, "").replace(/\//g, "__");
      const id = `${cfg.prefix}_${slug}`;
      if (seen.has(id)) continue;
      seen.add(id);
      metas.push(
        makeMetaItem({
          id,
          type: cfg.type,
          name: title,
          poster,
          description: `${title} — ${cfg.enTitle}`,
          logo: cfg.logo,
        })
      );
      if (metas.length >= 28) break;
    }
  }

  if (metas.length > 0) {
    seed.catalogs[cfg.id] = metas;
  }
  const finalMetas = metas.length > 0 ? metas : seed.catalogs[cfg.id] || [];
  if (finalMetas.length === 0) return null;

  return {
    id: cfg.id,
    type: cfg.type,
    arTitle: cfg.arTitle,
    enTitle: cfg.enTitle,
    emoji: cfg.emoji,
    providerKey: cfg.providerKey,
    group: cfg.group,
    logo: cfg.logo,
    metas: finalMetas,
  };
}

async function scrapeRemainingCatalogs(seed) {
  const configs = [
    {
      id: "tuktukcima_recent",
      providerKey: "tuktukcima",
      prefix: "tuktukcima",
      group: "drama",
      type: "movie",
      url: "https://tuktukhd.com/recent/page/1",
      arTitle: "توك توك سيما - المضاف حديثاً",
      enTitle: "TukTukcima Recently Added",
      emoji: "🎬",
      logo: LOGOS.tuktukcima,
      itemRegex: /<(?:li|div)[^>]*class=["'][^"']*(?:Small--Box|Block--Item)[^"']*["'][^>]*>[\s\S]*?<\/(?:li|div)>/gi,
    },
    {
      id: "lodynet_latest",
      providerKey: "lodynet",
      prefix: "lodynet",
      group: "drama",
      type: "series",
      url: "https://lodynet.watch",
      arTitle: "لودي نت - أحدث الحلقات والمسلسلات",
      enTitle: "LodyNet Latest Drama & Series",
      emoji: "📺",
      logo: LOGOS.lodynet,
      styleBg: true,
      itemRegex: /<div[^>]*class=["'][^"']*ItemNewlyField[^"']*["'][^>]*>[\s\S]*?<\/a>\s*<\/div>/gi,
      titleRegex: /<div[^>]*class=["'][^"']*NewlyTitle[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    },
    {
      id: "krmzy_series",
      providerKey: "krmzy",
      prefix: "krmzy",
      group: "drama",
      type: "series",
      url: "https://krmzi.org/series-list/page/1",
      arTitle: "قرمزي - مسلسلات تركية",
      enTitle: "Krmzy Turkish Series",
      emoji: "🇹🇷",
      logo: LOGOS.krmzy,
      styleBg: true,
      itemRegex: /<article[^>]*class=["'][^"']*postEp[^"']*["'][^>]*>[\s\S]*?<\/article>/gi,
      titleRegex: /<div[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    },
    {
      id: "eseek_series",
      providerKey: "eseek",
      prefix: "eseek",
      group: "drama",
      type: "series",
      url: "https://qeseh.net/all-series/page/1",
      arTitle: "عشق 2 - المسلسلات التركية",
      enTitle: "Eseek Turkish Series",
      emoji: "❤️",
      logo: LOGOS.eseek,
      styleBg: true,
      itemRegex: /<article[^>]*class=["'][^"']*post[^"']*["'][^>]*>[\s\S]*?<\/article>/gi,
      titleRegex: /<div[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    },
    {
      id: "asia2tv_drama",
      providerKey: "aia2tv",
      prefix: "aia2tv",
      group: "drama",
      type: "series",
      url: "https://ww1.asia2tv.pw/category/asian-drama/",
      arTitle: "آسيا تو تي في - الدراما الآسيوية",
      enTitle: "Asia2TV Korean & Asian Drama",
      emoji: "🇰🇷",
      logo: LOGOS.aia2tv,
      itemRegex: /<div[^>]*class=["'][^"']*box-item[^"']*["'][^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi,
    },
    {
      id: "5tv_featured",
      providerKey: "5tv",
      prefix: "5tv",
      group: "drama",
      type: "series",
      url: "https://new61.5tv.lol",
      arTitle: "5TV - أحدث الأفلام والمسلسلات",
      enTitle: "5TV Featured Series & Movies",
      emoji: "🌟",
      logo: LOGOS["5tv"],
      itemRegex: /<article[^>]*class=["'][^"']*ftv-home-poster-card[^"']*["'][^>]*>[\s\S]*?<\/article>/gi,
      titleRegex: /class=["'][^"']*ftv-home-poster-card__title[^"']*["'][^>]*>([\s\S]*?)<\//i,
    },
    {
      id: "aflaam_movies",
      providerKey: "aflaam",
      prefix: "aflaam",
      group: "drama",
      type: "movie",
      url: "https://aflaam.com/search?section=1",
      arTitle: "أفلام - أفلام عربية",
      enTitle: "Aflaam Arabic Movies",
      emoji: "🎞️",
      logo: LOGOS.aflaam,
      itemRegex: /<div[^>]*class=["'][^"']*item[^"']*["'][^>]*>[\s\S]*?<\/h3>\s*<\/div>\s*<\/a>\s*<\/div>/gi,
      titleRegex: /<h3[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i,
    },
    {
      id: "shahidwbas_latest",
      providerKey: "shahidwbas",
      prefix: "shahidwbas",
      group: "drama",
      type: "series",
      url: "https://w30.shahidwbas.tv/index.php",
      arTitle: "شاهد وبس - أحدث الحلقات",
      enTitle: "ShahidWBas Latest Series",
      emoji: "📺",
      logo: LOGOS.shahidwbas,
      itemRegex: /<li[^>]*>\s*<div[^>]*class=["'][^"']*pm-li-video[^"']*["'][^>]*>[\s\S]*?<\/li>/gi,
    },
    {
      id: "tuniflix_movies",
      providerKey: "tuniflix",
      prefix: "tuniflix",
      group: "drama",
      type: "movie",
      url: "https://tuniflix.site/movies/page/1",
      arTitle: "توني فليكس - أحدث الأفلام",
      enTitle: "TuniFlix Latest Movies",
      emoji: "🇹🇳",
      logo: LOGOS.tuniflix,
      itemRegex: /<article[^>]*class=["'][^"']*TPost[^"']*["'][^>]*>[\s\S]*?<\/article>/gi,
      titleRegex: /<h2[^>]*class=["'][^"']*Title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i,
    },
    {
      id: "anim3rb_latest",
      providerKey: "anim3rb",
      prefix: "anim3rb",
      group: "anime",
      type: "series",
      url: "https://anime3rb.com",
      arTitle: "أنمي عرب - أحدث الحلقات",
      enTitle: "Anime3rb Latest Anime",
      emoji: "⛩️",
      logo: LOGOS.anim3rb,
      itemRegex: /<a[^>]*class=["'][^"']*video-card[^"']*["'][^>]*>[\s\S]*?<\/a>/gi,
      linkRegex: /^<a[^>]*href=["']([^"']+)["']/i,
      titleRegex: /<h3[^>]*class=["'][^"']*title-name[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i,
    },
    {
      id: "anime4up_latest",
      providerKey: "anime4up",
      prefix: "anime4up",
      group: "anime",
      type: "series",
      url: "https://w1.anime4up.rest",
      arTitle: "أنمي فور أب - أحدث الأنميات",
      enTitle: "Anime4Up Latest Anime",
      emoji: "⚔️",
      logo: LOGOS.anime4up,
      itemRegex: /<div[^>]*class=["'][^"']*(?:anime-card-container|themexblock)[^"']*["'][^>]*>[\s\S]*?<\/h3>[\s\S]*?<\/div>\s*<\/div>/gi,
      titleRegex: /<h3>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/i,
    },
    {
      id: "animerco_latest",
      providerKey: "animerco",
      prefix: "animerco",
      group: "anime",
      type: "series",
      url: "https://eva.animerco.org",
      arTitle: "أنميركو - أنميات مميزة",
      enTitle: "Animerco Featured Anime",
      emoji: "🔥",
      logo: LOGOS.animerco,
      itemRegex: /<div[^>]*class=["'][^"']*anime-card[^"']*["'][^>]*>[\s\S]*?<\/h3>[\s\S]*?<\/div>\s*<\/div>/gi,
      titleRegex: /<h3>([\s\S]*?)<\/h3>/i,
    },
    {
      id: "witanime_latest",
      providerKey: "witanime",
      prefix: "witanime",
      group: "anime",
      type: "series",
      url: "https://witanime.site",
      arTitle: "ويت أنمي - أحدث الحلقات",
      enTitle: "WitAnime Latest Anime",
      emoji: "🎌",
      logo: LOGOS.witanime,
      itemRegex: /<div[^>]*class=["'][^"']*anime-card-container[^"']*["'][^>]*>[\s\S]*?<\/h3>[\s\S]*?<\/div>\s*<\/div>/gi,
      titleRegex: /<h3>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/i,
    },
    {
      id: "animephoenix_latest",
      providerKey: "anime-phoenix",
      prefix: "animephoenix",
      group: "anime",
      type: "series",
      url: "https://anime-phoenix.com",
      arTitle: "أنمي فينيكس - أحدث الحلقات",
      enTitle: "Anime Phoenix Latest Episodes",
      emoji: "🦅",
      logo: LOGOS["anime-phoenix"],
      itemRegex: /<a[^>]*class=["'][^"']*FJ-Phoenix-Anastasia-EpCard[^"']*["'][^>]*>[\s\S]*?<\/a>/gi,
      linkRegex: /^<a[^>]*href=["']([^"']+)["']/i,
      titleRegex: /class=["'][^"']*FJ-Phoenix-Anastasia-EpCard-Name[^"']*["'][^>]*>([\s\S]*?)<\//i,
    },
    {
      id: "replaymatch_latest",
      providerKey: "replaymatch",
      prefix: "replaymatch",
      group: "sports",
      type: "movie",
      url: "https://fullmatchshows.com",
      arTitle: "إعادة المباريات الكاملة - FullMatchShows",
      enTitle: "FullMatchShows Latest Football Replays",
      emoji: "⚽",
      logo: LOGOS.replaymatch,
      itemRegex: /<article[^>]*class=["'][^"']*bloglo-article[^"']*["'][^>]*>[\s\S]*?<\/article>/gi,
      titleRegex: /<h4[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i,
    },
  ];

  const results = [];
  for (const cfg of configs) {
    const cat = await scrapeGenericProviderCatalog(seed, cfg);
    if (cat) results.push(cat);
  }
  return results;
}

async function scrapeAllExtraCatalogs() {
  const seed = loadExtraSeed();

  console.log("📡 Scraping Priority #2: CEE (https://cee.buzz)...");
  const ceeCatalogs = await scrapeCeeCatalogs(seed);

  console.log("📡 Scraping Priority #3: 3isk (https://3iskk.xyz)...");
  const eishkCatalogs = await scrape3iskCatalogs(seed);

  console.log("📡 Scraping Priority #4: AlooyTv (https://fitnur.com/alooytv)...");
  const alooyCatalogs = await scrapeAlooytvCatalogs(seed);

  console.log("📡 Scraping Priority #5: Akwam (https://ak.sv)...");
  const akwamCatalogs = await scrapeAkwamCatalogs(seed);

  console.log("📡 Scraping Priority #6+: Remaining Arabic Drama, Anime & Sports Providers...");
  const remainingCatalogs = await scrapeRemainingCatalogs(seed);

  saveExtraSeed(seed);

  return {
    ceeCatalogs,
    eishkCatalogs,
    alooyCatalogs,
    akwamCatalogs,
    remainingCatalogs,
    ceeItems: seed.ceeItems || {},
  };
}

module.exports = {
  scrapeAllExtraCatalogs,
  LOGOS,
};
