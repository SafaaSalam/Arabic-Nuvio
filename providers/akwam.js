/**
 * Akwam | أكوام - Nuvio JS Provider
 * Repository: https://github.com/SafaaSalam/Arabic-Nuvio
 *
 * Compatible with:
 * - NuvioTV (QuickJS 1.0.5)
 * - NuvioMobile (QuickJS 1.0.15)
 */

var DEFAULT_MAIN_URL = "https://akwam.ss";
var DEFAULT_TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
var PROVIDER_NAME = "Akwam | \u0623\u0643\u0648\u0627\u0645";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function getSettings() {
  var s = (typeof globalThis !== "undefined" && globalThis.SCRAPER_SETTINGS) ? globalThis.SCRAPER_SETTINGS : {};
  return s || {};
}

function getMainUrl() {
  var s = getSettings();
  var domain = (s.domain && String(s.domain).trim()) ? String(s.domain).trim() : DEFAULT_MAIN_URL;
  return domain.replace(/\/+$/, "");
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

async function resolveTargetInfo(rawId, mediaType) {
  var idStr = String(rawId || "").trim();
  if (idStr.indexOf("akwam_") === 0) {
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

  var rawDate = details.release_date || details.first_air_date || "";
  var ym = String(rawDate).match(/^(\d{4})/);
  return { titles: titles, year: ym ? ym[1] : null };
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var mainUrl = getMainUrl();
    var normalizedType = (String(mediaType || "movie").toLowerCase() === "movie") ? "movie" : "tv";
    var targetInfo = await resolveTargetInfo(tmdbId, normalizedType);
    var itemUrl = null;

    if (targetInfo.customSlug) {
      itemUrl = targetInfo.customSlug.indexOf("http") === 0
        ? targetInfo.customSlug
        : (mainUrl + "/" + targetInfo.customSlug.replace(/^\/+/, ""));
    } else {
      for (var i = 0; i < targetInfo.titles.length; i++) {
        var q = targetInfo.titles[i];
        var searchUrl = mainUrl + "/search?q=" + encodeURIComponent(q) + (normalizedType === "movie" ? "&section=movie" : "&section=series");
        var sRes = await safeTextFetch(searchUrl);
        if (!sRes || !sRes.text) continue;

        var entryRegex = /<h3[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>\s*<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        var em;
        while ((em = entryRegex.exec(sRes.text)) !== null) {
          var href = em[1];
          if (normalizedType === "movie" && href.indexOf("/movie/") !== -1) {
            itemUrl = href;
            break;
          }
          if (normalizedType !== "movie" && (href.indexOf("/series/") !== -1 || href.indexOf("/shows/") !== -1)) {
            itemUrl = href;
            break;
          }
        }
        if (itemUrl) break;
      }
    }

    if (!itemUrl) return [];

    var itemRes = await safeTextFetch(itemUrl);
    if (!itemRes || !itemRes.text) return [];
    var pageHtml = itemRes.text;

    if (normalizedType === "tv" && pageHtml.indexOf("/episode/") !== -1) {
      var targetEp = episode != null ? parseInt(episode, 10) : 1;
      var epLinks = [];
      var epRegex = /<a[^>]*href=["'](https?:\/\/[^"']*\/episode\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      var epM;
      while ((epM = epRegex.exec(pageHtml)) !== null) {
        var epHref = epM[1];
        var epTitle = epM[2].replace(/<[^>]+>/g, "").trim();
        var numMatch = epTitle.match(/(?:الحلقة|حلقة|Episode)\s*:?\s*(\d+)/i) || epHref.match(/\/episode\/\d+\/[^/]+\/[^/]+-(\d+)$/i);
        epLinks.push({
          url: epHref,
          ep: numMatch ? parseInt(numMatch[1], 10) : null
        });
      }
      var chosenEpUrl = null;
      for (var j = 0; j < epLinks.length; j++) {
        if (epLinks[j].ep === targetEp) {
          chosenEpUrl = epLinks[j].url;
          break;
        }
      }
      if (!chosenEpUrl && epLinks.length > 0) {
        chosenEpUrl = epLinks[0].url;
      }
      if (chosenEpUrl) {
        var epPageRes = await safeTextFetch(chosenEpUrl, { headers: { Referer: itemRes.url } });
        if (epPageRes && epPageRes.text) {
          pageHtml = epPageRes.text;
        }
      }
    }

    // Collect /watch/ links on the page
    var watchUrls = [];
    var watchRegex = /href=["'](https?:\/\/[^"']*\/watch\/\d+\/[^"']+)["']/gi;
    var wm;
    while ((wm = watchRegex.exec(pageHtml)) !== null) {
      if (watchUrls.indexOf(wm[1]) === -1) {
        watchUrls.push(wm[1]);
      }
    }

    var streams = [];
    var seenMedia = {};

    for (var wIdx = 0; wIdx < Math.min(watchUrls.length, 3); wIdx++) {
      var wUrl = watchUrls[wIdx];
      var wRes = await safeTextFetch(wUrl, { headers: { Referer: itemRes.url } });
      if (!wRes || !wRes.text) continue;

      var srcRegex = /<source[^>]*src=["']([^"']+)["'][^>]*>/gi;
      var sm;
      while ((sm = srcRegex.exec(wRes.text)) !== null) {
        var tag = sm[0];
        var mediaUrl = sm[1].trim();
        if (!mediaUrl || seenMedia[mediaUrl]) continue;
        seenMedia[mediaUrl] = true;

        var sizeM = tag.match(/size=["']?(\d+)["']?/i) || mediaUrl.match(/\.(\d{3,4})p\./i);
        var qLabel = sizeM ? (sizeM[1] + "p") : "720p";

        streams.push({
          name: PROVIDER_NAME + " - " + qLabel,
          title: "Akwam \u2022 " + qLabel + " (MP4 Direct)",
          url: mediaUrl,
          quality: qLabel,
          language: "ar",
          provider: "akwam",
          type: "mp4",
          headers: {
            "User-Agent": USER_AGENT,
            "Referer": wRes.url || wUrl
          },
          subtitles: []
        });
      }
    }

    return streams;
  } catch (err) {
    console.error("[Akwam] getStreams error: " + (err && err.message ? err.message : err));
    return [];
  }
}

function onSettings() {
  return [
    {
      type: "header",
      label: "Akwam | \u0623\u0643\u0648\u0627\u0645 Settings"
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
