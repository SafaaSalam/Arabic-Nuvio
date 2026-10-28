/**
 * AlooyTv - Nuvio JS Provider
 * Repository: https://github.com/SafaaSalam/Arabic-Nuvio
 *
 * Compatible with:
 * - NuvioTV (QuickJS 1.0.5)
 * - NuvioMobile (QuickJS 1.0.15)
 */

var GATEWAY_URL = "https://fitnur.com/alooytv";
var FALLBACK_DOMAIN = "https://ga.alooytv16.xyz";
var DEFAULT_TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
var PROVIDER_NAME = "AlooyTv";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function getSettings() {
  var s = (typeof globalThis !== "undefined" && globalThis.SCRAPER_SETTINGS) ? globalThis.SCRAPER_SETTINGS : {};
  return s || {};
}

function getTmdbKey() {
  if (typeof globalThis !== "undefined" && globalThis.TMDB_API_KEY && String(globalThis.TMDB_API_KEY).trim()) {
    return String(globalThis.TMDB_API_KEY).trim();
  }
  return DEFAULT_TMDB_API_KEY;
}

function decodeIdSlug(slug) {
  var pct = String(slug).replace(/~([0-9a-fA-F]{2})/g, "%$1");
  try { return decodeURIComponent(pct); } catch (e) { return pct; }
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

async function safeJsonFetch(url) {
  try {
    var res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }
    });
    if (!res || !res.ok || res.status === 0) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function resolveActiveDomain() {
  var s = getSettings();
  if (s.domain && String(s.domain).trim()) {
    return String(s.domain).trim().replace(/\/+$/, "");
  }
  var gate = await safeTextFetch(GATEWAY_URL);
  if (gate && gate.text) {
    var m = gate.text.match(/href=["'](https?:\/\/[^"']*alooytv[^"']*\.xyz)[^"']*["']/i);
    if (m && m[1]) {
      return m[1].replace(/\/+$/, "");
    }
  }
  return FALLBACK_DOMAIN;
}

async function resolveTargetInfo(rawId, mediaType) {
  var idStr = String(rawId || "").trim();
  if (idStr.indexOf("alooy_") === 0) {
    var slug = decodeIdSlug(idStr.slice(6).split(":")[0].replace(/__/g, "/"));
    return { customSlug: slug, titles: [] };
  }
  var normalizedType = (String(mediaType || "movie").toLowerCase() === "movie") ? "movie" : "tv";
  var tmdbKey = getTmdbKey();
  var cleanId = idStr.replace(/^(?:tmdb:|movie:|series:|tv:)/i, "").split(":")[0].trim();
  var tmdbId = null;

  if (/^tt\d+$/i.test(cleanId)) {
    var findData = await safeJsonFetch("https://api.themoviedb.org/3/find/" + cleanId + "?api_key=" + tmdbKey + "&external_source=imdb_id");
    if (findData) {
      var list = (normalizedType === "movie")
        ? (findData.movie_results && findData.movie_results.length ? findData.movie_results : findData.tv_results)
        : (findData.tv_results && findData.tv_results.length ? findData.tv_results : findData.movie_results);
      if (list && list.length > 0) tmdbId = String(list[0].id);
    }
  } else if (/^\d+$/.test(cleanId)) {
    tmdbId = cleanId;
  }

  if (!tmdbId) return { titles: [] };

  var details = await safeJsonFetch("https://api.themoviedb.org/3/" + normalizedType + "/" + tmdbId + "?api_key=" + tmdbKey + "&append_to_response=translations");
  if (!details) return { titles: [] };

  var titles = [];
  if (details.translations && Array.isArray(details.translations.translations)) {
    for (var i = 0; i < details.translations.translations.length; i++) {
      var tr = details.translations.translations[i];
      if (tr && tr.iso_639_1 === "ar" && tr.data) {
        var t = tr.data.title || tr.data.name;
        if (t && String(t).trim()) titles.push(String(t).trim());
      }
    }
  }
  var en = details.title || details.name;
  var orig = details.original_title || details.original_name;
  if (en && titles.indexOf(en) === -1) titles.push(en);
  if (orig && titles.indexOf(orig) === -1) titles.push(orig);
  return { titles: titles };
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var domain = await resolveActiveDomain();
    var targetInfo = await resolveTargetInfo(tmdbId, mediaType);
    var watchUrl = null;

    if (targetInfo.customSlug) {
      watchUrl = targetInfo.customSlug.indexOf("http") === 0
        ? targetInfo.customSlug
        : (domain + "/watch/" + targetInfo.customSlug.replace(/^\/+|\/+$/g, "") + (targetInfo.customSlug.indexOf(".html") !== -1 ? "" : ".html"));
    } else {
      for (var i = 0; i < targetInfo.titles.length; i++) {
        var q = targetInfo.titles[i];
        var sRes = await safeTextFetch(domain + "/search?q=" + encodeURIComponent(q), {
          headers: { Referer: domain + "/" }
        });
        if (!sRes || !sRes.text) continue;
        var m = sRes.text.match(/<div[^>]*class=["'][^"']*movie-title[^"']*["'][^>]*>[\s\S]*?<a[^>]*href=["']([^"']+)["']/i);
        if (m && m[1]) {
          watchUrl = m[1].indexOf("http") === 0 ? m[1] : (domain + "/" + m[1].replace(/^\/+/, ""));
          break;
        }
      }
    }

    if (!watchUrl) return [];

    var pageRes = await safeTextFetch(watchUrl, { headers: { Referer: domain + "/" } });
    if (!pageRes || !pageRes.text) return [];

    var targetHtml = pageRes.text;
    var epLinks = [];
    var epRegex = /<a[^>]*href=["']([^"']+\?key=[^"']+)["'][^>]*class=["'][^"']*btn-ep[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    var match;
    while ((match = epRegex.exec(pageRes.text)) !== null) {
      var href = match[1];
      var text = match[2].replace(/<[^>]+>/g, "").trim();
      var numM = text.match(/(\d+)/);
      epLinks.push({
        url: href.indexOf("http") === 0 ? href : (domain + "/" + href.replace(/^\/+/, "")),
        ep: numM ? parseInt(numM[1], 10) : (epLinks.length + 1),
        label: text
      });
    }

    if (epLinks.length > 0) {
      var targetEpNum = episode != null ? parseInt(episode, 10) : 1;
      var chosen = null;
      for (var j = 0; j < epLinks.length; j++) {
        if (epLinks[j].ep === targetEpNum) {
          chosen = epLinks[j];
          break;
        }
      }
      if (!chosen) chosen = epLinks[0];
      var epRes = await safeTextFetch(chosen.url, { headers: { Referer: watchUrl } });
      if (epRes && epRes.text) {
        targetHtml = epRes.text;
      }
    }

    var streams = [];
    var seen = {};
    var srcRegex = /<source[^>]*src=["']([^"']+)["']/gi;
    var sm;
    while ((sm = srcRegex.exec(targetHtml)) !== null) {
      var src = sm[1].trim();
      if (!src || src === "https://vid7.0" || seen[src]) continue;
      seen[src] = true;
      var isHls = src.indexOf(".m3u8") !== -1;
      streams.push({
        name: PROVIDER_NAME + " - HD",
        title: "AlooyTv \u2022 Direct " + (isHls ? "HLS" : "MP4"),
        url: src,
        quality: "720p",
        language: "ar",
        provider: "alooytv",
        type: isHls ? "hls" : "mp4",
        headers: {
          "User-Agent": USER_AGENT,
          "Referer": domain + "/"
        },
        subtitles: []
      });
    }

    return streams;
  } catch (err) {
    console.error("[AlooyTv] getStreams error: " + (err && err.message ? err.message : err));
    return [];
  }
}

function onSettings() {
  return [
    {
      type: "header",
      label: "AlooyTv Settings"
    },
    {
      type: "text",
      key: "domain",
      label: "Custom Domain Override (optional)",
      placeholder: FALLBACK_DOMAIN,
      defaultValue: ""
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
