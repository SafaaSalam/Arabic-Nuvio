/**
 * 3isk | قصة عشق - Nuvio JS Provider
 * Repository: https://github.com/SafaaSalam/Arabic-Nuvio
 *
 * Compatible with:
 * - NuvioTV (QuickJS 1.0.5)
 * - NuvioMobile (QuickJS 1.0.15)
 */

var DEFAULT_MAIN_URL = "https://3iskk.xyz";
var FALLBACK_MAIN_URL = "https://3esk.onl";
var DEFAULT_TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
var PROVIDER_NAME = "3isk | \u0642\u0635\u0629 \u0639\u0634\u0642";
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

function decodeBase64Url(str) {
  try {
    if (typeof atob === "function") return atob(str);
    if (typeof Buffer !== "undefined") return Buffer.from(str, "base64").toString("utf8");
  } catch (e) {}
  return "";
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

async function resolveTmdbTitles(rawId, mediaType) {
  var idStr = String(rawId || "").trim();
  if (idStr.indexOf("3isk_") === 0) {
    var slug = idStr.slice(5).split(":")[0].replace(/__/g, "/");
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
      if (tr && (tr.iso_639_1 === "ar" || tr.iso_639_1 === "tr") && tr.data) {
        var t = tr.data.title || tr.data.name;
        if (t && String(t).trim() && titles.indexOf(String(t).trim()) === -1) {
          titles.push(String(t).trim());
        }
      }
    }
  }
  var orig = details.original_title || details.original_name;
  var en = details.title || details.name;
  if (orig && titles.indexOf(orig) === -1) titles.push(orig);
  if (en && titles.indexOf(en) === -1) titles.push(en);

  return { titles: titles };
}

