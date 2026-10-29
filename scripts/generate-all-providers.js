#!/usr/bin/env node
/**
 * Generates all 36 remaining Nuvio JS providers in providers/*.js
 * (preserving hand-crafted cinemana.js, cee.js, 3isk.js, alooytv.js, akwam.js)
 * and writes sequenced manifest.json and plugins.json.
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const PROVIDERS_DIR = path.join(ROOT_DIR, "providers");
const RAW_BASE = "https://raw.githubusercontent.com/SafaaSalam/Arabic-Nuvio/main";

const PROVIDERS_CATALOG = [
  // === TOP 5 PRIORITY ===
  {
    id: "cinemana",
    name: "Shabakaty Cinemana (🇮🇶)",
    description: "Shabakaty Cinemana — Movies, Series, Ramadan & Anime with multi-quality streams and Arabic subtitles",
    version: "1.4.0",
    mainUrl: "https://cinemana.shabakaty.cc",
    logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTZlAGH56cEnNEL93W3QqZWpUe8XR8i90olTA&s",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries", "Anime"],
    preserveFile: true,
  },
  {
    id: "cee",
    name: "CEE (🇮🇶)",
    description: "CEE Buzz Iraq — Latest Movies, Series, Trending & Top Rated with multi-quality MP4 streams and Arabic subtitles",
    version: "1.2.0",
    mainUrl: "https://cee.buzz",
    logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSNEnHalnMz2EfG48BZUI6iC86seq09uafFngG8gz1OWQ&s=10",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries"],
    preserveFile: true,
  },
  {
    id: "3isk",
    name: "3isk | قصة عشق",
    description: "Qesat 3eshq (3isk) — Turkish Series & Movies with Arabic Subtitles and Dubbing",
    version: "1.2.0",
    mainUrl: "https://3iskk.xyz",
    logo: "https://3esk.onl/wp-content/uploads/2021/01/3isk-logo.png",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries"],
    preserveFile: true,
  },
  {
    id: "alooytv",
    name: "AlooyTv",
    description: "AlooyTv — Gulf, Arabic, Turkish & Persian Series and Ramadan Shows",
    version: "1.2.0",
    mainUrl: "https://fitnur.com/alooytv",
    logo: "https://fitnur.com/uploads/avatars/c5ae8dadf88bcea9549657ec451a1563.jpg",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries"],
    preserveFile: true,
  },
  {
    id: "akwam",
    name: "Akwam | أكوام",
    description: "Akwam — Arabic & Foreign Movies, Series, Ramadan & TV Shows in 1080p/720p/480p",
    version: "1.3.0",
    mainUrl: "https://akwam.ss",
    logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ2vuGLv4zY3XpoN2jza2unCQ95xFfypfe-h3k3xteMbGxl7taw-ziXyNg&s=10",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries"],
    preserveFile: true,
  },

  // === MOVIES, SERIES & DRAMA PROVIDERS ===
  {
    id: "faselhd",
    name: "FaselHD | فاصل إعلاني",
    description: "FaselHD — Movies, Series, Asian Drama & Anime with HLS streams",
    version: "1.3.0",
    mainUrl: "https://www.fasel-hd.co",
    logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ03aoQBNDy_Hkm5MUGGvluPvK7To7BdGiSnzQn7WJ3fQ&s=10",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries", "Anime", "AsianDrama"],
    searchPath: "/?s={query}",
  },
  {
    id: "mycima",
    name: "MyCima | ماي سيما",
    description: "MyCima — Arabic & Foreign Movies and Series",
    version: "1.1.0",
    mainUrl: "https://mycima.living",
    logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTxoF3lscri32oVf0iQlhbjFEoUn2xg3OmQIx4wYdDmqw&s",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries", "Anime"],
    searchPath: "/search/{query}",
  },
  {
    id: "shahid4u",
    name: "Shahid4u | شاهد فور يو",
    description: "Shahid4u — Arabic, Turkish & Foreign Movies, Series and Anime",
    version: "1.2.0",
    mainUrl: "https://shahed4u.im",
    logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS3Ig85ZYdRsjDw--peeI2RsBqOWmvnmvKKsT4UONdPMQ&s=10",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries", "Anime"],
    searchPath: "/search?s={query}",
  },
  {
    id: "topcinema",
    name: "Top Cinema | توب سينما",
    description: "Top Cinema — Latest Movies, Series & Box Office",
    version: "1.1.0",
    mainUrl: "https://web8.topcinema.cam",
    logo: "https://web8.topcinema.cam/wp-content/uploads/2023/05/cropped-icon-32x32.png",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries", "Anime"],
    searchPath: "/?s={query}",
  },
  {
    id: "wecima",
    name: "We Cima | وي سيما",
    description: "We Cima — Arabic & Foreign Movies and TV Series",
    version: "1.1.0",
    mainUrl: "https://wecima.ac",
    logo: "https://wecima.ac/static/img/favicon.png",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries"],
    searchPath: "/search/{query}/",
  },
  {
    id: "egydead",
    name: "EgyDead | ايجي ديد",
    description: "EgyDead — Movies, Series, Dubbed & Subtitled Shows",
    version: "1.1.0",
    mainUrl: "https://tv10.egydead.live",
    logo: "https://yt3.googleusercontent.com/ytc/AIdro_kgVTM6DJtx3tcS4gkPOOPnwFXKNhsrFyMRigWOlWomuQ=s900-c-k-c0x00ffffff-no-rj",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries"],
    searchPath: "/?s={query}",
  },
  {
    id: "egy",
    name: "EgyWatch",
    description: "EgyWatch — Movies, Series, Anime & Live Channels",
    version: "1.1.0",
    mainUrl: "https://rn62mwg.com/egywatchapp/public/api",
    logo: RAW_BASE + "/assets/icons/egy.png",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries", "Anime", "Live"],
    searchPath: "/search/{query}",
  },
  {
    id: "tuktukcima",
    name: "TukTukcima | توك توك سيما",
    description: "TukTukcima — Latest Movies, Series & Dubbed Content",
    version: "1.1.0",
    mainUrl: "https://tuktukcinemas.com",
    logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ10TEG3tTtkEF9_g3IslEP3xs0wx9EVhBs7b_H5M1gpg&s=10",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries", "Anime"],
    searchPath: "/?s={query}&page=1",
  },
  {
    id: "cimaclub",
    name: "CimaClub | سيما كلوب",
    description: "CimaClub — Arabic, Foreign, Turkish & Asian Movies and Series",
    version: "1.1.0",
    mainUrl: "https://cimacub.com",
    logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQX1z-0NYyzyEiFs4q7X9c8SSBR6kJtVl7f7A&s",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries"],
    searchPath: "/?s={query}",
  },
  {
    id: "cimalight",
    name: "CimaLight | سيما لايت",
    description: "CimaLight — Featured Movies, Series & Latest Episodes",
    version: "1.1.0",
    mainUrl: "https://r.cimalight.co",
    logo: "https://yt3.googleusercontent.com/n2PDvQiQVV00JjGsg66dvMZKmyoolvCeu59Xe40pmEvhiMNE1tHqKsoEY1IpfdNNXdlle4It=s900-c-k-c0x00ffffff-no-rj",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries"],
    searchPath: "/search.php?keywords={query}",
  },
  {
    id: "cimatn",
    name: "CimaTn | سيما تونس",
    description: "CimaTn — Tunisian, Arabic & Foreign Movies and Series",
    version: "1.1.0",
    mainUrl: "https://www.cimatn.com",
    logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS-7OxHmLaqTWIj7eJv55zxus1xKVp5ssQPAKYjydt7Lg&s",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries"],
    searchPath: "/search?q={query}",
  },
  {
    id: "lodynet",
    name: "LodyNet | لودي نت",
    description: "LodyNet — Turkish, Indian, Asian & Arabic Series and Movies",
    version: "1.2.0",
    mainUrl: "https://lodynet.watch",
    logo: "https://lodynet.watch/wp-content/themes/Lodynet2020/Img/Logo.webp",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries", "AsianDrama"],
    searchPath: "/?s={query}",
  },
  {
    id: "krmzy",
    name: "Krmzy | قرمزي",
    description: "Krmzy — Turkish Series with Arabic Subtitles & Dubbing",
    version: "1.1.0",
    mainUrl: "https://krmzi.org",
    logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRwTnAJOvyri3uHzHxjkEdlaBBKs8MAvIuJtFmCoo9u5qYiuFpHZjcl6tDi&s=10",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["TvSeries"],
    searchPath: "/?s={query}",
  },
  {
    id: "eseek",
    name: "Eseek | عشق 2",
    description: "Eseek (Qeseh) — Turkish Series & Movies in HD",
    version: "1.3.0",
    mainUrl: "https://qeseh.net",
    logo: "https://gesseh.net/wp-content/uploads/2024/10/keesatlogo.png",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries"],
    searchPath: "/?s={query}",
  },
  {
    id: "aia2tv",
    name: "Asia2TV | آسيا تو تي في",
    description: "Asia2TV — Korean, Japanese, Chinese & Thai Asian Drama and Movies",
    version: "1.3.0",
    mainUrl: "https://ww1.asia2tv.pw",
    logo: "https://media.licdn.com/dms/image/v2/C4D0BAQEhyYSi351HRw/company-logo_200_200/company-logo_200_200/0/1630489719119?e=2147483647&v=beta&t=Br69OJ2AwT5vdJHgl-DTvliEqOmp6VQLYwUWcFqG4u4",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries", "AsianDrama"],
    searchPath: "/?s={query}",
  },
  {
    id: "5tv",
    name: "5TV",
    description: "5TV — Movies, TV Series, Asian Drama & Anime",
    version: "1.1.0",
    mainUrl: "https://new61.5tv.lol",
    logo: RAW_BASE + "/assets/icons/5tv.png",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries", "AsianDrama", "Anime"],
    searchPath: "/search/?q={query}",
  },
  {
    id: "aflaam",
    name: "Aflaam | أفلام",
    description: "Aflaam — Arabic, Foreign & Indian Movies and Series with Direct MP4 Streams",
    version: "1.1.0",
    mainUrl: "https://aflaam.com",
    logo: "https://aflaam.com/style/assets/images/logo.png",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries"],
    searchPath: "/search?q={query}",
  },
  {
    id: "oscartv",
    name: "Oscar TV",
    description: "Oscar TV — Movies, Series, Anime & Live Channels (360p–1080p)",
    version: "1.1.0",
    mainUrl: "https://ostv-11-11.xyz",
    logo: RAW_BASE + "/assets/icons/oscartv.png",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries", "Anime", "Live"],
    searchPath: "/?s={query}",
  },
  {
    id: "viu",
    name: "Viu MENA",
    description: "Viu — Arabic, Turkish & Korean Series and Movies with Official Subtitles",
    version: "1.1.0",
    mainUrl: "https://www.viu.com",
    logo: "https://img.utdstc.com/icon/a99/c9e/a99c9ee56e731144b335282e9981a54a7584be93fc9644ad7a03b45552307876:200",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries", "AsianDrama"],
    searchPath: "/ott/iq/ar/search?q={query}",
  },
  {
    id: "shahidwbas",
    name: "ShahidWBas | شاهد وبس",
    description: "ShahidWBas — Arabic & Turkish Series and Movies",
    version: "1.1.0",
    mainUrl: "https://w30.shahidwbas.tv",
    logo: "https://cdn.wccftech.com/wp-content/uploads/2018/01/Youtube-music.png",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries"],
    searchPath: "/search.php?keywords={query}",
  },
  {
    id: "tuniflix",
    name: "TuniFlix",
    description: "TuniFlix — Tunisian, Arabic, Turkish & Foreign Movies and Series",
    version: "1.1.0",
    mainUrl: "https://tuniflix.site",
    logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTe95deIIAAbyR9ArSievPWdM2QwiVG9bbQ6Y1uDIbRBpathzSs45b8uQ4&s=10",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries"],
    searchPath: "/?s={query}",
  },
  {
    id: "tuniflexblog",
    name: "TuniFlix Blog",
    description: "TuniFlix Blog — Tunisian & Arabic Movies and Series",
    version: "1.1.0",
    mainUrl: "https://ttunflix.blogspot.com",
    logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSo47ccjaIfUnxJjGujQd6qTKTZH70W6LFeaFXht5TE8w&s",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries"],
    searchPath: "/feeds/posts/default?alt=json&q={query}&max-results=20",
  },
  {
    id: "elif",
    name: "Elif | إليف",
    description: "Elif News — Turkish, Arabic, Indian & Anime Series and Movies",
    version: "1.1.0",
    mainUrl: "https://n.elif.news",
    logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQq14Sk88U37tIhiRndbNczqn0ectswZly90f1oCa_zbg&s=10",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries", "Anime"],
    searchPath: "/search.php?keywords={query}",
  },

  // === ANIME & CARTOON PROVIDERS ===
  {
    id: "anim3rb",
    name: "Anime3rb | أنمي عرب",
    description: "Anime3rb — Subtitled Anime Series, Movies & OVAs",
    version: "1.1.0",
    mainUrl: "https://anime3rb.com",
    logo: "https://images.anime3rb.com/favicon/apple-touch-icon.png",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Anime", "AnimeMovie", "OVA"],
    searchPath: "/search?q={query}",
  },
  {
    id: "anime4up",
    name: "Anime4Up | أنمي فور أب",
    description: "Anime4Up — Arabic Subtitled Anime Series & Movies",
    version: "1.1.0",
    mainUrl: "https://w1.anime4up.rest",
    logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTkVDfHjqUpRyrWJjW8wUHH87BhSO6B9uxI-B80sAy_AQ&s=10",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Anime", "AnimeMovie", "OVA"],
    searchPath: "/?s={query}",
  },
  {
    id: "animerco",
    name: "Animerco | أنميركو",
    description: "Animerco — Featured Anime Series, Episodes & Anime Movies",
    version: "1.3.0",
    mainUrl: "https://eva.animerco.org",
    logo: RAW_BASE + "/assets/icons/animerco.png",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Anime", "AnimeMovie", "OVA"],
    searchPath: "/?s={query}",
  },
  {
    id: "animewitcher",
    name: "AnimeWitcher | أنمي ويتشر",
    description: "AnimeWitcher — Arabic Anime Series & Movies via Algolia Search",
    version: "1.3.0",
    mainUrl: "https://animewitcher.com",
    logo: RAW_BASE + "/assets/icons/animewitcher.png",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Anime", "AnimeMovie"],
    searchPath: "/?s={query}",
  },
  {
    id: "witanime",
    name: "WitAnime | ويت أنمي",
    description: "WitAnime — Latest Anime Episodes & Anime Movies with Arabic Subtitles",
    version: "1.1.0",
    mainUrl: "https://witanime.site",
    logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ7AH2oC7LwumXRpHM8_WLpIFvDIfmS67jkjlhsCKpPaZdqcneigzUQX4g&s=10",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Anime", "AnimeMovie"],
    searchPath: "/?search_param=animes&s={query}",
  },
  {
    id: "anime-phoenix",
    name: "Anime Phoenix | أنمي فينيكس",
    description: "Anime Phoenix — Arabic Subtitled Anime Episodes & Movies",
    version: "1.1.0",
    mainUrl: "https://anime-phoenix.com",
    logo: "https://yt3.googleusercontent.com/mBIIR5cqQC4Y-o7HaxbkJfs305X6tbHLSNPk6MRMCDJsH8xP0SfGhK-CBDpSmH95wSff9z99sg=s900-c-k-c0x00ffffff-no-rj",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Anime", "AnimeMovie"],
    searchPath: "/search/?q={query}",
  },
  {
    id: "animerift",
    name: "AnimeRift",
    description: "AnimeRift — Arabic Subtitled Anime Streaming",
    version: "1.1.0",
    mainUrl: "https://gateway.embrassme.top/api/v4",
    logo: RAW_BASE + "/assets/icons/animerift.png",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Anime"],
    searchPath: "/anime/search?q={query}",
  },
  {
    id: "bristege",
    name: "Bristege | برستيج",
    description: "Bristege — Arabic Series, Ramadan Shows & Movies",
    version: "1.1.0",
    mainUrl: "https://amd.brstej.com",
    logo: "https://amd.brstej.com/22.png",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "TvSeries"],
    searchPath: "/search.php?keywords={query}",
  },
  {
    id: "dima-toon",
    name: "Dima Toon | ديما تون",
    description: "Dima Toon — Dubbed & Subtitled Cartoons and Animated Series",
    version: "1.1.0",
    mainUrl: "https://www.dima-toon.com",
    logo: "https://www.dima-toon.com/wp-content/uploads/2025/10/DimaToonlogo11.png",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Cartoon", "TvSeries", "Movie"],
    searchPath: "/?s={query}",
  },

  // === LIVE TV & SPORTS PROVIDERS ===
  {
    id: "yacintv",
    name: "Yacine TV | ياسين تيفي",
    description: "Yacine TV — Live Sports, News & Arabic TV Channels",
    version: "1.1.0",
    mainUrl: "https://def11.ycnapi.com/api",
    logo: "https://yt3.googleusercontent.com/ulm35tweg3do5istps0TgCjMmJSVczGUL2NIrXMwI1DDRi5ty29BIzQSUHVgqZN5CSo1PHhiA6M=s900-c-k-c0x00ffffff-no-rj",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Live"],
    searchPath: "/channels",
  },
  {
    id: "syria-live",
    name: "SyriaLive | سوريا لايف",
    description: "SyriaLive — Live Football Matches & Sports Broadcasts",
    version: "1.1.0",
    mainUrl: "https://www.syrlive.com",
    logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSF607wnarFL8Ob8KLPahUPJzcLjbtg1pEH0A&s",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Live", "Movie"],
    searchPath: "/?s={query}",
  },
  {
    id: "replaymatch",
    name: "FullMatchShows | ReplayMatch",
    description: "FullMatchShows — Full Football Match Replays & Highlights (Premier League, La Liga, UCL)",
    version: "1.2.0",
    mainUrl: "https://fullmatchshows.com",
    logo: "https://fullmatchshows.com/wp-content/uploads/2024/04/LOGOSASO.png",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie"],
    searchPath: "/?s={query}",
  },
  {
    id: "tvgarden",
    name: "TVgarden (Famelack)",
    description: "TVgarden (Famelack) — Worldwide & Arabic Live TV Channels",
    version: "1.1.0",
    mainUrl: "https://famelack.com",
    logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS9Lci-tXtOtWaHcEp9An7bqIkXs4yzH7EcfA&s",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Live"],
    searchPath: "/tv",
  },
  {
    id: "youtube",
    name: "YouTube Arabic",
    description: "YouTube — Live Streams, Movies & Arabic Channels",
    version: "1.2.0",
    mainUrl: "https://www.youtube.com",
    logo: RAW_BASE + "/assets/icons/youtube.jpg",
    supportedTypes: ["movie", "tv"],
    tvTypes: ["Movie", "Live"],
    searchPath: "/results?search_query={query}",
  },
];

const EPISODE_HELPER = fs.readFileSync(path.join(__dirname, "templates", "episode-helper.js"), "utf8");

function buildProviderSource(p) {
  const prefix = p.id.replace(/[^a-z0-9]/gi, "") + "_";
  return `/**
 * ${p.name} - Nuvio JS Provider
 * Repository: https://github.com/SafaaSalam/Arabic-Nuvio
 *
 * Compatible with:
 * - NuvioTV (QuickJS 1.0.5)
 * - NuvioMobile (QuickJS 1.0.15)
 */

