import { afterEach, describe, expect, it, vi } from "vitest";
import { createSpotifyWebSearch } from "../src/sources/spotifyWebSearch";
import { fakeFetch } from "./helpers/fakeHost";

const EMBED = "https://open.spotify.com/embed/";
const PATHFINDER = "https://api-partner.spotify.com/pathfinder/v1/query";

// Spotify's embed player page carries an anonymous web-player session in __NEXT_DATA__.
const embedPage = (token: string, expiresAt = Date.now() + 60 * 60 * 1000) =>
  new Response(
    `<html><body><div id="root"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: { pageProps: { state: { settings: { session: { accessToken: token, accessTokenExpirationTimestampMs: expiresAt, isAnonymous: true } } } } },
    })}</script></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

const searchResult = () =>
  Response.json({
    data: {
      searchV2: {
        tracksV2: {
          items: [
            {
              item: {
                data: {
                  id: "4VdSyg6FAJAbc6hMeh24t9",
                  uri: "spotify:track:4VdSyg6FAJAbc6hMeh24t9",
                  name: "Лифт Упал",
                  duration: { totalMilliseconds: 104530 },
                  artists: { items: [{ profile: { name: "VILLIAN" } }] },
                  albumOfTrack: { name: "Красивое Зло", coverArt: { sources: [] } },
                },
              },
            },
            { item: { data: { __typename: "NotFound" } } },
          ],
        },
      },
    },
  });

describe("Spotify web search", () => {
  afterEach(() => vi.useRealTimers());

  it("searches Spotify's catalogue with the anonymous session of Spotify's embed player", async () => {
    const asked: { url: URL; headers: Headers }[] = [];
    const search = createSpotifyWebSearch({
      fetch: fakeFetch({
        [EMBED]: () => embedPage("ANON1"),
        [PATHFINDER]: (url, init) => {
          asked.push({ url, headers: new Headers(init?.headers) });
          return searchResult();
        },
      }),
    });
    expect(await search.search("Лифт Упал VILLIAN")).toEqual([
      { id: "4VdSyg6FAJAbc6hMeh24t9", name: "Лифт Упал", duration_ms: 104530, artists: [{ name: "VILLIAN" }], album: { name: "Красивое Зло" } },
    ]);
    expect(asked).toHaveLength(1);
    const { url, headers } = asked[0];
    expect(url.searchParams.get("operationName")).toBe("searchDesktop");
    expect(JSON.parse(url.searchParams.get("variables")!).searchTerm).toBe("Лифт Упал VILLIAN");
    expect(JSON.parse(url.searchParams.get("extensions")!).persistedQuery.sha256Hash).toMatch(/^[0-9a-f]{64}$/);
    expect(headers.get("Authorization")).toBe("Bearer ANON1");
    expect(headers.get("app-platform")).toBe("WebPlayer");
  });

  it("keeps the session while it lasts and starts a new one when Spotify refuses it", async () => {
    let sessions = 0;
    let refuse = "";
    const search = createSpotifyWebSearch({
      fetch: fakeFetch({
        [EMBED]: () => embedPage(`ANON${++sessions}`),
        [PATHFINDER]: (_url, init) =>
          new Headers(init?.headers).get("Authorization") === `Bearer ${refuse}` ? new Response("{}", { status: 401 }) : searchResult(),
      }),
    });
    await search.search("a");
    await search.search("b");
    expect(sessions).toBe(1);
    refuse = "ANON1";
    expect(await search.search("c")).toHaveLength(1);
    expect(sessions).toBe(2);
  });

  it("starts a new session when the old one has expired", async () => {
    let sessions = 0;
    const search = createSpotifyWebSearch({
      fetch: fakeFetch({
        [EMBED]: () => embedPage(`ANON${++sessions}`, Date.now() + 30_000),
        [PATHFINDER]: () => searchResult(),
      }),
    });
    await search.search("a");
    await search.search("b");
    expect(sessions).toBe(2);
  });

  // Spotify renames its persisted queries from time to time; the add-on then needs an update.
  it("gives up for good when Spotify changed its web search", async () => {
    let searches = 0;
    const search = createSpotifyWebSearch({
      fetch: fakeFetch({
        [EMBED]: () => embedPage("ANON1"),
        [PATHFINDER]: () => {
          searches++;
          return Response.json({ errors: [{ message: "PersistedQueryNotFound" }] });
        },
      }),
    });
    expect(await search.search("a")).toBeUndefined();
    expect(search.available()).toBe(false);
    expect(await search.search("b")).toBeUndefined();
    expect(searches).toBe(1);
  });

  it("gives up for good when the embed page no longer carries a session", async () => {
    const search = createSpotifyWebSearch({ fetch: fakeFetch({ [EMBED]: () => new Response("<html></html>") }) });
    expect(await search.search("a")).toBeUndefined();
    expect(search.available()).toBe(false);
  });

  it("fails one search, not the next, when Spotify is just unreachable", async () => {
    let up = false;
    const search = createSpotifyWebSearch({
      fetch: fakeFetch({
        [EMBED]: () => (up ? embedPage("ANON1") : new Response("busy", { status: 503 })),
        [PATHFINDER]: () => searchResult(),
      }),
    });
    expect(await search.search("a")).toBeUndefined();
    expect(search.available()).toBe(true);
    up = true;
    expect(await search.search("a")).toHaveLength(1);
  });

  it("rests after Spotify's rate limit", async () => {
    vi.useFakeTimers();
    let searches = 0;
    const search = createSpotifyWebSearch({
      fetch: fakeFetch({
        [EMBED]: () => embedPage("ANON1"),
        [PATHFINDER]: () => (++searches === 1 ? new Response("slow down", { status: 429, headers: { "Retry-After": "30" } }) : searchResult()),
      }),
    });
    expect(await search.search("a")).toBeUndefined();
    expect(await search.search("b")).toBeUndefined();
    expect(searches).toBe(1);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(await search.search("c")).toHaveLength(1);
  });
});
