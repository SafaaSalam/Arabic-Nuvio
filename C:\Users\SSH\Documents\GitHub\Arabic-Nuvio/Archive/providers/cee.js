/**
 * CEE (🇮🇶) - Nuvio JS Provider
 * Repository: https://github.com/SafaaSalam/Arabic-Nuvio
 *
 * Compatible with:
 * - NuvioTV (QuickJS 1.0.5 - synchronous fetch bridge, no native timers)
 * - NuvioMobile (QuickJS 1.0.15 - async fetch bridge + onSettings UI)
 */

var DEFAULT_MAIN_URL = "https://cee.buzz";
var DEFAULT_TMDB_API_KEY = "8265bd1679663a7ea12ac168da84d2e8";
var PROVIDER_NAME = "CEE (\uD83C\uDDEE\uD83C\uDDF6)";
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
    if (!res || !res.ok || res.status === 0) {
      return null;
    }
    var data = await res.json();
    return data;
  } catch (e) {
    console.error("[CEE] Fetch error for " + url + ": " + (e && e.message ? e.message : e));
    return null;
  }
}

function normalizeQualityLabel(resolution) {
  if (!resolution) return "HD";
  var clean = String(resolution).toLowerCase().trim();
  if (clean.indexOf("2160") !== -1 || clean.indexOf("4k") !== -1) return "4K";
  if (clean.indexOf("1440") !== -1 || clean.indexOf("2k") !== -1) return "1440p";
  if (clean.indexOf("1080") !== -1) return "1080p";
  if (clean.indexOf("720") !== -1) return "720p";
  if (clean.indexOf("480") !== -1) return "480p";
  if (clean.indexOf("360") !== -1) return "360p";
  if (clean.indexOf("240") !== -1) return "240p";
  return String(resolution).trim();
}

function qualityRank(resolution) {
  var q = normalizeQualityLabel(resolution);
  if (q === "4K") return 2160;
  if (q === "1440p") return 1440;
  if (q === "1080p") return 1080;
  if (q === "720p") return 720;
  if (q === "480p") return 480;
  if (q === "360p") return 360;
  if (q === "240p") return 240;
  return 0;
}

function getScore(candidateTitle, queryLower) {
  if (!candidateTitle) return 0;
  var tl = String(candidateTitle).toLowerCase().trim();
  var ql = String(queryLower || "").toLowerCase().trim();
  if (!tl || !ql) return 0;
  if (tl === ql) return 100;
  if (tl.indexOf(ql) === 0) return 80;
  if (tl.indexOf(ql) !== -1) return 60;
  var tokens = ql.split(/\s+/).filter(function (w) { return w.length > 0; });
  var tokenMatches = 0;
  for (var i = 0; i < tokens.length; i++) {
    if (tl.indexOf(tokens[i]) !== -1) tokenMatches++;
  }
  if (tokenMatches === 0) return 0;
  return 40 + tokenMatches;
}

function extractImdbId(str) {
  if (!str) return null;
  var m = String(str).match(/(tt\d{5,12})/i);
  return m ? m[1].toLowerCase() : null;
}

function extractMalId(str) {
  if (!str) return null;
  var m = String(str).match(/myanimelist\.net\/anime\/(\d+)/i);
  return m ? m[1] : null;
}

