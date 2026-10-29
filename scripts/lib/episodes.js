/**
 * Generic episode-list extraction for Arabic streaming sites (WordPress themes, Akwam, 3isk, anime sites ...).
 * Works on raw HTML (no DOM) so it runs in Node, in CI and inside a browser console for live testing.
 *
 * Returns [{ season, episode, title, url }] sorted by season/episode, one entry per (season, episode).
 */
const EP_WORD = "(?:الحلقة|الحلقه|حلقة|حلقه|episode|episodes|ep)";
const SEASON_WORD = "(?:الموسم|موسم|season)";
const EP_RE = new RegExp(`${EP_WORD}[\\s\\-_.:/#]*0*(\\d{1,4})(?!\\d)`, "i");
const SEASON_RE = new RegExp(`${SEASON_WORD}[\\s\\-_.:/]*0*(\\d{1,2})(?!\\d)`, "i");
const SXXEXX_RE = /(?:^|[^a-z])s0*(\d{1,2})[\s._-]*e0*(\d{1,4})(?!\d)/i;

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (_) { return s; }
}
function stripTags(s) {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
function absUrl(href, base) {
  const h = String(href).trim();
  if (/^https?:\/\//i.test(h)) return h;
  if (h.startsWith("//")) return "https:" + h;
  if (h.startsWith("/")) return base.replace(/\/+$/, "") + h;
  return base.replace(/\/+$/, "") + "/" + h;
}

function extractEpisodes(html, baseUrl, opts = {}) {
  if (!html) return [];
  const host = (() => { try { return new URL(baseUrl).hostname.replace(/^www\./, ""); } catch (_) { return ""; } })();
  const selfPath = opts.selfUrl ? safeDecode(String(opts.selfUrl)).replace(/\/+$/, "") : null;
  const found = new Map();
  const re = /<a\b[^>]*?href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const rawHref = m[1];
    if (/^(?:javascript|mailto|tel):/i.test(rawHref)) continue;
    const url = absUrl(rawHref, baseUrl);
    try { if (host && new URL(url).hostname.replace(/^www\./, "") !== host) continue; } catch (_) { continue; }
    const decodedUrl = safeDecode(url);
    if (selfPath && decodedUrl.replace(/\/+$/, "") === selfPath) continue;
    const text = stripTags(m[2]);
    const pathOnly = decodedUrl.replace(/^https?:\/\/[^/]+/i, "");

    let ep = null, season = null;
    const sx = pathOnly.match(SXXEXX_RE) || text.match(SXXEXX_RE);
    if (sx) { season = parseInt(sx[1], 10); ep = parseInt(sx[2], 10); }
    if (ep == null) {
      const em = text.match(EP_RE) || pathOnly.match(EP_RE);
      if (em) ep = parseInt(em[1], 10);
    }
    if (ep == null || ep < 0 || ep > 3000) continue;
    if (season == null) {
      const sm = pathOnly.match(SEASON_RE) || text.match(SEASON_RE);
      season = sm ? parseInt(sm[1], 10) : 1;
    }
    const key = `${season}:${ep}`;
    if (found.has(key)) continue;
    found.set(key, { season, episode: ep, title: `الحلقة ${ep} | Episode ${ep}`, url });
  }
  return [...found.values()].sort((a, b) => a.season - b.season || a.episode - b.episode);
}

/** Next page of a paginated episode list (WordPress "next" link), or null. */
function nextEpisodesPage(html, baseUrl) {
  const m = String(html).match(/<a[^>]*class=["'][^"']*next[^"']*["'][^>]*href=["']([^"']+)["']/i) ||
            String(html).match(/<a[^>]*href=["']([^"']+)["'][^>]*rel=["']next["']/i);
  return m ? absUrl(m[1], baseUrl) : null;
}

module.exports = { extractEpisodes, nextEpisodesPage, safeDecode, absUrl };
