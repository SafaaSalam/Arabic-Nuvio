/** Offline test: the AlooyTv plugin resolves a direct, in-app playable link for a custom-id episode (fetch is mocked). */
const assert = require("assert");
const D = "https://gg.alooytv16.xyz";
const pages = {
  "https://fitnur.com/alooytv": `<a href="${D}/">AlooyTv</a>`,
  [`${D}/watch/tuzlu-kahve.html`]: `<div class="season"><a href="${D}/watch/tuzlu-kahve.html?key=k1" class="btn btn-inline btn-ep">Ep#1</a><a href="${D}/watch/tuzlu-kahve.html?key=k3" class="btn btn-inline btn-ep">Ep#3</a></div>`,
  [`${D}/watch/tuzlu-kahve.html?key=k3`]: `<video><source src="https://vid5.example.site/ep3.mp4" type="video/mp4"></video>`,
  [`${D}/watch/tuzlu-kahve.html?key=k1`]: `<video><source src="https://vid5.example.site/ep1.mp4" type="video/mp4"></video>`,
};
global.fetch = async (url) => {
  url = String(url);
  const hit = pages[url] || pages[url.replace(/\/$/, "")];
  if (!hit) return { ok: false, status: 404, url, text: async () => "", json: async () => ({}) };
  return { ok: true, status: 200, url, text: async () => hit, json: async () => JSON.parse(hit) };
};
const prov = require("../providers/alooytv.js");
(async () => {
  const s = await prov.getStreams("alooy_tuzlu-kahve", "tv", 1, 3);
  assert.ok(s.some((x) => /ep3\.mp4$/.test(x.url)), "episode 3 direct link: " + JSON.stringify(s.map((x) => x.url)));
  assert.ok(!s.some((x) => /ep1\.mp4$/.test(x.url)), "episode 1 must not leak into episode 3");
  console.log("✅ direct stream resolution tests passed");
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
