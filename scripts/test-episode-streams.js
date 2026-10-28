/** Offline test of the generated provider's episode + stream resolution (fetch is mocked). */
const assert = require("assert");
const prov = require("../providers/krmzy.js");

const pages = {
  "https://krmzi.org/series/show-x": `<a href="https://krmzi.org/episode/show-x-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-35/">حلقة 35</a><a href="https://krmzi.org/episode/show-x-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-3/">حلقة 3</a>`,
  "https://krmzi.org/episode/show-x-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-3/": `<video><source src="https://cdn.example.com/ep3.mp4" size="720"></video>`,
  "https://krmzi.org/episode/show-x-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-35/": `<video><source src="https://cdn.example.com/ep35.mp4" size="720"></video>`,
  "https://krmzi.org/episode/exact-from-meta/": `<video><source src="https://cdn.example.com/meta-ep7.mp4" size="1080"></video>`,
};
let useMeta = false;
global.fetch = async (url) => {
  url = String(url);
  if (url.includes("raw.githubusercontent.com") && url.includes("/addon/meta/series/")) {
    if (!useMeta) return { ok: false, status: 404 };
    const body = { meta: { website: "https://krmzi.org/series/show-x", videos: [{ season: 1, episode: 7, episodeUrl: "https://krmzi.org/episode/exact-from-meta/" }] } };
    return { ok: true, status: 200, url, json: async () => body, text: async () => JSON.stringify(body) };
  }
  const hit = pages[url] || pages[url.replace(/\/$/, "")];
  if (!hit) return { ok: false, status: 404, url };
  return { ok: true, status: 200, url, text: async () => hit };
};

(async () => {
  // fallback path: no meta file -> must pick episode 3, not 35 (even though 35 is listed first)
  let streams = await prov.getStreams("krmzy_series__show-x:1:3", "tv", 1, 3);
  assert.ok(streams.some((s) => s.url.endsWith("ep3.mp4")), "episode 3 resolved: " + JSON.stringify(streams.map((s) => s.url)));
  assert.ok(!streams.some((s) => s.url.endsWith("ep35.mp4")), "episode 35 must not leak into episode 3");
  streams = await prov.getStreams("krmzy_series__show-x:1:35", "tv", 1, 35);
  assert.ok(streams.some((s) => s.url.endsWith("ep35.mp4")));
  // exact URL stored by the sync wins
  useMeta = true;
  streams = await prov.getStreams("krmzy_series__show-x:1:7", "tv", 1, 7);
  assert.ok(streams.some((s) => s.url.endsWith("meta-ep7.mp4")), "meta episodeUrl used");
  console.log("✅ episode/stream resolution tests passed");
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
