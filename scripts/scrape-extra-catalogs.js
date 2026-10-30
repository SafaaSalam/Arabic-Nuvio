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
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const fav = (d) => `https://www.google.com/s2/favicons?domain=${d}&sz=128`;
const LOGOS = {
  moviesmod: fav("moviesmod.meme"), vegamovies: fav("1vegamovies.shop"), bollyflix: fav("bollyflix.church"), moviesdrive: fav("moviesdrive.cyou"),
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

/** status-aware GET: { ok:true, end:true } for 404/410 (page does not exist) ; { ok:false } for transient failures */
async function getRaw(url, accept, timeoutMs, retries = 1) {
  let lastStatus = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: accept },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 404 || res.status === 410) return { ok: true, end: true, url: res.url || url };
      if (!res.ok) { lastStatus = res.status; throw new Error("HTTP " + res.status); }
      return { ok: true, end: false, text: await res.text(), url: res.url || url };
    } catch (e) {
      if (attempt === retries) return { ok: false, status: lastStatus || "network" };
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  return { ok: false, status: lastStatus || "network" };
}

async function fetchJson(url, timeoutMs = 8000) {
  const r = await getRaw(url, "application/json, text/plain, */*", timeoutMs);
  if (!r.ok) return { ok: false };
  if (r.end) return { ok: true, data: [] };
  try { return { ok: true, data: JSON.parse(r.text) }; } catch (_) { return { ok: false }; }
}

