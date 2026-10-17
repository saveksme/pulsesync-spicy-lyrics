import { describe, expect, it } from "vitest";
import { createSpotifyIdResolver, normalizeTitle, pickSpotifyCandidate } from "../src/sources/spotifyId";
import { fakeFetch, memoryStorage } from "./helpers/fakeHost";

const track = {
  id: "123",
  title: "Хочешь?",
  artists: ["Земфира"],
  album: "Прости меня моя любовь",
  durationMs: 220000,
  isUgc: false,
} as any;

describe("spotify id", () => {
  it("normalizes titles", () => {
    expect(normalizeTitle("Ёлка (feat. X) - Remastered 2011")).toBe("елка");
  });

  it("picks by title, artist and duration", () => {
    const items = [
      { id: "a", name: "Хочешь? (Live)", duration_ms: 300000, artists: [{ name: "Земфира" }] },
      { id: "b", name: "Хочешь?", duration_ms: 221500, artists: [{ name: "Zemfira" }, { name: "Земфира" }] },
    ];
    expect(pickSpotifyCandidate(track, items)).toBe("b");
    expect(pickSpotifyCandidate(track, [items[0]])).toBeNull();
  });

  it("uses ListenBrainz first and caches", async () => {
    let calls = 0;
    const host = {
      storage: memoryStorage(),
      fetch: fakeFetch({
        "https://labs.api.listenbrainz.org/": () => {
          calls++;
          return Response.json([{ spotify_track_ids: ["4wwqUoX7OweabhkpP2kaTS"] }]);
        },
      }),
    };
    const r = createSpotifyIdResolver(host, () => ({ clientId: "", clientSecret: "" }));
    expect(await r.resolve(track)).toBe("4wwqUoX7OweabhkpP2kaTS");
    expect(await r.resolve(track)).toBe("4wwqUoX7OweabhkpP2kaTS");
    expect(calls).toBe(1);
  });

  it("falls back to Spotify search with client credentials", async () => {
    const host = {
      storage: memoryStorage(),
      fetch: fakeFetch({
        "https://labs.api.listenbrainz.org/": () => Response.json([{ spotify_track_ids: [] }]),
        "https://accounts.spotify.com/api/token": () => Response.json({ access_token: "T", expires_in: 3600 }),
        "https://api.spotify.com/v1/search": () =>
          Response.json({
            tracks: { items: [{ id: "sp1", name: "Хочешь?", duration_ms: 219000, artists: [{ name: "Земфира" }] }] },
          }),
      }),
    };
    const r = createSpotifyIdResolver(host, () => ({ clientId: "id", clientSecret: "sec" }));
    expect(await r.resolve(track)).toBe("sp1");
  });

  it("returns null for UGC without network", async () => {
    const r = createSpotifyIdResolver({ storage: memoryStorage(), fetch: fakeFetch({}) }, () => ({ clientId: "", clientSecret: "" }));
    expect(await r.resolve({ ...track, isUgc: true })).toBeNull();
  });
});