async function resolveTargetMetadata(rawId, mediaType) {
  var idStr = String(rawId || "").trim();
  var normalizedType = (String(mediaType || "movie").toLowerCase() === "movie") ? "movie" : "tv";

  // 1. Direct CEE or Cinemana ID: cee_238954, cee:238954
  var directMatch = idStr.match(/^(?:cee_|cee:)(\d+)(?:[:_](\d+)[:_](\d+))?$/i);
  if (directMatch) {
    return {
      directNb: directMatch[1],
      seasonOverride: directMatch[2] ? parseInt(directMatch[2], 10) : null,
      episodeOverride: directMatch[3] ? parseInt(directMatch[3], 10) : null
    };
  }

  // 2. MAL ID
  var malMatch = idStr.match(/^mal:(\d+)(?::(\d+))?$/i);
  if (malMatch) {
    var malId = malMatch[1];
    var absEp = malMatch[2] ? parseInt(malMatch[2], 10) : null;
    var aniRes = await safeJsonFetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "User-Agent": "Nuvio-Providers/1.0",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: "query($idMal: Int){Media(idMal: $idMal, type: ANIME){startDate{year} title{romaji english native}}}",
        variables: { idMal: parseInt(malId, 10) }
      })
    });
    var media = aniRes && aniRes.data && aniRes.data.Media ? aniRes.data.Media : null;
    var titles = [];
    if (media && media.title) {
      if (media.title.english) titles.push(media.title.english);
      if (media.title.romaji && titles.indexOf(media.title.romaji) === -1) titles.push(media.title.romaji);
    }
    return {
      malId: malId,
      imdbId: null,
      titles: titles,
      year: media && media.startDate && media.startDate.year ? String(media.startDate.year) : null,
      episodeOverride: absEp
    };
  }

  var tmdbKey = getTmdbKey();
  var cleanId = idStr
    .replace(/^tmdb:/i, "")
    .replace(/^movie:/i, "")
    .replace(/^series:/i, "")
    .replace(/^tv:/i, "")
    .split(":")[0]
    .trim();

  var imdbId = null;
  var tmdbId = null;

  if (/^tt\d+$/i.test(cleanId)) {
    imdbId = cleanId.toLowerCase();
    var findUrl = "https://api.themoviedb.org/3/find/" + imdbId + "?api_key=" + tmdbKey + "&external_source=imdb_id";
    var findData = await safeJsonFetch(findUrl);
    if (findData) {
      var list = (normalizedType === "movie")
        ? (findData.movie_results && findData.movie_results.length ? findData.movie_results : findData.tv_results)
        : (findData.tv_results && findData.tv_results.length ? findData.tv_results : findData.movie_results);
      if (list && list.length > 0) {
        tmdbId = String(list[0].id);
      }
    }
  } else if (/^\d+$/.test(cleanId)) {
    tmdbId = cleanId;
  }

  if (!tmdbId) {
    return {
      imdbId: imdbId,
      titles: [],
      year: null
    };
  }

  var detailsUrl = "https://api.themoviedb.org/3/" + normalizedType + "/" + tmdbId + "?api_key=" + tmdbKey + "&append_to_response=external_ids,translations";
  var details = await safeJsonFetch(detailsUrl);
  if (!details) {
    return {
      imdbId: imdbId,
      titles: [],
      year: null
    };
  }

  var resolvedImdb = imdbId ||
    extractImdbId(details.imdb_id) ||
    (details.external_ids ? extractImdbId(details.external_ids.imdb_id) : null);

  var enTitle = details.title || details.name || null;
  var origTitle = details.original_title || details.original_name || null;
  var arTitle = null;

  if (details.translations && Array.isArray(details.translations.translations)) {
    for (var i = 0; i < details.translations.translations.length; i++) {
      var tr = details.translations.translations[i];
      if (tr && tr.iso_639_1 === "ar" && tr.data) {
        var candidateAr = tr.data.title || tr.data.name;
        if (candidateAr && String(candidateAr).trim()) {
          arTitle = String(candidateAr).trim();
          break;
        }
      }
    }
  }

  var titles = [];
  if (enTitle && String(enTitle).trim()) titles.push(String(enTitle).trim());
  if (origTitle && String(origTitle).trim() && titles.indexOf(String(origTitle).trim()) === -1) {
    titles.push(String(origTitle).trim());
  }
  if (arTitle && titles.indexOf(arTitle) === -1) {
    titles.push(arTitle);
  }

  var rawDate = details.release_date || details.first_air_date || "";
  var yearMatch = String(rawDate).match(/^(\d{4})/);

  return {
    tmdbId: tmdbId,
    imdbId: resolvedImdb,
    titles: titles,
    year: yearMatch ? yearMatch[1] : null
  };
}

