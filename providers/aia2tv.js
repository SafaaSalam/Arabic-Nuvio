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

var ADDON_META_RAW = "https://raw.githubusercontent.com/SafaaSalam/Arabic-Nuvio/main/addon/meta";
var EP_WORD_RE = "(?:الحلقة|الحلقه|حلقة|حلقه|episode|episodes|ep)";

function safeDecodeUri(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

// "~d9~85" (ids avoid "%") -> real characters
function decodeIdSlug(slug) {
  return safeDecodeUri(String(slug).replace(/~([0-9a-fA-F]{2})/g, "%$1"));
}

function stripTagsText(s) {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

// Exact episode / series URL that the catalog sync scraped and stored in the addon meta file.
async function lookupEpisodeMeta(rawId, season, episode) {
  try {
    var baseId = String(rawId || "").split(":")[0];
    if (!baseId) return null;
    var j = await safeJsonFetch(ADDON_META_RAW + "/series/" + encodeURIComponent(baseId) + ".json");
    var meta = j && j.meta ? j.meta : null;
    if (!meta) return null;
    var out = { website: meta.website || null, episodeUrl: null };
    var vids = meta.videos || [];
    for (var i = 0; i < vids.length; i++) {
      if (parseInt(vids[i].episode, 10) === parseInt(episode, 10) && (parseInt(vids[i].season, 10) || 1) === (parseInt(season, 10) || 1) && vids[i].episodeUrl) {
        out.episodeUrl = vids[i].episodeUrl;
        break;
      }
    }
    return out;
  } catch (e) {
    return null;
  }
}

// Finds the link of episode N (and season S) in a series page. Digits must end the number
// ("episode 3" must never match "episode 35").
function findEpisodeUrl(html, baseUrl, season, episode) {
  var wantEp = parseInt(episode, 10);
  var wantSeason = parseInt(season, 10) || 1;
  if (isNaN(wantEp)) return null;
  var epRe = new RegExp(EP_WORD_RE + "[\\s\\-_.:/]*0*(\\d{1,4})(?!\\d)", "i");
  var seasonRe = /(?:الموسم|موسم|season)[\s\-_.:\/]*0*(\d{1,2})(?!\d)/i;
  var sxeRe = /(?:^|[^a-z])s0*(\d{1,2})[\s._-]*e0*(\d{1,4})(?!\d)/i;
  var host = "";
  try { host = new URL(baseUrl).hostname.replace(/^www\./, ""); } catch (e) {}
  var best = null;
  var re = /<a\b[^>]*?href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    var url = fixUrl(m[1], baseUrl);
    if (host && url.indexOf(host) === -1) continue;
    var path = safeDecodeUri(url).replace(/^https?:\/\/[^\/]+/i, "");
    var text = stripTagsText(m[2]);
    var ep = null;
    var sn = null;
    var sx = path.match(sxeRe) || text.match(sxeRe);
    if (sx) { sn = parseInt(sx[1], 10); ep = parseInt(sx[2], 10); }
    if (ep === null) {
      var em = text.match(epRe) || path.match(epRe);
      if (em) ep = parseInt(em[1], 10);
    }
    if (ep !== wantEp) continue;
    if (sn === null) {
      var sm = path.match(seasonRe) || text.match(seasonRe);
      sn = sm ? parseInt(sm[1], 10) : 1;
    }
    if (sn === wantSeason) return url;
    if (!best) best = url;
  }
  return best;
}

// True when the page URL itself is the page of episode N (e.g. ".../series-ep-5/").
function urlIsEpisode(url, episode) {
  var wantEp = parseInt(episode, 10);
  if (isNaN(wantEp)) return false;
  var path = safeDecodeUri(String(url || "")).replace(/^https?:\/\/[^\/]+/i, "");
  var re = new RegExp(EP_WORD_RE + "[\\s\\-_.:/]*0*(\\d{1,4})(?!\\d)", "i");
  var m = path.match(re);
  if (m) return parseInt(m[1], 10) === wantEp;
  var sx = path.match(/(?:^|[^a-z])s0*\d{1,2}[\s._-]*e0*(\d{1,4})(?!\d)/i);
  return !!sx && parseInt(sx[1], 10) === wantEp;
}

// Picks the search result whose title/URL best matches one of the wanted titles.
// An exact title match beats a whole-word match, which beats a plain substring match.
// With no match at all it returns null (a wrong show is worse than no result), except when the
// search returned exactly one candidate.
function pickBestSearchResult(html, pageUrl, titles) {
  var host = "";
  try { host = new URL(pageUrl).hostname; } catch (e) {}
  var norm = function (s) { return safeDecodeUri(String(s || "")).toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").trim(); };
  var wanted = [];
  for (var t = 0; t < titles.length; t++) { var n = norm(titles[t]); if (n.length > 1) wanted.push(n); }
  var re = /<a\b[^>]*?href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var m;
  var bestUrl = null;
  var bestScore = 0;
  var cands = [];
  while ((m = re.exec(html)) !== null) {
    var href = m[1];
    if (host && href.indexOf(host) === -1) continue;
    if (/\/(?:category|tag|genre|page|search|login|register|contact|wp-content|wp-admin|feed|author)\b/i.test(href)) continue;
    if (href.replace(/\/+$/, "") === String(pageUrl).replace(/\/+$/, "")) continue;
    if (cands.indexOf(href) === -1) cands.push(href);
    var label = norm(stripTagsText(m[2]));
    var hay = norm(stripTagsText(m[2]) + " " + href);
    for (var w = 0; w < wanted.length; w++) {
      var score = 0;
      if (label === wanted[w]) score = 3000 + wanted[w].length;
      else if ((" " + hay + " ").indexOf(" " + wanted[w] + " ") !== -1) score = 2000 + wanted[w].length;
      else if (hay.indexOf(wanted[w]) !== -1) score = 1000 + wanted[w].length;
      if (score > bestScore) { bestScore = score; bestUrl = href; }
    }
  }
  if (bestUrl) return bestUrl;
  return cands.length === 1 ? cands[0] : null;
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
    var slug = decodeIdSlug(idStr.slice(CUSTOM_PREFIX.length).split(":")[0].replace(/__/g, "/"));
    return { customSlug: slug, titles: [] };
  }
  if (idStr.indexOf(PROVIDER_ID + "_") === 0) {
    var slug2 = decodeIdSlug(idStr.slice((PROVIDER_ID + "_").length).split(":")[0].replace(/__/g, "/"));
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
      // Search every title variant (Arabic / English / original) in parallel instead of one after another.
      var searchTitles = targetInfo.titles.slice(0, 3);
      var found = await Promise.all(searchTitles.map(function (q) {
        var sUrl = mainUrl + SEARCH_PATH.replace("{query}", encodeURIComponent(q));
        return safeTextFetch(sUrl, { headers: { Referer: mainUrl + "/" } }).then(function (sRes) {
          if (!sRes || !sRes.text) return null;
          return pickBestSearchResult(sRes.text, sRes.url || mainUrl, targetInfo.titles);
        }).catch(function () { return null; });
      }));
      for (var fi = 0; fi < found.length; fi++) { if (found[fi]) { targetUrl = found[fi]; break; } }
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
      } else if (!urlIsEpisode(finalPageUrl, episode)) {
        // The requested episode was not found: never return the series page's links (wrong episode).
        return [];
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
