import { describe, expect, it } from "vitest";
import { createSpotifyIdResolver, normalizeTitle, pickSpotifyCandidates } from "../src/sources/spotifyId";
import { fakeFetch, memoryStorage } from "./helpers/fakeHost";

const track = {
  id: "123",
  title: "Хочешь?",
  artists: ["Земфира"],
  album: "Прости меня моя любовь",
  durationMs: 220000,
  isUgc: false,
} as any;

const noCreds = () => ({ clientId: "", clientSecret: "" });
const A = "5TRPicyLGbAF2LGBFbHGvO";
const B = "4lS5zzdpzIGvgXtw9tVRW9";

describe("spotify id", () => {
  it("normalizes titles", () => {
    expect(normalizeTitle("Ёлка (feat. X) - Remastered 2011")).toBe("елка");
  });

  it("picks by title, artist and duration", () => {
    const items = [
      { id: "a", name: "Хочешь? (Live)", duration_ms: 300000, artists: [{ name: "Земфира" }] },
      { id: "b", name: "Хочешь?", duration_ms: 221500, artists: [{ name: "Zemfira" }, { name: "Земфира" }] },
    ];
    expect(pickSpotifyCandidates(track, items)).toEqual(["b"]);
    expect(pickSpotifyCandidates(track, [items[0]])).toEqual([]);
  });

  // Spicy's syncs belong to one Spotify release: a single and the album version of a song can
  // differ (word-level on one, nothing on the other), so every matching release is offered.
  it("offers every matching Spotify release, the one from the same album first", async () => {
    const C = "1fZUqNHa6gSskIpsMA6Nuq";
    const host = {
      storage: memoryStorage(),
      fetch: fakeFetch({
        "https://labs.api.listenbrainz.org/": () => Response.json([]),
        "https://accounts.spotify.com/api/token": () => Response.json({ access_token: "T", expires_in: 3600 }),
        "https://api.spotify.com/v1/search": () =>
          Response.json({
            tracks: {
              items: [
                { id: A, name: "Хочешь?", duration_ms: 220000, artists: [{ name: "Земфира" }], album: { name: "Хочешь?" } },
                { id: C, name: "Хочешь? (Live)", duration_ms: 300000, artists: [{ name: "Земфира" }], album: { name: "Live" } },
                { id: B, name: "Хочешь?", duration_ms: 220500, artists: [{ name: "Земфира" }], album: { name: "Прости меня моя любовь" } },
              ],
            },
          }),
      }),
    };
    const r = createSpotifyIdResolver(host, () => ({ clientId: "id", clientSecret: "sec" }));
    expect(await r.candidates(track)).toEqual([B, A]);
  });

  it("looks again instead of trusting ids cached by an earlier version", async () => {
    const storage = memoryStorage();
    await storage.set("spotifyIds:123", { ids: [], at: Date.now() });
    const host = { storage, fetch: fakeFetch({ "https://labs.api.listenbrainz.org/": () => Response.json([{ spotify_track_ids: [A] }]) }) };
    expect(await createSpotifyIdResolver(host, noCreds).candidates(track)).toEqual([A]);
  });

  // Spotify has several releases of one song; only some carry word-level lyrics in Spicy,
  // and which one ListenBrainz names depends on how the artists are spelled.
  it("asks ListenBrainz about every artist spelling, with and without the album, in one request", async () => {
    const duet = { ...track, title: "Flashing Lights", artists: ["Kanye West", "Dwele"], album: "Graduation" };
    const bodies: unknown[] = [];
    const host = {
      storage: memoryStorage(),
      fetch: fakeFetch({
        "https://labs.api.listenbrainz.org/": (_url, init) => {
          bodies.push(JSON.parse(String(init?.body)));
          return Response.json([
            { spotify_track_ids: [A] },
            { spotify_track_ids: [B] },
            { spotify_track_ids: [A] },
            { spotify_track_ids: [] },
          ]);
        },
      }),
    };
    const r = createSpotifyIdResolver(host, noCreds);
    expect(await r.candidates(duet)).toEqual([A, B]);
    expect(bodies).toEqual([
      [
        { artist_name: "Kanye West, Dwele", release_name: "Graduation", track_name: "Flashing Lights" },
        { artist_name: "Kanye West", release_name: "Graduation", track_name: "Flashing Lights" },
        { artist_name: "Kanye West, Dwele", release_name: "", track_name: "Flashing Lights" },
        { artist_name: "Kanye West", release_name: "", track_name: "Flashing Lights" },
      ],
    ]);
    expect(await r.candidates(duet)).toEqual([A, B]);
    expect(bodies).toHaveLength(1);
  });

  it("puts a Spotify search match first when client credentials are set", async () => {
    const host = {
      storage: memoryStorage(),
      fetch: fakeFetch({
        "https://labs.api.listenbrainz.org/": () => Response.json([{ spotify_track_ids: [B] }]),
        "https://accounts.spotify.com/api/token": () => Response.json({ access_token: "T", expires_in: 3600 }),
        "https://api.spotify.com/v1/search": () =>
          Response.json({ tracks: { items: [{ id: A, name: "Хочешь?", duration_ms: 219000, artists: [{ name: "Земфира" }] }] } }),
      }),
    };
    const r = createSpotifyIdResolver(host, () => ({ clientId: "id", clientSecret: "sec" }));
    expect(await r.candidates(track)).toEqual([A, B]);
  });

  it("tells a failed lookup apart from no candidates", async () => {
    const down = createSpotifyIdResolver(
      { storage: memoryStorage(), fetch: fakeFetch({ "https://labs.api.listenbrainz.org/": () => new Response("busy", { status: 503 }) }) },
      noCreds,
    );
    expect(await down.candidates(track)).toBeUndefined();
    const empty = createSpotifyIdResolver(
      { storage: memoryStorage(), fetch: fakeFetch({ "https://labs.api.listenbrainz.org/": () => Response.json([]) }) },
      noCreds,
    );
    expect(await empty.candidates(track)).toEqual([]);
  });

  it("has no candidates for UGC, without network", async () => {
    const r = createSpotifyIdResolver({ storage: memoryStorage(), fetch: fakeFetch({}) }, noCreds);
    expect(await r.candidates({ ...track, isUgc: true })).toEqual([]);
  });
});
