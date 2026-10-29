/** Offline test of the embed fallback: Krmzi episode -> qesen server list -> packed XFS player -> HLS link (fetch mocked). */
const assert = require("assert");
const post = Buffer.from(JSON.stringify({ servers: [{ name: "Arab HD", id: "oz2zsec7kt8x" }] })).toString("base64");
const packed = "eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0({1:\"2://3.4/5/6.7?t=8&s=9&e=a\"})',36,11,'sources|file|https|cdn|example|hls|master|m3u8|abc|123|43200'.split('|'),0,{}))";
const pages = {
  "https://krmzi.org/episode/x/": `<div class="getEmbed"><a href="https://qesen.net/krmzi/?post=${post}" class="fullscreen-clickable"></a></div>`,
  "https://arabhd.onl/embed-oz2zsec7kt8x.html": `<script>${packed}</script>`,
};
global.fetch = async (url) => {
  const hit = pages[String(url)];
  return hit ? { ok: true, status: 200, url: String(url), text: async () => hit } : { ok: false, status: 404, url: String(url), text: async () => "" };
};
const embeds = require("./lib/embeds.js");
(async () => {
  const links = await embeds.resolvePage("https://krmzi.org/episode/x/");
  assert.ok(links.some((l) => l.url === "https://cdn.example/hls/master.m3u8?t=abc&s=123&e=43200"), JSON.stringify(links));
  assert.ok(links.every((l) => l.headers && l.headers.Referer === "https://arabhd.onl/"), "referer header for the player host");
  assert.ok(embeds.isExpiring(links[0].url));
  console.log("✅ embed fallback tests passed");
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