async function fetchText(url, timeoutMs = 9000) {
  const r = await getRaw(url, "text/html,*/*", timeoutMs);
  return r;
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

function makeMetaItem({ id, type, name, poster, description, releaseInfo, imdbRating, logo }) {
  if (!id || !name || !poster) return null;
  return {
    id: asciiId(id),
    type: type || "series",
    name,
    poster,
    posterShape: "poster",
    background: poster,
    landscapePoster: poster,
    logo: logo || undefined,
    description: description || name,
    releaseInfo: releaseInfo ? String(releaseInfo) : undefined,
    imdbRating: imdbRating ? String(imdbRating) : undefined,
  };
}

const { loadStore, saveStore, crawl, asciiId } = require("./lib/store.js");

/* ----------------------------------------------------------------------------
 * Parsers (HTML -> meta items). Pure functions so they can be unit-tested offline.
 * -------------------------------------------------------------------------- */
function slugOf(href) {
  return String(href).replace(/^https?:\/\/[^/]+\/?/, "").replace(/\/+$/, "").replace(/\//g, "__");
}

function parse3isk(html, base, logo) {
  const list = [];
  if (!html) return list;
  const liRegex = /<(?:li|article)[^>]*class=["'][^"']*(?:type_item_box|post)[^"']*["'][^>]*>([\s\S]*?)<\/(?:li|article)>/gi;
  let m;
  while ((m = liRegex.exec(html)) !== null) {
    const block = m[1];
    const aM = block.match(/<a[^>]*href=["']([^"']+)["'][^>]*title=["']([^"']+)["']/i) || block.match(/<a[^>]*href=["']([^"']+)["']/i);
    const imgM = block.match(/data-image=["']([^"']+)["']/i) || block.match(/url\(['"]?([^'")]+)['"]?\)/i) || block.match(/src=["']([^"']+)["']/i);
    const titleDiv = block.match(/<div[^>]*class=["'][^"']*(?:item_title|title)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (!aM || !imgM) continue;
    const title = cleanHtmlText(titleDiv ? titleDiv[1] : aM[2]);
    const poster = fixUrl(imgM[1], base);
    if (!title || !poster) continue;
    const meta = makeMetaItem({ id: `3isk_${slugOf(aM[1])}`, type: "series", name: title, poster, description: `${title} — 3isk (قصة عشق)`, logo });
    if (meta) list.push(meta);
  }
  return list;
}

function parseAlooy(html, domain, logo) {
  const list = [];
  if (!html) return list;
  const cardRegex = /<div[^>]*class=["'][^"']*latest-movie-img-container[^"']*["'][^>]*>([\s\S]*?)<\/h3>\s*<\/div>\s*<\/div>\s*<\/div>/gi;
  let m;
  while ((m = cardRegex.exec(html)) !== null) {
    const block = m[1];
    const imgM = block.match(/data-src=["']([^"']+)["']/i) || block.match(/src=["']([^"']+)["']/i);
    const titleM = block.match(/<h3>\s*<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!imgM || !titleM) continue;
    const slug = titleM[1].replace(/^https?:\/\/[^/]+\/watch\//i, "").replace(/\.html$/i, "");
    const meta = makeMetaItem({ id: `alooy_${slug}`, type: "series", name: cleanHtmlText(titleM[2]), poster: fixUrl(imgM[1], domain), description: `${cleanHtmlText(titleM[2])} — AlooyTv`, logo });
    if (meta) list.push(meta);
  }
  return list;
}

function parseAkwam(html, type, baseFallback, logo) {
  const list = [];
  if (!html) return list;
  const parts = html.split(/<div[^>]*class=["'][^"']*entry-box\b/i).slice(1);
  for (const block of parts) {
    const aM = block.match(/<a[^>]*href=["'](https?:\/\/[^"']+\/(?:movie|series|shows)\/[^"']+)["']/i);
    const imgM = block.match(/data-src=["']([^"']+)["']/i) || block.match(/xlink:href=["']([^"']+)["']/i);
    const altM = block.match(/<img[^>]*alt=["']([^"']+)["']/i);
    const h3M = block.match(/<h3[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
    const ratingM = block.match(/<span[^>]*class=["'][^"']*rating[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    if (!aM || !imgM) continue;
    const title = cleanHtmlText(h3M ? h3M[1] : altM ? altM[1] : "");
    const rating = ratingM ? (cleanHtmlText(ratingM[1]).match(/(\d+(?:\.\d+)?)/) || [])[1] : undefined;
    const meta = makeMetaItem({ id: `akwam_${slugOf(aM[1])}`, type, name: title, poster: fixUrl(imgM[1], baseFallback), imdbRating: rating, description: `${title} — Akwam (أكوام)`, logo });
    if (meta) list.push(meta);
  }
  return list;
}

function parseGeneric(html, base, cfg) {
  const list = [];
  if (!html) return list;
  const blocks = html.match(cfg.itemRegex) || [];
  for (const block of blocks) {
    const aM = block.match(cfg.linkRegex || /<a[^>]*href=["']([^"']+)["']/i);
    const titleM = cfg.titleRegex ? block.match(cfg.titleRegex) : block.match(/title=["']([^"']+)["']/i) || block.match(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/i);
    let poster = null;
    if (cfg.styleBg) {
      const bgM = block.match(/url\(['"]?([^'")]+)['"]?\)/i);
      if (bgM) poster = fixUrl(bgM[1], base);
    }
    if (!poster) {
      const imgM = block.match(/data-(?:src|image|lazy-src|original)=["']([^"']+)["']/i) || block.match(/<img[^>]*src=["']([^"']+)["']/i);
      if (imgM) poster = fixUrl(imgM[1], base);
    }
    if (!aM || !titleM || !poster) continue;
    const href = fixUrl(aM[1], base);
    const title = cleanHtmlText(titleM[1] || titleM[2]).replace(/^Download\s+/i, "");
    if (!href || !title || title.length < 2) continue;
    if (cfg.keep && !cfg.keep(title)) continue;
    const meta = makeMetaItem({ id: `${cfg.prefix}_${slugOf(href)}`, type: cfg.type, name: title, poster, description: `${title} — ${cfg.enTitle}`, logo: cfg.logo });
    if (meta) list.push(meta);
  }
  return list;
}

/* ----------------------------------------------------------------------------
 * Cinemana-style JSON API (CEE) -> meta items
 * -------------------------------------------------------------------------- */
function ceeItemToMeta(item, type, logo) {
  if (!item || !item.nb) return null;
  const imdbId = extractImdbId(item.imdbUrlRef);
  const ar = item.ar_title ? String(item.ar_title).trim() : "";
  const en = item.en_title ? String(item.en_title).trim() : "";
  const name = ar && en && ar.toLowerCase() !== en.toLowerCase() ? `${ar} | ${en}` : ar || en;
  const meta = makeMetaItem({
    id: imdbId || `cee_${item.nb}`,
    type,
    name,
    poster: item.imgObjUrl || item.imgThumbObjUrl || item.img,
    description: item.ar_content || item.en_content || name,
    releaseInfo: item.year,
    imdbRating: item.stars && !isNaN(parseFloat(item.stars)) ? parseFloat(item.stars).toFixed(1) : undefined,
    logo,
  });
  if (meta && imdbId) meta.imdb_id = imdbId;
  return meta;
}

/* ----------------------------------------------------------------------------
 * Source definitions. pageUrl(n) is 1-based. paginated:false => only page 1 exists / is known.
 * -------------------------------------------------------------------------- */
const CEE_API = "https://cee.buzz/api/android";
function ceeSource(id, type, arTitle, enTitle, emoji, listUrl, kind) {
  return {
    id, type, arTitle, enTitle, emoji, providerKey: "cee", logo: LOGOS.cee,
    fetchPage: async (n) => {
      const r = await fetchJson(listUrl(n - 1), 9000);
      if (!r.ok) return { ok: false };
      const arr = Array.isArray(r.data) ? r.data : [];
      const metas = arr.filter((x) => !kind || parseInt(x && x.kind, 10) === kind).map((x) => ceeItemToMeta(x, type, LOGOS.cee)).filter(Boolean);
      // an API page that is non-empty but fully filtered out must not look like "end of listing"
      return { ok: true, items: metas, rawCount: arr.length, end: arr.length === 0 };
    },
  };
}
const ceeVideo = (kind, sort) => (p) => `${CEE_API}/video/V/2?videoKind=${kind}&langNb=&itemsPerPage=30&pageNumber=${p}&level=0&sortParam=${sort}`;
const ceeNewly = (p) => `${CEE_API}/newlyVideosItems/level/0/offset/30/page/${p}`;

async function htmlSource(fetchPageUrls, parse) {
  // fetchPageUrls: array of candidate absolute URLs (mirror domains) for the same page
  let lastStatus = null;
  for (const url of fetchPageUrls) {
    const r = await fetchText(url);
    if (!r.ok) { lastStatus = r.status; continue; }
    if (r.end) return { ok: true, items: [] };
    return { ok: true, items: parse(r.text, new URL(r.url).origin) };
  }
  return { ok: false, status: lastStatus };
}

const SERIES_RE = /season|series|\bS\d{1,2}\b|\bE\d{1,3}\b|episode/i;
const GENERIC_SOURCES = [
  { id: "tuktukcima_recent", providerKey: "tuktukcima", prefix: "tuktukcima", group: "drama", type: "movie", base: "https://tuktukcinemas.com", bases: ["https://tuktukcinemas.com", "https://tuktukhd.com"], pageUrl: (n) => `/recent/page/${n}`,
    arTitle: "توك توك سيما - المضاف حديثاً", enTitle: "TukTukcima Recently Added", emoji: "🎬", logo: LOGOS.tuktukcima,
    itemRegex: /<(?:li|div)[^>]*class=["'][^"']*(?:Small--Box|Block--Item)[^"']*["'][^>]*>[\s\S]*?<\/(?:li|div)>/gi },
  { id: "lodynet_latest", providerKey: "lodynet", prefix: "lodynet", group: "drama", type: "series", base: "https://lodynet.watch", pageUrl: (n) => (n > 1 ? `/page/${n}/` : "/"),
    arTitle: "لودي نت - أحدث الحلقات والمسلسلات", enTitle: "LodyNet Latest Drama & Series", emoji: "📺", logo: LOGOS.lodynet, styleBg: true,
    itemRegex: /<div[^>]*class=["'][^"']*ItemNewlyField[^"']*["'][^>]*>[\s\S]*?<\/a>\s*<\/div>/gi,
    titleRegex: /<div[^>]*class=["'][^"']*NewlyTitle[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { id: "krmzy_series", providerKey: "krmzy", prefix: "krmzy", group: "drama", type: "series", base: "https://krmzi.org", pageUrl: (n) => `/series-list/page/${n}`,
    arTitle: "قرمزي - مسلسلات تركية", enTitle: "Krmzy Turkish Series", emoji: "🇹🇷", logo: LOGOS.krmzy, styleBg: true,
    itemRegex: /<article[^>]*class=["'][^"']*postEp[^"']*["'][^>]*>[\s\S]*?<\/article>/gi,
    titleRegex: /<div[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { id: "eseek_series", providerKey: "eseek", prefix: "eseek", group: "drama", type: "series", base: "https://qeseh.net", pageUrl: (n) => `/all-series/page/${n}`,
    arTitle: "عشق 2 - المسلسلات التركية", enTitle: "Eseek Turkish Series", emoji: "❤️", logo: LOGOS.eseek, styleBg: true,
    itemRegex: /<article[^>]*class=["'][^"']*post[^"']*["'][^>]*>[\s\S]*?<\/article>/gi,
    titleRegex: /<div[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { id: "asia2tv_drama", providerKey: "aia2tv", prefix: "aia2tv", group: "drama", type: "series", base: "https://ww1.asia2tv.pw", pageUrl: (n) => `/category/asian-drama/${n > 1 ? `page/${n}/` : ""}`,
    arTitle: "آسيا تو تي في - الدراما الآسيوية", enTitle: "Asia2TV Korean & Asian Drama", emoji: "🇰🇷", logo: LOGOS.aia2tv,
    itemRegex: /<div[^>]*class=["'][^"']*box-item[^"']*["'][^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi },
  { id: "5tv_featured", providerKey: "5tv", prefix: "5tv", group: "drama", type: "series", base: "https://new61.5tv.lol", pageUrl: (n) => (n > 1 ? `/page/${n}/` : "/"),
    arTitle: "5TV - أحدث الأفلام والمسلسلات", enTitle: "5TV Featured Series & Movies", emoji: "🌟", logo: LOGOS["5tv"],
    itemRegex: /<article[^>]*class=["'][^"']*ftv-home-poster-card[^"']*["'][^>]*>[\s\S]*?<\/article>/gi,
    titleRegex: /class=["'][^"']*ftv-home-poster-card__title[^"']*["'][^>]*>([\s\S]*?)<\//i },
  { id: "aflaam_movies", providerKey: "aflaam", prefix: "aflaam", group: "drama", type: "movie", base: "https://aflaam.com", pageUrl: (n) => `/search?section=1${n > 1 ? `&page=${n}` : ""}`,
    arTitle: "أفلام - أفلام عربية", enTitle: "Aflaam Arabic Movies", emoji: "🎞️", logo: LOGOS.aflaam,
    itemRegex: /<div[^>]*class=["'][^"']*item[^"']*["'][^>]*>[\s\S]*?<\/h3>\s*<\/div>\s*<\/a>\s*<\/div>/gi,
    titleRegex: /<h3[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i },
  { id: "shahidwbas_latest", providerKey: "shahidwbas", prefix: "shahidwbas", group: "drama", type: "series", base: "https://w30.shahidwbas.tv", pageUrl: (n) => (n > 1 ? `/index.php?page=${n}` : "/index.php"),
    arTitle: "شاهد وبس - أحدث الحلقات", enTitle: "ShahidWBas Latest Series", emoji: "📺", logo: LOGOS.shahidwbas,
    itemRegex: /<li[^>]*class=["'][^"']*col-xs-6[^"']*["'][^>]*>[\s\S]*?<\/li>/gi,
    linkRegex: /<a(?=[^>]*class=["'][^"']*ellipsis)[^>]*href=["']([^"']+)["']/i,
    titleRegex: /<a(?=[^>]*class=["'][^"']*ellipsis)[^>]*>([\s\S]*?)<\/a>/i },
  { id: "tuniflix_movies", providerKey: "tuniflix", prefix: "tuniflix", group: "drama", type: "movie", base: "https://tuniflix.site", pageUrl: (n) => `/movies/page/${n}`,
    arTitle: "توني فليكس - أحدث الأفلام", enTitle: "TuniFlix Latest Movies", emoji: "🇹🇳", logo: LOGOS.tuniflix,
    itemRegex: /<article[^>]*class=["'][^"']*TPost[^"']*["'][^>]*>[\s\S]*?<\/article>/gi,
    titleRegex: /<h2[^>]*class=["'][^"']*Title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i },
  { id: "anim3rb_latest", providerKey: "anim3rb", prefix: "anim3rb", group: "anime", type: "series", base: "https://anime3rb.com", pageUrl: (n) => (n > 1 ? `/titles/list?page=${n}` : "/"), paginated: false,
    arTitle: "أنمي عرب - أحدث الحلقات", enTitle: "Anime3rb Latest Anime", emoji: "⛩️", logo: LOGOS.anim3rb,
    itemRegex: /<a[^>]*class=["'][^"']*video-card[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, linkRegex: /^<a[^>]*href=["']([^"']+)["']/i,
    titleRegex: /<h3[^>]*class=["'][^"']*title-name[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i },
  { id: "anime4up_latest", providerKey: "anime4up", prefix: "anime4up", group: "anime", type: "series", base: "https://w1.anime4up.rest", pageUrl: () => "/", paginated: false,
    arTitle: "أنمي فور أب - أحدث الأنميات", enTitle: "Anime4Up Latest Anime", emoji: "⚔️", logo: LOGOS.anime4up,
    itemRegex: /<div[^>]*class=["'][^"']*(?:anime-card-container|themexblock)[^"']*["'][^>]*>[\s\S]*?<\/h3>[\s\S]*?<\/div>\s*<\/div>/gi,
    titleRegex: /<h3>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/i },
  { id: "animerco_latest", providerKey: "animerco", prefix: "animerco", group: "anime", type: "series", base: "https://eva.animerco.org", pageUrl: () => "/", paginated: false,
    arTitle: "أنميركو - أنميات مميزة", enTitle: "Animerco Featured Anime", emoji: "🔥", logo: LOGOS.animerco,
    itemRegex: /<div[^>]*class=["'][^"']*anime-card[^"']*["'][^>]*>[\s\S]*?<\/h3>[\s\S]*?<\/div>\s*<\/div>/gi, titleRegex: /<h3>([\s\S]*?)<\/h3>/i },
  { id: "witanime_latest", providerKey: "witanime", prefix: "witanime", group: "anime", type: "series", base: "https://witanime.site", pageUrl: () => "/", paginated: false,
    arTitle: "ويت أنمي - أحدث الحلقات", enTitle: "WitAnime Latest Anime", emoji: "🎌", logo: LOGOS.witanime,
    itemRegex: /<a[^>]*class=["'][^"']*@container[^"']*["'][^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/h3>/gi,
    linkRegex: /^<a[^>]*href=["']([^"']+)["']/i,
    titleRegex: /<h3[^>]*>([\s\S]*?)<\/h3>/i },
  { id: "animephoenix_latest", providerKey: "anime-phoenix", prefix: "animephoenix", group: "anime", type: "series", base: "https://anime-phoenix.com", pageUrl: () => "/", paginated: false,
    arTitle: "أنمي فينيكس - أحدث الحلقات", enTitle: "Anime Phoenix Latest Episodes", emoji: "🦅", logo: LOGOS["anime-phoenix"],
    itemRegex: /<a[^>]*class=["'][^"']*FJ-Phoenix-Anastasia-EpCard[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, linkRegex: /^<a[^>]*href=["']([^"']+)["']/i,
    titleRegex: /class=["'][^"']*FJ-Phoenix-Anastasia-EpCard-Name[^"']*["'][^>]*>([\s\S]*?)<\//i },
  { id: "replaymatch_latest", providerKey: "replaymatch", prefix: "replaymatch", group: "sports", type: "movie", base: "https://fullmatchshows.com", pageUrl: (n) => (n > 1 ? `/page/${n}/` : "/"),
    arTitle: "إعادة المباريات الكاملة - FullMatchShows", enTitle: "FullMatchShows Latest Football Replays", emoji: "⚽", logo: LOGOS.replaymatch,
    itemRegex: /<article[^>]*class=["'][^"']*bloglo-article[^"']*["'][^>]*>[\s\S]*?<\/article>/gi,
    titleRegex: /<h4[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i },
  // ---- Hindi / English movie sites from the CSX Cloudstream repository (github.com/SaurabhKaperwan/CSX, GPL-3.0).
  // Domains and page layouts follow that repository. These sites have no direct in-app links (download hosts only),
  // so they are browse-only (noResolve) and their detail pages are searched by the provider plugins.
  { id: "moviesmod_movies", providerKey: "moviesmod", prefix: "moviesmod", group: "hindi", noResolve: true, type: "movie", base: "https://moviesmod.meme", pageUrl: (n) => `/movies/page/${n}/`,
    arTitle: "موفيز مود - أحدث الأفلام", enTitle: "Moviesmod Latest Movies", emoji: "🎬", logo: LOGOS.moviesmod,
    itemRegex: /<article\b[\s\S]*?<\/article>/gi },
  { id: "moviesmod_series", providerKey: "moviesmod", prefix: "moviesmod", group: "hindi", noResolve: true, type: "series", base: "https://moviesmod.meme", pageUrl: (n) => `/web-series/on-going/page/${n}/`,
    arTitle: "موفيز مود - أحدث المسلسلات", enTitle: "Moviesmod Latest Web Series", emoji: "📺", logo: LOGOS.moviesmod,
    itemRegex: /<article\b[\s\S]*?<\/article>/gi },
  { id: "vegamovies_movies", providerKey: "vegamovies", prefix: "vegamovies", group: "hindi", noResolve: true, type: "movie", base: "https://1vegamovies.shop", pageUrl: (n) => `/page/${n}/`,
    arTitle: "فيغا موفيز - أحدث الأفلام", enTitle: "VegaMovies Latest Movies", emoji: "🎬", logo: LOGOS.vegamovies,
    itemRegex: /<a\b[^>]*>(?:(?!<\/a>)[\s\S])*?<img[\s\S]*?<\/a>/gi, titleRegex: /<img[^>]*alt=["']([^"']+)["']/i, keep: (t) => !SERIES_RE.test(t) },
  { id: "vegamovies_series", providerKey: "vegamovies", prefix: "vegamovies", group: "hindi", noResolve: true, type: "series", base: "https://1vegamovies.shop", pageUrl: (n) => `/category/web-series/page/${n}/`,
    arTitle: "فيغا موفيز - أحدث المسلسلات", enTitle: "VegaMovies Latest Web Series", emoji: "📺", logo: LOGOS.vegamovies,
    itemRegex: /<a\b[^>]*>(?:(?!<\/a>)[\s\S])*?<img[\s\S]*?<\/a>/gi, titleRegex: /<img[^>]*alt=["']([^"']+)["']/i },
  { id: "bollyflix_movies", providerKey: "bollyflix", prefix: "bollyflix", group: "hindi", noResolve: true, type: "movie", base: "https://bollyflix.church", pageUrl: (n) => (n > 1 ? `/movies/hollywood/page/${n}/` : "/movies/hollywood/"),
    arTitle: "بولي فليكس - أحدث الأفلام", enTitle: "Bollyflix Latest Movies", emoji: "🎬", logo: LOGOS.bollyflix,
    itemRegex: /<article\b[\s\S]*?<\/article>/gi, keep: (t) => !SERIES_RE.test(t) },
  { id: "bollyflix_series", providerKey: "bollyflix", prefix: "bollyflix", group: "hindi", noResolve: true, type: "series", base: "https://bollyflix.church", pageUrl: (n) => (n > 1 ? `/page/${n}/` : "/"),
    arTitle: "بولي فليكس - أحدث المسلسلات", enTitle: "Bollyflix Latest Series", emoji: "📺", logo: LOGOS.bollyflix,
    itemRegex: /<article\b[\s\S]*?<\/article>/gi, keep: (t) => SERIES_RE.test(t) },
  { id: "moviesdrive_movies", providerKey: "moviesdrive", prefix: "moviesdrive", group: "hindi", noResolve: true, type: "movie", base: "https://new1.moviesdrive.cyou", pageUrl: (n) => `/page/${n}`,
    arTitle: "موفيز درايف - أحدث الأفلام", enTitle: "MoviesDrive Latest Movies", emoji: "🎬", logo: LOGOS.moviesdrive,
    itemRegex: /<a\b[^>]*>(?:(?!<\/a>)[\s\S])*?<img[\s\S]*?<\/a>/gi, titleRegex: /<p[^>]*>([\s\S]*?)<\/p>/i, keep: (t) => !SERIES_RE.test(t) },
  { id: "moviesdrive_series", providerKey: "moviesdrive", prefix: "moviesdrive", group: "hindi", noResolve: true, type: "series", base: "https://new1.moviesdrive.cyou", pageUrl: (n) => `/page/${n}`,
    arTitle: "موفيز درايف - أحدث المسلسلات", enTitle: "MoviesDrive Latest Series", emoji: "📺", logo: LOGOS.moviesdrive,
    itemRegex: /<a\b[^>]*>(?:(?!<\/a>)[\s\S])*?<img[\s\S]*?<\/a>/gi, titleRegex: /<p[^>]*>([\s\S]*?)<\/p>/i, keep: (t) => SERIES_RE.test(t) },
];

function buildSources() {
  const S = [];
  // ---- Priority 2: CEE
  // CEE rows are turned off: cee.buzz only answers from Iraq, so they never updated from GitHub.
  // CEE is served live by the CNCVerse Bridge addon instead. Set SYNC_CEE=1 to bring these rows back.
  if (process.env.SYNC_CEE === "1") {
    S.push(ceeSource("cee_newly_movies", "movie", "أحدث أفلام CEE", "CEE Newly Added Movies", "🎬", ceeNewly, 1));
    S.push(ceeSource("cee_newly_series", "series", "أحدث مسلسلات CEE", "CEE Newly Added Series", "📺", ceeNewly, 2));
    S.push(ceeSource("cee_popular_movies", "movie", "الأكثر مشاهدة - أفلام CEE", "CEE Most Viewed Movies", "🔥", ceeVideo(1, "views_desc"), 1));
    S.push(ceeSource("cee_top_movies", "movie", "أعلى تقييم - أفلام CEE", "CEE Top Rated Movies", "⭐", ceeVideo(1, "stars_desc"), 1));
    S.push(ceeSource("cee_popular_series", "series", "الأكثر مشاهدة - مسلسلات CEE", "CEE Most Viewed Series", "🔥", ceeVideo(2, "views_desc"), 2));
    S.push(ceeSource("cee_top_series", "series", "أعلى تقييم - مسلسلات CEE", "CEE Top Rated Series", "⭐", ceeVideo(2, "stars_desc"), 2));
  }

  // ---- Priority 3: 3isk
  const eishkBases = ["https://3iskk.xyz", "https://3esk.onl"];
  S.push({ id: "3isk_latest_episodes", idPrefix: "3isk", bases: eishkBases, type: "series", arTitle: "قصة عشق - أحدث الحلقات التركية", enTitle: "3isk Latest Turkish Episodes", emoji: "🇹🇷", providerKey: "3isk", logo: LOGOS["3isk"], paginated: false,
    fetchPage: (n) => htmlSource(eishkBases.map((b) => `${b}/`), (h, o) => parse3isk(h, o, LOGOS["3isk"])) });
  S.push({ id: "3isk_turkish_series", idPrefix: "3isk", bases: eishkBases, type: "series", arTitle: "قصة عشق - المسلسلات التركية", enTitle: "3isk Turkish Series", emoji: "❤️", providerKey: "3isk", logo: LOGOS["3isk"],
    fetchPage: (n) => htmlSource(eishkBases.map((b) => `${b}/all-turkish-series/${n > 1 ? `page/${n}/` : ""}`), (h, o) => parse3isk(h, o, LOGOS["3isk"])) });

  // ---- Priority 4: AlooyTv (domain is discovered from the gate page once per run)
  const alooy = [
    ["alooy_latest_series", "/tv-series.html", "علوي تي في - أحدث المسلسلات", "AlooyTv Latest Series", "📺"],
    ["alooy_gulf_ramadan", "/genre/ramadan-kleeji-2026.html", "علوي تي في - مسلسلات خليجية", "AlooyTv Gulf Series", "🌙"],
    ["alooy_arabic_ramadan", "/genre/ramadan-arabi-2026.html", "علوي تي في - مسلسلات عربية", "AlooyTv Arabic Series", "🌟"],
    ["alooy_turkish_series", "/genre/turki.html", "علوي تي في - مسلسلات تركية", "AlooyTv Turkish Series", "🇹🇷"],
  ];
  for (const [id, p, ar, en, emoji] of alooy) {
    S.push({ id, idPrefix: "alooy", bases: ["@alooy"], type: "series", arTitle: ar, enTitle: en, emoji, providerKey: "alooytv", logo: LOGOS.alooytv,
      fetchPage: async (n) => {
        const domain = await alooyDomain();
        return htmlSource([`${domain}${p}${n > 1 ? `?page=${n}` : ""}`], (h, o) => parseAlooy(h, o, LOGOS.alooytv));
      } });
  }

  // ---- Priority 5: Akwam
  const akwam = [
    ["akwam_latest_movies", "movie", "/movies", "أكوام - أحدث الأفلام", "Akwam Latest Movies", "🎬"],
    ["akwam_latest_series", "series", "/series", "أكوام - أحدث المسلسلات", "Akwam Latest Series", "📺"],
    ["akwam_arabic_movies", "movie", "/movies?section=29", "أكوام - أفلام عربية", "Akwam Arabic Movies", "🎞️"],
    ["akwam_arabic_series", "series", "/series?section=29", "أكوام - مسلسلات عربية", "Akwam Arabic Series", "🌙"],
  ];
  for (const [id, type, p, ar, en, emoji] of akwam) {
    const withPage = (n) => (n > 1 ? `${p}${p.includes("?") ? "&" : "?"}page=${n}` : p);
    S.push({ id, idPrefix: "akwam", bases: ["https://akwam.ss", "https://ak.sv"], type, arTitle: ar, enTitle: en, emoji, providerKey: "akwam", logo: LOGOS.akwam,
      fetchPage: (n) => htmlSource(["https://akwam.ss", "https://ak.sv"].map((b) => b + withPage(n)), (h, o) => parseAkwam(h, type, o, LOGOS.akwam)) });
  }

  // ---- Priority 6+: everything else
  for (const cfg of GENERIC_SOURCES) {
    S.push({
      id: cfg.id, idPrefix: cfg.prefix, bases: cfg.bases || [cfg.base], type: cfg.type, arTitle: cfg.arTitle, enTitle: cfg.enTitle, emoji: cfg.emoji, providerKey: cfg.providerKey, group: cfg.group, logo: cfg.logo,
      paginated: cfg.paginated, noResolve: cfg.noResolve,
      fetchPage: (n) => htmlSource([cfg.base + cfg.pageUrl(n)], (h, o) => parseGeneric(h, o, cfg)),
    });
  }
  return S;
}

let _alooyDomain = null;
async function alooyDomain() {
  if (_alooyDomain) return _alooyDomain;
  let domain = "https://ga.alooytv16.xyz";
  const gate = await fetchText("https://fitnur.com/alooytv", 8000);
  if (gate && gate.ok && gate.text) {
    const dm = gate.text.match(/href=["'](https?:\/\/[^"']*alooytv[^"']*\.xyz)[^"']*["']/i);
    if (dm && dm[1]) domain = new URL(dm[1]).origin;
  }
  return (_alooyDomain = domain);
}

async function runPool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (i < tasks.length) { const k = i++; results[k] = await tasks[k](); }
  }));
  return results;
}

/* ----------------------------------------------------------------------------
 * Continuous sync with the CSX Cloudstream repository (github.com/SaurabhKaperwan/CSX, GPL-3.0).
 * Every run: read its current site domains (Utils/urls.json) and its extension list (builds/plugins.json),
 * point the CSX sources at the new domains, keep the provider plugins / plugins.json in step and report
 * new or updated extensions. When GitHub cannot be read the last saved copy in data/csx-sync.json is used.
 * -------------------------------------------------------------------------- */
const CSX_UTILS_URL = "https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json";
const CSX_PLUGINS_URL = "https://raw.githubusercontent.com/SaurabhKaperwan/CSX/builds/plugins.json";
const CSX_SITES = ["moviesmod", "vegamovies", "bollyflix", "moviesdrive"];
const CSX_KNOWN_EXTENSIONS = ["Bollyflix", "CineStream", "MoviesDrive", "Moviesmod", "VegaMovies"];

async function refreshCsxDomains() {
  const file = path.join(ROOT_DIR, "data", "csx-sync.json");
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) {}
  const u = await fetchJson(CSX_UTILS_URL, 8000);
  const p = await fetchJson(CSX_PLUGINS_URL, 8000);
  const live = u.ok && u.data && typeof u.data === "object" && !Array.isArray(u.data);
  const src = live ? u.data : (saved.domains || {});
  const domains = {};
  for (const key of CSX_SITES) {
    const v = String(src[key] || "").trim().replace(/\/+$/, "");
    if (/^https?:\/\/[^\s"']+$/.test(v)) domains[key] = v;
  }
  const plugins = p.ok && Array.isArray(p.data)
    ? p.data.map((x) => ({ name: x.internalName || x.name, version: x.version, status: x.status })).sort((a, b) => String(a.name).localeCompare(String(b.name)))
    : (saved.plugins || []);

  const changed = [];
  const pluginsJsonPath = path.join(ROOT_DIR, "plugins.json");
  let pluginsJson = null;
  try { pluginsJson = JSON.parse(fs.readFileSync(pluginsJsonPath, "utf8")); } catch (_) {}
  let pluginsJsonDirty = false;
  for (const [key, base] of Object.entries(domains)) {
    for (const cfg of GENERIC_SOURCES) {
      if (cfg.providerKey !== key) continue;
      if (cfg.base !== base) changed.push(`${cfg.id}: ${cfg.base} -> ${base}`);
      cfg.base = base;
      if (cfg.bases) cfg.bases = [base];
    }
    // keep the provider plugin's default site and the plugin list in step
    const pf = path.join(ROOT_DIR, "providers", `${key}.js`);
    try {
      const code = fs.readFileSync(pf, "utf8");
      const next = code.replace(/var DEFAULT_MAIN_URL = "[^"]*";/, `var DEFAULT_MAIN_URL = "${base}";`);
      if (next !== code) fs.writeFileSync(pf, next, "utf8");
    } catch (_) {}
    if (pluginsJson) {
      const entry = (Array.isArray(pluginsJson) ? pluginsJson : []).find((e) => e && e.id === key);
      if (entry && entry.mainUrl !== base) { entry.mainUrl = base; pluginsJsonDirty = true; }
    }
  }
  if (pluginsJsonDirty) fs.writeFileSync(pluginsJsonPath, JSON.stringify(pluginsJson, null, 2) + "\n", "utf8");

  const state = { domains, plugins };
  const text = JSON.stringify(state, null, 2) + "\n";
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text) fs.writeFileSync(file, text, "utf8");
  } catch (_) {}
  const newExtensions = plugins.filter((x) => x.name && !CSX_KNOWN_EXTENSIONS.includes(x.name)).map((x) => x.name);
  console.log(`🔄 CSX sync: domains ${live ? "read from GitHub" : "from saved copy"}${changed.length ? ", changed: " + changed.join("; ") : ", unchanged"}${newExtensions.length ? ", NEW extensions: " + newExtensions.join(", ") : ""}`);
  return { live, changed, newExtensions, plugins };
}

/**
 * Crawl every source, merge into data/store/*.json and return full (deduplicated, newest-first)
 * item lists plus a per-source health report.
 */
async function scrapeAllExtraCatalogs(options = {}) {
  const csx = await refreshCsxDomains();
  const sources = buildSources();
  const health = {};
  health._csx = { domainsFromGitHub: csx.live, domainsChanged: csx.changed, newExtensions: csx.newExtensions, extensions: csx.plugins.map((x) => `${x.name}@${x.version}`) };
  const catalogs = await runPool(sources.map((src) => async () => {
    const store = loadStore(src.id, src.type);
    const forwardPages = src.paginated === false ? 1 : 2;
    const res = await crawl(store, src.fetchPage, { forwardPages, backfillPages: options.backfillPages === undefined ? 6 : options.backfillPages, paginated: src.paginated });
    saveStore(store);
    health[src.id] = { provider: src.providerKey, items: res.total, reachable: res.reachable, backfillDone: res.done, lastOk: store.updatedAt, ...(res.reachable ? {} : { error: res.status || "unreachable" }) };
    console.log(`   ${res.reachable ? "🟢" : "🔴"} ${src.id}${res.reachable ? "" : " [" + (res.status || "unreachable") + "]"}: +${res.fresh} fresh, +${res.backfilled} backfill -> ${res.total} items${res.done ? " (complete)" : ""}`);
    return { ...src, metas: store.items };
  }), options.concurrency || 6);

  const by = (k) => catalogs.filter((c) => c.providerKey === k);
  const known = new Set(["cee", "3isk", "alooytv", "akwam"]);
  return {
    ceeCatalogs: by("cee"),
    eishkCatalogs: by("3isk"),
    alooyCatalogs: by("alooytv"),
    akwamCatalogs: by("akwam"),
    remainingCatalogs: catalogs.filter((c) => !known.has(c.providerKey)),
    health,
  };
}

module.exports = { alooyDomain, GENERIC_SOURCES, scrapeAllExtraCatalogs, buildSources, parse3isk, parseAlooy, parseAkwam, parseGeneric, ceeItemToMeta, LOGOS };