var DEFAULT_MAIN_URL = ${JSON.stringify(p.mainUrl)};
var DEFAULT_TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
var PROVIDER_ID = ${JSON.stringify(p.id)};
var PROVIDER_NAME = ${JSON.stringify(p.name)};
var CUSTOM_PREFIX = ${JSON.stringify(prefix)};
var SEARCH_PATH = ${JSON.stringify(p.searchPath || "/?s={query}")};
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function getSettings() {
  var s = (typeof globalThis !== "undefined" && globalThis.SCRAPER_SETTINGS) ? globalThis.SCRAPER_SETTINGS : {};
  return s || {};
}

function getMainUrl() {
  var s = getSettings();
  var domain = (s.domain && String(s.domain).trim()) ? String(s.domain).trim() : DEFAULT_MAIN_URL;
  return domain.replace(/\\/+$/, "");
}

function getTmdbKey() {
  if (typeof globalThis !== "undefined" && globalThis.TMDB_API_KEY && String(globalThis.TMDB_API_KEY).trim()) {
    return String(globalThis.TMDB_API_KEY).trim();
  }
  return DEFAULT_TMDB_API_KEY;
}

async function safeTextFetch(url, options) {
  try {
    var opts = options || {};
    var headers = Object.assign({
      "User-Agent": USER_AGENT,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }, opts.headers || {});
    var res = await fetch(url, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body
    });
    if (!res || !res.ok || res.status === 0) return null;
    var text = await res.text();
    return { text: text, url: res.url || url };
  } catch (e) {
    return null;
  }
}

