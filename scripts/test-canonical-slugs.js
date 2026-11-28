const assert = require("assert");
const {
  normalizeCanonicalSlug,
  extractEpisodeMetadata,
  canonicalSourceId,
  isEpisodeLevelMetaId,
} = require("./sync-from-source.js");

assert.strictEqual(
  normalizeCanonicalSlug("watch__episodes__serie-sakla-beni-10jul5"),
  "sakla-beni"
);
assert.strictEqual(
  normalizeCanonicalSlug("/watch/episodes/serie-sakla-beni-10jul5"),
  "sakla-beni"
);
assert.strictEqual(
  normalizeCanonicalSlug("movie__11321__film-title-k997m"),
  "film-title"
);
assert.strictEqual(normalizeCanonicalSlug("the-show-s01-e07"), "the-show");
assert.strictEqual(normalizeCanonicalSlug("series-12-12-12-s01-e04"), "series-12-12-12");
assert.strictEqual(normalizeCanonicalSlug("show-mudblij-2"), "show");
assert.deepStrictEqual(extractEpisodeMetadata("show-season-2-episode-17"), {
  isEpisode: true,
  season: 2,
  episode: 17,
});
assert.deepStrictEqual(extractEpisodeMetadata("show-episode-13"), {
  isEpisode: true,
  season: 1,
  episode: 13,
});
assert.strictEqual(isEpisodeLevelMetaId("provider_show-s01-e07"), true);
assert.strictEqual(isEpisodeLevelMetaId("provider_watch-episodes-serie-show"), true);
assert.strictEqual(isEpisodeLevelMetaId("provider_watch__episodes__serie-show"), true);
assert.strictEqual(isEpisodeLevelMetaId("provider_canonical-show"), false);
assert.strictEqual(isEpisodeLevelMetaId("akwam_star-wars-episode-v"), false);
assert.strictEqual(canonicalSourceId("faselhd2"), "fasselhd");
assert.strictEqual(canonicalSourceId("tukcima"), "tukcima");

console.log("✅ canonical slug and source alias tests passed");
