/**
 * Asia2TV | آسيا تو تي في - Nuvio JS Provider
 * Repository: https://github.com/SafaaSalam/Arabic-Nuvio
 *
 * Compatible with:
 * - NuvioTV (QuickJS 1.0.5)
 * - NuvioMobile (QuickJS 1.0.15)
 */

var DEFAULT_MAIN_URL = "https://ww1.asia2tv.pw";
var DEFAULT_TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
var PROVIDER_ID = "aia2tv";
var PROVIDER_NAME = "Asia2TV | آسيا تو تي في";
var CUSTOM_PREFIX = "aia2tv_";
var SEARCH_PATH = "/?s={query}";
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
    var m = evalText.match(/}\s*\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\(['"]\|['"]\)/);
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
    return p.replace(/\b\w+\b/g, function (w) {
      return dict[w] !== undefined ? dict[w] : w;
    });
  } catch (e) {
    return null;
  }
}

async function resolveTargetInfo(rawId, mediaType) {
  var idStr = String(rawId || "").trim();
  if (idStr.indexOf(CUSTOM_PREFIX) === 0) {
    var slug = idStr.slice(CUSTOM_PREFIX.length).split(":")[0].replace(/__/g, "/");
    return { customSlug: slug, titles: [] };
  }
  if (idStr.indexOf(PROVIDER_ID + "_") === 0) {
    var slug2 = idStr.slice((PROVIDER_ID + "_").length).split(":")[0].replace(/__/g, "/");
    return { customSlug: slug2, titles: [] };
  }

  var normalizedType = (String(mediaType || "movie").toLowerCase() === "movie") ? "movie" : "tv";

  var malMatch = idStr.match(/^mal:(\d+)(?::(\d+))?$/i);
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
  return { titles: titles };
}

async function extractMediaFromHtml(htmlRaw, pageUrl, baseUrl) {
  var results = [];
  if (!htmlRaw) return results;
  var html = htmlRaw.replace(/\\\//g, "/");

  // 1. Direct <source> / <video> tags
  var srcRegex = /<(?:source|video)[^>]*src=["']([^"']+)["'][^>]*>/gi;
  var sm;
  while ((sm = srcRegex.exec(html)) !== null) {
    var src = fixUrl(sm[1], baseUrl);
    if (src && (src.indexOf(".mp4") !== -1 || src.indexOf(".m3u8") !== -1)) {
      var qM = sm[0].match(/size=["']?(\d+)["']?/i) || src.match(/(\d{3,4})p/i);
      results.push({
        url: src,
        quality: qM ? (qM[1] + "p") : "720p",
        referer: pageUrl,
        label: "Direct"
      });
    }
  }

  // 2. Dean Edwards packed JS
  var evalMatches = html.match(/eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)[\s\S]{1,15000}/gi) || [];
  for (var eIdx = 0; eIdx < evalMatches.length; eIdx++) {
    var unpacked = unpackDeanEdwards(evalMatches[eIdx]);
    if (unpacked) {
      var packedMedia = unpacked.match(/https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)[^\s"'<>\\]*/gi) || [];
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
  var directMatches = html.match(/https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)[^\s"'<>\\]*/gi) || [];
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
      !/\.(?:jpg|jpeg|png|webp|svg|gif)(?:\?|$)/i.test(eUrl) &&
      embedUrls.indexOf(eUrl) === -1
    ) {
      embedUrls.push(eUrl);
    }
  }

  for (var i = 0; i < Math.min(embedUrls.length, 3); i++) {
    var emb = embedUrls[i];
    var eRes = await safeTextFetch(emb, { headers: { Referer: pageUrl } });
    if (!eRes || !eRes.text) continue;
    var eHtml = eRes.text.replace(/\\\//g, "/");

    var pbMatch = eHtml.match(/https?:\/\/[^"'\s]+\/api\/videos\/[^"'\s]+\/playback[^"'\s]*/i);
    if (pbMatch) {
      var pbJson = await safeJsonFetch(pbMatch[0], { headers: { Referer: emb } });
      if (pbJson && pbJson.url) {
        results.push({ url: pbJson.url, quality: "1080p", referer: emb, label: "HLS Server" });
      }
    }

    if (eHtml.indexOf("function(p,a,c,k,e,d)") !== -1) {
      var unp = unpackDeanEdwards(eHtml);
      if (unp) {
        var um = unp.match(/https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)[^\s"'<>\\]*/gi) || [];
        for (var k = 0; k < um.length; k++) {
          results.push({ url: um[k], quality: "1080p", referer: emb, label: "Embed Server " + (i + 1) });
        }
      }
    }

    var dm = eHtml.match(/https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)[^\s"'<>\\]*/gi) || [];
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
            title: (ch.name || "Live Channel") + " \u2022 Live Stream",
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

        var linkRegex = /<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
        var lm;
        while ((lm = linkRegex.exec(sRes.text)) !== null) {
          var href = lm[1];
          if (
            href.indexOf(new URL(sRes.url || mainUrl).hostname) !== -1 &&
            !/\/(?:category|tag|genre|page|search|login|register|contact|wp-content|wp-admin|feed|author)\b/i.test(href) &&
            href.replace(/\/+$/, "") !== (sRes.url || mainUrl).replace(/\/+$/, "")
          ) {
            targetUrl = href;
            break;
          }
        }
        if (targetUrl) break;
      }
    }

    if (!targetUrl) return [];

    var pageRes = await safeTextFetch(targetUrl, { headers: { Referer: mainUrl + "/" } });
    if (!pageRes || !pageRes.text) return [];
    var html = pageRes.text;
    var finalPageUrl = pageRes.url || targetUrl;

    // If TV series episode requested, look for episode link
    if (String(mediaType || "").toLowerCase() !== "movie" && episode != null) {
      var epNum = parseInt(episode, 10);
      var epCandidateRegex = new RegExp("<a[^>]*href=[\"']([^\"']*(?:episode-" + epNum + "|ep-" + epNum + "|%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-" + epNum + "|%d8%ad%d9%84%d9%82%d8%a9-" + epNum + ")[^\"']*)[\"']", "i");
      var epM = html.match(epCandidateRegex);
      if (epM && epM[1]) {
        var epUrl = fixUrl(epM[1], mainUrl);
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
        html = wRes.text + "\n" + html;
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
        title: PROVIDER_NAME + " \u2022 " + (item.label || "Stream") + " (" + (isHls ? "HLS" : "MP4") + ")",
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