async function safeJsonFetch(url, options) {
  try {
    var opts = options || {};
    var headers = Object.assign({
      "User-Agent": USER_AGENT,
      "Accept": "application/json, text/plain, */*"
    }, opts.headers || {});
    var res = await fetch(url, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body
    });
    if (!res || !res.ok || res.status === 0) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

${EPISODE_HELPER}

function fixUrl(url, baseUrl) {
  if (!url) return "";
  var u = String(url).trim();
  if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.indexOf("/") === 0) return baseUrl + u;
  return baseUrl + "/" + u;
}

function unpackDeanEdwards(evalText) {
  try {
    var m = evalText.match(/}\\s*\\(\\s*(['"])([\\s\\S]*?)\\1\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(['"])([\\s\\S]*?)\\5\\.split\\(['"]\\|['"]\\)/);
    if (!m) return null;
    var p = m[2];
    var a = parseInt(m[3], 10);
    var c = parseInt(m[4], 10);
    var k = m[6].split("|");
    var chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    function toBase(num, radix) {
      if (num === 0) return "0";
      var n = num;
      var out = "";
      while (n > 0) {
        out = chars[n % radix] + out;
        n = Math.floor(n / radix);
      }
      return out;
    }
    var dict = {};
    for (var i = 0; i < c; i++) {
      var key = toBase(i, a);
      dict[key] = (i < k.length && k[i]) ? k[i] : key;
    }
    return p.replace(/\\b\\w+\\b/g, function (w) {
      return dict[w] !== undefined ? dict[w] : w;
    });
  } catch (e) {
    return null;
  }
}

async function resolveTargetInfo(rawId, mediaType) {
  var idStr = String(rawId || "").trim();
  if (idStr.indexOf(CUSTOM_PREFIX) === 0) {
    var slug = decodeIdSlug(idStr.slice(CUSTOM_PREFIX.length).split(":")[0].replace(/__/g, "/"));
    return { customSlug: slug, titles: [] };
  }
  if (idStr.indexOf(PROVIDER_ID + "_") === 0) {
    var slug2 = decodeIdSlug(idStr.slice((PROVIDER_ID + "_").length).split(":")[0].replace(/__/g, "/"));
    return { customSlug: slug2, titles: [] };
  }

  var normalizedType = (String(mediaType || "movie").toLowerCase() === "movie") ? "movie" : "tv";

  var malMatch = idStr.match(/^mal:(\\d+)(?::(\\d+))?$/i);
  if (malMatch) {
    var malId = malMatch[1];
    var aniRes = await safeJsonFetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "query($idMal: Int){Media(idMal: $idMal, type: ANIME){title{romaji english}}}",
        variables: { idMal: parseInt(malId, 10) }
      })
    });
    var media = aniRes && aniRes.data && aniRes.data.Media ? aniRes.data.Media : null;
    var malTitles = [];
    if (media && media.title) {
      if (media.title.english) malTitles.push(media.title.english);
      if (media.title.romaji && malTitles.indexOf(media.title.romaji) === -1) malTitles.push(media.title.romaji);
    }
    return { titles: malTitles };
  }

  var tmdbKey = getTmdbKey();
  var cleanId = idStr.replace(/^(?:tmdb:|movie:|series:|tv:)/i, "").split(":")[0].trim();
  var tmdbId = null;

  if (/^tt\\d+$/i.test(cleanId)) {
    var findData = await safeJsonFetch("https://api.themoviedb.org/3/find/" + cleanId + "?api_key=" + tmdbKey + "&external_source=imdb_id");
    if (findData) {
      var list = (normalizedType === "movie")
        ? (findData.movie_results && findData.movie_results.length ? findData.movie_results : findData.tv_results)
        : (findData.tv_results && findData.tv_results.length ? findData.tv_results : findData.movie_results);
      if (list && list.length > 0) tmdbId = String(list[0].id);
    }
  } else if (/^\\d+$/.test(cleanId)) {
    tmdbId = cleanId;
  }

  if (!tmdbId) return { titles: [] };

  var details = await safeJsonFetch("https://api.themoviedb.org/3/" + normalizedType + "/" + tmdbId + "?api_key=" + tmdbKey + "&append_to_response=translations");
  if (!details) return { titles: [] };

  var titles = [];
  var en = details.title || details.name;
  var orig = details.original_title || details.original_name;
  if (en && titles.indexOf(en) === -1) titles.push(en);
  if (orig && titles.indexOf(orig) === -1) titles.push(orig);

  if (details.translations && Array.isArray(details.translations.translations)) {
    for (var i = 0; i < details.translations.translations.length; i++) {
      var tr = details.translations.translations[i];
      if (tr && tr.iso_639_1 === "ar" && tr.data) {
        var t = tr.data.title || tr.data.name;
        if (t && String(t).trim() && titles.indexOf(String(t).trim()) === -1) {
          titles.push(String(t).trim());
        }
      }
    }
  }
  return { titles: titles };
}

