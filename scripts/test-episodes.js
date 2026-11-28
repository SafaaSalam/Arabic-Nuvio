const assert = require("assert");
const { extractEpisodes } = require("./lib/episodes.js");
const html = `
<div class="block-post"><a href="https://krmzi.org/episode/%d9%87%d8%b0%d8%a7-%d8%a7%d9%84%d8%a8%d8%ad%d8%b1-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-35/">حلقة 35 هذا البحر</a></div>
<a href="/episode/x-الحلقة-3/">الحلقة 3</a>
<a href="/episode/x-الحلقة-30/"><span>حلقة</span> 30</a>
<a href="/series/x/">مسلسل x</a><a href="https://other.com/episode-9/">ep 9</a>
<a href="/season-2/ep-1/">s</a><a href="/watch/serie-abc-season-2-episode-12">watch</a>
<a href="/watch/serie-abc-season-2-episode-12">dup</a>`;
const eps = extractEpisodes(html, "https://krmzi.org");
const k = eps.map((e) => `${e.season}x${e.episode}`);
assert.deepStrictEqual(k, ["1x3", "1x30", "1x35", "2x1", "2x12"], k.join());
assert.ok(!eps.some((e) => e.url.includes("other.com")), "foreign hosts ignored");
console.log("✅ episode extraction tests passed");
