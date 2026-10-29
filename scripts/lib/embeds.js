/**
 * Generic video-embed resolver used by the sync when a source's own plugin returns no playable link.
 * Turns an episode/movie page into direct, in-app playable links (HLS/MP4) by following:
 *   - <iframe>/data-* embeds and "qesen"-style server lists (base64 JSON "post" param, used by Krmzi & co.)
 *   - XFileSharing-style hosts whose player config is hidden in eval(function(p,a,c,k,e,d)...) packed JS
 * Never returns web pages: only URLs that point at .m3u8 / .mp4 media.
 */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// server name -> embed URL template ({id} = server id), as used by qesen.net/krmzi player pages
const QESEN_SERVERS = {
  "arab hd": "https://arabhd.onl/embed-{id}.html",
  "estream": "https://arabveturk.com/embed-{id}.html",
  "box": "https://youdboox.com/embed-{id}.html",
  "now": "https://extreamnow.org/embed-{id}.html",
  "red hd": "https://iplayerhls.com/e/{id}",
  "pro hd": "https://w.larhu.website/play.php?id={id}",
};

async function fetchText(url, referer, timeoutMs = 12000) {
  try {
    const res = await fetch(url, {
      headers: Object.assign({ "User-Agent": UA, Accept: "text/html,*/*" }, referer ? { Referer: referer } : {}),
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return { text: await res.text(), url: res.url || url };
  } catch (_) { return null; }
}

/** Dean Edwards' p,a,c,k,e,d unpacker (no eval). */
function unpack(source) {
  const m = source.match(/}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/);
  if (!m) return "";
  let p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  const a = parseInt(m[2], 10), c = parseInt(m[3], 10), k = m[4].split("|");
  const enc = (n) => (n < a ? "" : enc(Math.floor(n / a))) + ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
  const dict = {};
  for (let i = c - 1; i >= 0; i--) dict[enc(i)] = k[i] || enc(i);
  return p.replace(/\b\w+\b/g, (w) => (Object.prototype.hasOwnProperty.call(dict, w) ? dict[w] : w));
}

function unpackAll(html) {
  let out = "";
  const re = /eval\(function\(p,a,c,k,e,[dr]\)[\s\S]*?\.split\('\|'\)[^)]*\)\)/g;
  let m;
  while ((m = re.exec(html)) !== null) out += "\n" + unpack(m[0]);
  return out;
}

function mediaUrlsIn(text) {
  const found = [];
  const re = /(https?:\/\/[^"'\s<>\\]+?\.(?:m3u8|mp4)(?:\?[^"'\s<>\\]*)?)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const u = m[1].replace(/&amp;/g, "&");
    if (!/\/(?:ads?|vast|preroll)\//i.test(u) && !found.includes(u)) found.push(u);
  }
  return found;
}

function abs(href, base) {
  try { return new URL(href.replace(/&amp;/g, "&"), base).toString(); } catch (_) { return null; }
}

/** Candidate embed URLs found on a watch page. */
function embedsIn(html, pageUrl) {
  const out = [];
  const push = (u) => { const a = u && abs(u, pageUrl); if (a && /^https?:/i.test(a) && !out.includes(a)) out.push(a); };
  let m;
  const ifr = /<iframe[^>]+(?:data-src|src)=["']([^"']+)["']/gi;
  while ((m = ifr.exec(html)) !== null) if (!/youtube|facebook\.com\/plugins|googletagmanager|disqus/i.test(m[1])) push(m[1]);
  const data = /data-(?:src|url|embed|link|server|iframe|watch|video)[\w-]*=["'](https?:\/\/[^"']+)["']/gi;
  while ((m = data.exec(html)) !== null) push(m[1]);
  // qesen-style player link: ?post=<base64 JSON {servers:[{name,id}]}>
  const q = /href=["']([^"']*[?&]post=([A-Za-z0-9+/=%]+)[^"']*)["']/gi;
  while ((m = q.exec(html)) !== null) {
    try {
      const json = JSON.parse(Buffer.from(decodeURIComponent(m[2]), "base64").toString("utf8"));
      for (const s of (json.servers || [])) {
        const tpl = QESEN_SERVERS[String(s.name || "").toLowerCase().trim()];
        if (tpl && s.id) push(tpl.replace("{id}", encodeURIComponent(String(s.id))));
      }
      push(m[1]);
    } catch (_) {}
  }
  return out;
}

/** Resolve one embed page to media links. */
async function resolveEmbed(url, referer) {
  const page = await fetchText(url, referer);
  if (!page) return [];
  const text = page.text + unpackAll(page.text);
  let media = mediaUrlsIn(text);
  if (media.length === 0) {
    // one more hop for wrapper pages (e.g. qesen list -> iframe)
    for (const inner of embedsIn(page.text, page.url).slice(0, 3)) {
      if (inner === url) continue;
      const p2 = await fetchText(inner, page.url);
      if (!p2) continue;
      media = mediaUrlsIn(p2.text + unpackAll(p2.text));
      if (media.length) { url = p2.url; break; }
    }
  }
  const origin = (() => { try { return new URL(url).origin + "/"; } catch (_) { return undefined; } })();
  return media.map((u) => ({ url: u, host: (() => { try { return new URL(url).hostname; } catch (_) { return ""; } })(), headers: { "User-Agent": UA, Referer: origin } }));
}

/** Page URL -> direct media links (max `limit` embeds tried). */
async function resolvePage(pageUrl, limit = 4) {
  const page = await fetchText(pageUrl);
  if (!page) return [];
  const direct = mediaUrlsIn(page.text + unpackAll(page.text)).map((u) => ({ url: u, host: "", headers: { "User-Agent": UA, Referer: new URL(page.url).origin + "/" } }));
  if (direct.length) return direct;
  const out = [];
  for (const e of embedsIn(page.text, page.url).slice(0, limit)) {
    const r = await resolveEmbed(e, page.url);
    for (const x of r) if (!out.some((o) => o.url === x.url)) out.push(x);
    if (out.length >= 3) break;
  }
  return out;
}

/** Links carrying an expiry/signature must be refreshed often. */
function isExpiring(u) {
  return /[?&](?:e|exp|expires|Expires|token|t|s|sig|signature|hash|md5)=/i.test(String(u));
}

module.exports = { unpack, unpackAll, mediaUrlsIn, embedsIn, resolveEmbed, resolvePage, isExpiring, QESEN_SERVERS };