async function extractMediaFromHtml(htmlRaw, pageUrl, baseUrl) {
  var results = [];
  if (!htmlRaw) return results;
  var html = htmlRaw.replace(/\\\\\\//g, "/");

  // 1. Direct <source> / <video> tags
  var srcRegex = /<(?:source|video)[^>]*src=["']([^"']+)["'][^>]*>/gi;
  var sm;
  while ((sm = srcRegex.exec(html)) !== null) {
    var src = fixUrl(sm[1], baseUrl);
    if (src && (src.indexOf(".mp4") !== -1 || src.indexOf(".m3u8") !== -1)) {
      var qM = sm[0].match(/size=["']?(\\d+)["']?/i) || src.match(/(\\d{3,4})p/i);
      results.push({
        url: src,
        quality: qM ? (qM[1] + "p") : "720p",
        referer: pageUrl,
        label: "Direct"
      });
    }
  }

  // 2. Dean Edwards packed JS
  var evalMatches = html.match(/eval\\s*\\(\\s*function\\s*\\(\\s*p\\s*,\\s*a\\s*,\\s*c\\s*,\\s*k\\s*,\\s*e\\s*,\\s*d\\s*\\)[\\s\\S]{1,15000}/gi) || [];
  for (var eIdx = 0; eIdx < evalMatches.length; eIdx++) {
    var unpacked = unpackDeanEdwards(evalMatches[eIdx]);
    if (unpacked) {
      var packedMedia = unpacked.match(/https?:\\/\\/[^\\s"'<>\\\\]+\\.(?:m3u8|mp4)[^\\s"'<>\\\\]*/gi) || [];
      for (var pIdx = 0; pIdx < packedMedia.length; pIdx++) {
        results.push({
          url: packedMedia[pIdx],
          quality: "1080p",
          referer: pageUrl,
          label: "Packed Server"
        });
      }
    }
  }

  // 3. Direct m3u8 / mp4 links in scripts
  var directMatches = html.match(/https?:\\/\\/[^\\s"'<>\\\\]+\\.(?:m3u8|mp4)[^\\s"'<>\\\\]*/gi) || [];
  for (var dIdx = 0; dIdx < directMatches.length; dIdx++) {
    var u = directMatches[dIdx];
    if (u.indexOf(".jpg") === -1 && u.indexOf(".png") === -1) {
      results.push({
        url: u,
        quality: u.indexOf("1080") !== -1 ? "1080p" : (u.indexOf("720") !== -1 ? "720p" : "HD"),
        referer: pageUrl,
        label: "Stream"
      });
    }
  }

  // 4. Iframes / data-embed / data-watch / data-server (up to 3 embeds)
  var embedUrls = [];
  var embedRegex = /(?:<iframe[^>]*src|data-embed|data-watch|data-server|data-src)=["']([^"']+)["']/gi;
  var em;
  while ((em = embedRegex.exec(html)) !== null) {
    var eUrl = fixUrl(em[1], baseUrl);
    if (
      eUrl &&
      eUrl.indexOf("http") === 0 &&
      eUrl.indexOf("facebook.com") === -1 &&
      eUrl.indexOf("google.com") === -1 &&
      eUrl.indexOf("youtube.com/embed") === -1 &&
      !/\\.(?:jpg|jpeg|png|webp|svg|gif)(?:\\?|$)/i.test(eUrl) &&
      embedUrls.indexOf(eUrl) === -1
    ) {
      embedUrls.push(eUrl);
    }
  }

  for (var i = 0; i < Math.min(embedUrls.length, 3); i++) {
    var emb = embedUrls[i];
    var eRes = await safeTextFetch(emb, { headers: { Referer: pageUrl } });
    if (!eRes || !eRes.text) continue;
    var eHtml = eRes.text.replace(/\\\\\\//g, "/");

    var pbMatch = eHtml.match(/https?:\\/\\/[^"'\\s]+\\/api\\/videos\\/[^"'\\s]+\\/playback[^"'\\s]*/i);
    if (pbMatch) {
      var pbJson = await safeJsonFetch(pbMatch[0], { headers: { Referer: emb } });
      if (pbJson && pbJson.url) {
        results.push({ url: pbJson.url, quality: "1080p", referer: emb, label: "HLS Server" });
      }
    }

    if (eHtml.indexOf("function(p,a,c,k,e,d)") !== -1) {
      var unp = unpackDeanEdwards(eHtml);
      if (unp) {
        var um = unp.match(/https?:\\/\\/[^\\s"'<>\\\\]+\\.(?:m3u8|mp4)[^\\s"'<>\\\\]*/gi) || [];
        for (var k = 0; k < um.length; k++) {
          results.push({ url: um[k], quality: "1080p", referer: emb, label: "Embed Server " + (i + 1) });
        }
      }
    }

    var dm = eHtml.match(/https?:\\/\\/[^\\s"'<>\\\\]+\\.(?:m3u8|mp4)[^\\s"'<>\\\\]*/gi) || [];
    for (var j = 0; j < dm.length; j++) {
      results.push({ url: dm[j], quality: "720p", referer: emb, label: "Embed " + (i + 1) });
    }
  }

  return results;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var mainUrl = getMainUrl();

    // Special handler for TVgarden (Famelack Live Channels JSON)
    if (PROVIDER_ID === "tvgarden") {
      var channels = await safeJsonFetch("https://raw.githubusercontent.com/famelack/famelack-data/refs/heads/main/tv/raw/categories/all.json");
      if (!Array.isArray(channels)) return [];
      var qStr = String(tmdbId || "").replace(/^tvgarden_/, "").toLowerCase();
      var out = [];
      for (var cIdx = 0; cIdx < channels.length; cIdx++) {
        var ch = channels[cIdx];
        if (!ch || !ch.sources || !Array.isArray(ch.sources.streams) || !ch.sources.streams.length) continue;
        if ((ch.nanoid && ch.nanoid.toLowerCase() === qStr) || (ch.name && ch.name.toLowerCase().indexOf(qStr) !== -1)) {
          out.push({
            name: PROVIDER_NAME + " - Live",
            title: (ch.name || "Live Channel") + " \\u2022 Live Stream",
            url: ch.sources.streams[0],
            quality: "1080p",
            language: "ar",
            provider: PROVIDER_ID,
            type: "hls",
            headers: { "User-Agent": USER_AGENT },
            subtitles: []
          });
          if (out.length >= 5) break;
        }
      }
      return out;
    }

    var targetInfo = await resolveTargetInfo(tmdbId, mediaType);
    var targetUrl = null;

    if (targetInfo.customSlug) {
      targetUrl = targetInfo.customSlug.indexOf("http") === 0
        ? targetInfo.customSlug
        : fixUrl(targetInfo.customSlug, mainUrl);
    } else {
      for (var i = 0; i < targetInfo.titles.length; i++) {
        var q = targetInfo.titles[i];
        var sUrl = mainUrl + SEARCH_PATH.replace("{query}", encodeURIComponent(q));
        var sRes = await safeTextFetch(sUrl, { headers: { Referer: mainUrl + "/" } });
        if (!sRes || !sRes.text) continue;

        targetUrl = pickBestSearchResult(sRes.text, sRes.url || mainUrl, targetInfo.titles);
        if (targetUrl) break;
      }
    }

    if (!targetUrl) return [];

    var episodeResolved = false;
    if (String(mediaType || "").toLowerCase() !== "movie" && episode != null && targetInfo.customSlug) {
      var epMeta = await lookupEpisodeMeta(tmdbId, season, episode);
      if (epMeta && epMeta.episodeUrl) {
        targetUrl = epMeta.episodeUrl;
        episodeResolved = true;
      } else if (epMeta && epMeta.website) {
        targetUrl = epMeta.website;
      }
    }

    var pageRes = await safeTextFetch(targetUrl, { headers: { Referer: mainUrl + "/" } });
    if (!pageRes || !pageRes.text) return [];
    var html = pageRes.text;
    var finalPageUrl = pageRes.url || targetUrl;

    // TV episode: use the exact URL scraped at sync time, else find the episode link on the series page
    if (String(mediaType || "").toLowerCase() !== "movie" && episode != null && !episodeResolved) {
      var epUrl = findEpisodeUrl(html, finalPageUrl, season, episode);
      if (epUrl) {
        var epRes = await safeTextFetch(epUrl, { headers: { Referer: finalPageUrl } });
        if (epRes && epRes.text) {
          html = epRes.text;
          finalPageUrl = epRes.url || epUrl;
        }
      }
    }

    // Check if there is an intermediate watch link (e.g. a.watch_player, a.xtgo, /watching/, /watch/)
    var watchBtnMatch = html.match(/<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*(?:watch_player|xtgo|link-show)[^"']*["']|<a[^>]*class=["'][^"']*(?:watch_player|xtgo|link-show)[^"']*["'][^>]*href=["']([^"']+)["']/i);
    if (watchBtnMatch && (watchBtnMatch[1] || watchBtnMatch[2])) {
      var wUrl = fixUrl(watchBtnMatch[1] || watchBtnMatch[2], mainUrl);
      var wRes = await safeTextFetch(wUrl, { headers: { Referer: finalPageUrl } });
      if (wRes && wRes.text) {
        html = wRes.text + "\\n" + html;
      }
    }

    var extracted = await extractMediaFromHtml(html, finalPageUrl, mainUrl);
    var streams = [];
    var seen = {};

    for (var k = 0; k < extracted.length; k++) {
      var item = extracted[k];
      if (!item || !item.url || seen[item.url]) continue;
      seen[item.url] = true;
      var isHls = item.url.indexOf(".m3u8") !== -1;
      streams.push({
        name: PROVIDER_NAME + " - " + (item.quality || "HD"),
        title: PROVIDER_NAME + " \\u2022 " + (item.label || "Stream") + " (" + (isHls ? "HLS" : "MP4") + ")",
        url: item.url,
        quality: item.quality || "1080p",
        language: "ar",
        provider: PROVIDER_ID,
        type: isHls ? "hls" : "mp4",
        headers: {
          "User-Agent": USER_AGENT,
          "Referer": item.referer || finalPageUrl
        },
        subtitles: []
      });
    }

    return streams;
  } catch (err) {
    console.error("[" + PROVIDER_NAME + "] getStreams error: " + (err && err.message ? err.message : err));
    return [];
  }
}

function onSettings() {
  return [
    {
      type: "header",
      label: PROVIDER_NAME + " Settings"
    },
    {
      type: "text",
      key: "domain",
      label: "Base URL",
      placeholder: DEFAULT_MAIN_URL,
      defaultValue: DEFAULT_MAIN_URL
    }
  ];
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams, onSettings: onSettings };
}
if (typeof globalThis !== "undefined") {
  globalThis.getStreams = getStreams;
  globalThis.onSettings = onSettings;
}
`;
}

fs.mkdirSync(PROVIDERS_DIR, { recursive: true });

let generatedCount = 0;
for (const p of PROVIDERS_CATALOG) {
  const filename = path.join(PROVIDERS_DIR, `${p.id}.js`);
  if (p.preserveFile && fs.existsSync(filename)) {
    continue;
  }
  const code = buildProviderSource(p);
  fs.writeFileSync(filename, code, "utf8");
  generatedCount++;
}

// Write sequenced manifest.json
const manifest = {
  name: "Arabic Nuvio | الإضافات العربية الشاملة",
  description: "Comprehensive Arabic Nuvio Providers & Collections — Sequenced starting with Shabakaty Cinemana, CEE, 3isk, AlooyTv, Akwam, and 36+ Arabic Movie, Series, Anime & Live TV sources.",
  version: "2.0.0",
  author: "SafaaSalam",
  scrapers: PROVIDERS_CATALOG.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    version: p.version,
    author: "SafaaSalam",
    supportedTypes: p.supportedTypes,
    filename: `providers/${p.id}.js`,
    enabled: true,
    logo: p.logo,
    contentLanguage: ["ar"],
    formats: ["mp4", "hls", "m3u8"],
    supportsExternalPlayer: true,
  })),
};

fs.writeFileSync(path.join(ROOT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

// Write sequenced plugins.json
const plugins = PROVIDERS_CATALOG.map((p) => ({
  id: p.id,
  name: p.name,
  internalName: p.name,
  description: p.description,
  version: 2,
  authors: ["SafaaSalam"],
  language: "ar",
  status: 1,
  tvTypes: p.tvTypes,
  iconUrl: p.logo,
  mainUrl: p.mainUrl,
  url: `${RAW_BASE}/providers/${p.id}.js`,
}));

fs.writeFileSync(path.join(ROOT_DIR, "plugins.json"), JSON.stringify(plugins, null, 2) + "\n", "utf8");

console.log(`Generated ${generatedCount} provider JS files. Total providers in manifest.json & plugins.json: ${PROVIDERS_CATALOG.length}`);