async function searchCee(apiV2, meta, mediaType) {
  var isMovie = String(mediaType || "movie").toLowerCase() === "movie";
  var searchType = isMovie ? "movies" : "series";
  var expectedKind = isMovie ? 1 : 2;
  var currentYear = new Date().getFullYear();
  var yearRanges = ["1900," + currentYear, "1900,2024"];

  var queries = [];
  if (meta.titles && meta.titles.length > 0) {
    for (var i = 0; i < meta.titles.length; i++) {
      if (meta.titles[i]) queries.push(meta.titles[i]);
    }
  }
  if (queries.length === 0 && meta.imdbId) {
    queries.push(meta.imdbId);
  }

  var bestMatch = null;
  var bestScore = -1;

  for (var qIdx = 0; qIdx < queries.length; qIdx++) {
    var query = queries[qIdx];
    var encoded = encodeURIComponent(query);

    for (var yrIdx = 0; yrIdx < yearRanges.length; yrIdx++) {
      var yearRange = yearRanges[yrIdx];
      var searchUrl = apiV2 + "/AdvancedSearch?level=0&videoTitle=" + encoded +
        "&staffTitle=" + encoded +
        "&year=" + yearRange +
        "&page=0&type=" + searchType + "&itemsPerPage=12";

      var results = await safeJsonFetch(searchUrl);
      if (!Array.isArray(results) || results.length === 0) {
        continue;
      }

      for (var i = 0; i < results.length; i++) {
        var item = results[i];
        if (!item || !item.nb) continue;

        var itemKind = parseInt(item.kind, 10);
        if (itemKind && itemKind !== expectedKind) continue;

        var itemImdb = extractImdbId(item.imdbUrlRef);
        if (meta.imdbId && itemImdb && itemImdb === meta.imdbId) {
          return String(item.nb);
        }

        var itemMal = extractMalId(item.imdbUrlRef);
        if (meta.malId && itemMal && String(itemMal) === String(meta.malId)) {
          return String(item.nb);
        }

        var score = Math.max(
          getScore(item.en_title, query),
          getScore(item.ar_title, query),
          getScore(item.other_title, query)
        );

        if (score > 0 && meta.year && item.year) {
          var yDiff = Math.abs(parseInt(meta.year, 10) - parseInt(item.year, 10));
          if (yDiff === 0) {
            score += 25;
          } else if (yDiff === 1) {
            score += 10;
          } else if (yDiff > 2) {
            score -= 20;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = String(item.nb);
        }
      }

      if (bestScore >= 80) {
        return bestMatch;
      }
    }
  }

  return bestScore >= 60 ? bestMatch : null;
}

async function resolveSeriesEpisodeNb(apiV2, seriesNb, season, episode) {
  var epNum = episode != null ? parseInt(episode, 10) : 1;
  var sNum = season != null ? parseInt(season, 10) : null;

  var seasonsUrl = apiV2 + "/videoSeason/id/" + seriesNb;
  var episodesList = await safeJsonFetch(seasonsUrl);
  if (!Array.isArray(episodesList) || episodesList.length === 0) {
    return seriesNb;
  }

  if (sNum != null) {
    for (var i = 0; i < episodesList.length; i++) {
      var ep = episodesList[i];
      if (!ep || !ep.nb) continue;
      var itemS = parseInt(ep.season, 10);
      var itemE = parseInt(ep.episodeNummer, 10);
      if (itemS === sNum && itemE === epNum) {
        return String(ep.nb);
      }
    }
  }

  for (var j = 0; j < episodesList.length; j++) {
    var epItem = episodesList[j];
    if (!epItem || !epItem.nb) continue;
    if (parseInt(epItem.episodeNummer, 10) === epNum) {
      return String(epItem.nb);
    }
  }

  return null;
}

async function fetchSubtitlesForNb(apiV2, targetNb) {
  var detailsUrl = apiV2 + "/allVideoInfo/id/" + targetNb;
  var details = await safeJsonFetch(detailsUrl);
  if (!details || !Array.isArray(details.translations)) {
    return { subtitles: [], titleInfo: details };
  }

  var extOrder = { ass: 0, vtt: 1, srt: 2 };
  var sorted = details.translations.slice().sort(function (a, b) {
    var extA = String((a && a.extention) || "").toLowerCase();
    var extB = String((b && b.extention) || "").toLowerCase();
    var rankA = extOrder[extA] !== undefined ? extOrder[extA] : 3;
    var rankB = extOrder[extB] !== undefined ? extOrder[extB] : 3;
    return rankA - rankB;
  });

  var subtitles = [];
  var seenUrls = {};
  for (var i = 0; i < sorted.length; i++) {
    var sub = sorted[i];
    if (!sub || !sub.file) continue;
    var fileUrl = String(sub.file).trim();
    if (!fileUrl || seenUrls[fileUrl]) continue;
    seenUrls[fileUrl] = true;

    var ext = String(sub.extention || "").toLowerCase();
    var rawLang = String(sub.name || sub.type || "arabic").toLowerCase();
    var isArabic = ext === "ass" || rawLang.indexOf("ar") !== -1 || sub.type === "ar";
    var langCode = isArabic ? "ar" : (sub.type || rawLang);
    var langLabel = isArabic
      ? ("Arabic (" + ext.toUpperCase() + ") | العربية")
      : ((sub.name || "Subtitle") + " (" + ext.toUpperCase() + ")");

    subtitles.push({
      id: "cee-sub-" + targetNb + "-" + (sub.id || i),
      url: fileUrl,
      lang: langCode,
      language: langLabel,
      name: PROVIDER_NAME
    });
  }

  return { subtitles: subtitles, titleInfo: details };
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    var mainUrl = getMainUrl();
    var apiV2 = mainUrl + "/api/android";
    var settings = getSettings();
    var preferredQuality = settings.preferredQuality || "all";

    var normalizedType = (String(mediaType || "movie").toLowerCase() === "movie") ? "movie" : "tv";
    var meta = await resolveTargetMetadata(tmdbId, normalizedType);

    var targetSeason = meta.seasonOverride != null ? meta.seasonOverride : season;
    var targetEpisode = meta.episodeOverride != null ? meta.episodeOverride : episode;

    var baseNb = meta.directNb || null;
    if (!baseNb) {
      baseNb = await searchCee(apiV2, meta, normalizedType);
    }

    if (!baseNb) {
      return [];
    }

    var videoNb = baseNb;
    if (normalizedType === "tv" && targetEpisode != null) {
      var resolvedEpNb = await resolveSeriesEpisodeNb(apiV2, baseNb, targetSeason, targetEpisode);
      if (!resolvedEpNb) {
        return [];
      }
      videoNb = resolvedEpNb;
    }

    var videosUrl = apiV2 + "/transcoddedFiles/id/" + videoNb;
    var videoResponse = await safeJsonFetch(videosUrl);
    if (!Array.isArray(videoResponse) || videoResponse.length === 0) {
      return [];
    }

    var subResult = await fetchSubtitlesForNb(apiV2, videoNb);
    var subtitles = subResult.subtitles || [];
    var details = subResult.titleInfo;
    var displayTitle = "";
    if (details) {
      var arT = details.ar_title && String(details.ar_title).trim();
      var enT = details.en_title && String(details.en_title).trim();
      if (arT && enT && arT !== enT) {
        displayTitle = arT + " | " + enT;
      } else {
        displayTitle = arT || enT || "";
      }
    }

    var sortedVideos = videoResponse.slice().reverse().sort(function (a, b) {
      return qualityRank(b && b.resolution) - qualityRank(a && a.resolution);
    });

    var streams = [];
    for (var i = 0; i < sortedVideos.length; i++) {
      var v = sortedVideos[i];
      if (!v || !v.videoUrl) continue;

      var quality = normalizeQualityLabel(v.resolution);
      if (preferredQuality !== "all" && quality.toLowerCase() !== String(preferredQuality).toLowerCase()) {
        continue;
      }

      var container = (v.container ? String(v.container).toLowerCase() : "mp4");
      var epSuffix = (normalizedType === "tv" && targetEpisode != null)
        ? (" - S" + String(targetSeason || 1).padStart(2, "0") + "E" + String(targetEpisode).padStart(2, "0"))
        : "";
      var subBadge = subtitles.length > 0 ? " [\u0645\u062A\u0631\u062C\u0645 | CC]" : "";
      var streamTitle = (displayTitle ? displayTitle + epSuffix : "CEE" + epSuffix) +
        " \u2022 " + quality + " (" + container.toUpperCase() + ")" + subBadge;

      streams.push({
        name: PROVIDER_NAME + " - " + quality,
        title: streamTitle,
        url: String(v.videoUrl),
        quality: quality,
        language: "ar",
        provider: "cee",
        type: container,
        headers: {
          "User-Agent": USER_AGENT,
          "Referer": mainUrl + "/"
        },
        subtitles: subtitles
      });
    }

    return streams;
  } catch (err) {
    console.error("[CEE] getStreams error: " + (err && err.message ? err.message : err));
    return [];
  }
}

function onSettings() {
  return [
    {
      type: "header",
      label: "CEE (\uD83C\uDDEE\uD83C\uDDF6) Settings"
    },
    {
      type: "text",
      key: "domain",
      label: "Base URL",
      placeholder: DEFAULT_MAIN_URL,
      defaultValue: DEFAULT_MAIN_URL
    },
    {
      type: "select",
      key: "preferredQuality",
      label: "Preferred Quality",
      defaultValue: "all",
      options: [
        { label: "All Qualities", value: "all" },
        { label: "4K (2160p)", value: "4K" },
        { label: "1080p Full HD", value: "1080p" },
        { label: "720p HD", value: "720p" },
        { label: "480p SD", value: "480p" },
        { label: "360p", value: "360p" }
      ]
    }
  ];
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getStreams: getStreams,
    onSettings: onSettings
  };
}
if (typeof globalThis !== "undefined") {
  globalThis.getStreams = getStreams;
  globalThis.onSettings = onSettings;
}
