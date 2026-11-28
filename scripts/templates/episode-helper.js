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