async function resolveEpisodeUrl(baseUrl, targetInfo, season, episode) {
  var epNum = episode != null ? parseInt(episode, 10) : 1;
  var sNum = season != null ? parseInt(season, 10) : 1;

  if (targetInfo.customSlug) {
    var slugUrl = targetInfo.customSlug.indexOf("http") === 0
      ? targetInfo.customSlug
      : (baseUrl + "/" + targetInfo.customSlug.replace(/^\/+/, "") + "/");
    if (slugUrl.indexOf("/episodes/") !== -1 && episode != null) {
      slugUrl = slugUrl.replace(/-episode-\d+\/?$/i, "-episode-" + epNum + "/");
    }
    return slugUrl;
  }

  for (var i = 0; i < targetInfo.titles.length; i++) {
    var q = targetInfo.titles[i];
    var searchRes = await safeTextFetch(baseUrl + "/search/" + encodeURIComponent(q) + "/");
    if (!searchRes || !searchRes.text) continue;

    var linkMatches = searchRes.text.match(/<a[^>]*href=["'](https?:\/\/[^"']*\/watch\/[^"']+)["'][^>]*class=["'][^"']*type_item[^"']*["']/gi) || [];
    if (linkMatches.length > 0) {
      var hrefMatch = linkMatches[0].match(/href=["']([^"']+)["']/i);
      if (hrefMatch && hrefMatch[1]) {
        var pageUrl = hrefMatch[1];
        if (pageUrl.indexOf("/tvshows/") !== -1) {
          var showRes = await safeTextFetch(pageUrl);
          if (showRes && showRes.text) {
            var epRegex = new RegExp("<a[^>]*href=[\"'](https?:\\/\\/[^\"']*episode-" + epNum + "\\/?)[\"']", "i");
            var epM = showRes.text.match(epRegex);
            if (epM && epM[1]) return epM[1];
            var anyEp = showRes.text.match(/<a[^>]*href=["'](https?:\/\/[^"']*\/watch\/episodes\/[^"']+)["']/i);
            if (anyEp && anyEp[1]) {
              return anyEp[1].replace(/-episode-\d+\/?$/i, "-episode-" + epNum + "/");
            }
          }
        }
        return pageUrl;
      }
    }
  }
  return null;
}

async function extractMediaFromEmbed(embedUrl, referer) {
  var results = [];
  var r1 = await safeTextFetch(embedUrl, { headers: { Referer: referer } });
  if (!r1 || !r1.text) return results;

  var html1 = r1.text.replace(/\\\//g, "/");

  // Direct playback JSON endpoint (ukrcdn.club)
  var pbMatch = html1.match(/https?:\/\/[^"'\s]+\/api\/videos\/[^"'\s]+\/playback[^"'\s]*/i);
  if (pbMatch) {
    var pbJson = await safeJsonFetch(pbMatch[0], { headers: { Referer: embedUrl } });
    if (pbJson && pbJson.url) {
      results.push({ url: pbJson.url, referer: embedUrl, label: "UkrCDN HLS" });
    }
  }

  // Packed JS eval
  if (html1.indexOf("function(p,a,c,k,e,d)") !== -1) {
    var unpacked = unpackDeanEdwards(html1);
    if (unpacked) {
      var m3u8s = unpacked.match(/https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)[^\s"'<>\\]*/gi) || [];
      for (var i = 0; i < m3u8s.length; i++) {
        results.push({ url: m3u8s[i], referer: embedUrl, label: "3isk Server" });
      }
    }
  }

  // Direct m3u8/mp4 in html1
  var direct = html1.match(/https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)[^\s"'<>\\]*/gi) || [];
  for (var j = 0; j < direct.length; j++) {
    results.push({ url: direct[j], referer: embedUrl, label: "Direct" });
  }

  // Nested iframe (1 level)
  var iframeMatch = html1.match(/<iframe[^>]*src=["']([^"']+)["']/i);
  if (iframeMatch && iframeMatch[1] && results.length === 0) {
    var innerUrl = iframeMatch[1].indexOf("//") === 0 ? ("https:" + iframeMatch[1]) : iframeMatch[1];
    var r2 = await safeTextFetch(innerUrl, { headers: { Referer: embedUrl } });
    if (r2 && r2.text) {
      var html2 = r2.text.replace(/\\\//g, "/");
      var pbMatch2 = html2.match(/https?:\/\/[^"'\s]+\/api\/videos\/[^"'\s]+\/playback[^"'\s]*/i);
      if (pbMatch2) {
        var pbJson2 = await safeJsonFetch(pbMatch2[0], { headers: { Referer: innerUrl } });
        if (pbJson2 && pbJson2.url) {
          results.push({ url: pbJson2.url, referer: innerUrl, label: "UkrCDN HLS" });
        }
      }
      if (html2.indexOf("function(p,a,c,k,e,d)") !== -1) {
        var unpacked2 = unpackDeanEdwards(html2);
        if (unpacked2) {
          var m3u8s2 = unpacked2.match(/https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)[^\s"'<>\\]*/gi) || [];
          for (var k = 0; k < m3u8s2.length; k++) {
            results.push({ url: m3u8s2[k], referer: innerUrl, label: "3isk Embed" });
          }
        }
      }
      var direct2 = html2.match(/https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)[^\s"'<>\\]*/gi) || [];
      for (var d = 0; d < direct2.length; d++) {
        results.push({ url: direct2[d], referer: innerUrl, label: "3isk Direct" });
      }
    }
  }

  return results;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var baseUrl = getMainUrl();
    var targetInfo = await resolveTmdbTitles(tmdbId, mediaType);
    var epUrl = await resolveEpisodeUrl(baseUrl, targetInfo, season, episode);
    if (!epUrl) return [];

    var r0 = await safeTextFetch(epUrl);
    if (!r0 || !r0.text) return [];

    var html0 = r0.text;
    var btnIdx = html0.indexOf("single-watch-btn");
    if (btnIdx === -1) return [];

    var formStart = html0.lastIndexOf("<form", btnIdx);
    var formHtml = html0.slice(Math.max(0, formStart), btnIdx + 250);
    var actionMatch = formHtml.match(/<form[^>]*action=["']([^"']+)["']/i);
    if (!actionMatch || !actionMatch[1]) return [];

    var actionUrl = actionMatch[1];
    var formPairs = [];
    var inputRegex = /<input[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["']/gi;
    var m;
    while ((m = inputRegex.exec(formHtml)) !== null) {
      formPairs.push(encodeURIComponent(m[1]) + "=" + encodeURIComponent(m[2]));
    }
    formPairs.push("submit=submit");

    var r1 = await safeTextFetch(actionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": epUrl
      },
      body: formPairs.join("&")
    });
    if (!r1 || !r1.text) return [];

    var myUrlMatch = r1.text.match(/var\s+myUrl\s*=\s*["']([^"']+)["']/i);
    var newsMatch = r1.text.match(/myInput\.value\s*=\s*["']([^"']+)["']/i);
    if (!myUrlMatch || !newsMatch) return [];

    var nextPost = myUrlMatch[1];
    var newsVal = newsMatch[1];
    var body2 = "news=" + encodeURIComponent(newsVal) + "&u=&submit=submit";

    var r2 = await safeTextFetch(nextPost, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": r1.url || actionUrl
      },
      body: body2
    });
    if (!r2 || !r2.text) return [];

    var iframeMatch = r2.text.match(/<iframe[^>]*src=["']([^"']+)["']/i);
    if (!iframeMatch || !iframeMatch[1]) return [];

    var baseIframeSrc = iframeMatch[1];
    var embedUrls = [baseIframeSrc];
    var embedPattern = baseIframeSrc.match(/^(https?:\/\/[^/]+\/embed\/)(\d+)\/(.*)$/i);
    if (embedPattern) {
      embedUrls = [];
      for (var sNum = 1; sNum <= 3; sNum++) {
        embedUrls.push(embedPattern[1] + sNum + "/" + embedPattern[3]);
      }
    }

    var streams = [];
    var seen = {};
    for (var idx = 0; idx < embedUrls.length; idx++) {
      var mediaItems = await extractMediaFromEmbed(embedUrls[idx], r2.url || nextPost);
      for (var k = 0; k < mediaItems.length; k++) {
        var item = mediaItems[k];
        if (!item || !item.url || seen[item.url]) continue;
        seen[item.url] = true;
        var isHls = item.url.indexOf(".m3u8") !== -1;
        streams.push({
          name: PROVIDER_NAME + " - " + (item.label || "HD"),
          title: "3isk (\u0642\u0635\u0629 \u0639\u0634\u0642) \u2022 " + (isHls ? "HLS Auto" : "MP4 HD"),
          url: item.url,
          quality: "1080p",
          language: "ar",
          provider: "3isk",
          type: isHls ? "hls" : "mp4",
          headers: {
            "User-Agent": USER_AGENT,
            "Referer": item.referer || baseUrl + "/"
          },
          subtitles: []
        });
      }
    }

    return streams;
  } catch (err) {
    console.error("[3isk] getStreams error: " + (err && err.message ? err.message : err));
    return [];
  }
}

function onSettings() {
  return [
    {
      type: "header",
      label: "3isk | \u0642\u0635\u0629 \u0639\u0634\u0642 Settings"
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
