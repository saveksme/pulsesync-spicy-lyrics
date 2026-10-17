import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorker } from "../server/spotify-search/worker";

const env = { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" };
const ctx = { waitUntil: () => {} };

const spotifyTrack = (id: string) => ({
  id,
  name: "STORM II",
  duration_ms: 173000,
  artists: [{ name: "GENER8ION", id: "a1", uri: "spotify:artist:a1" }, { name: "Yung Lean" }],
  album: { name: "Love & Tears", images: [{ url: "https://i.scdn.co/x" }] },
  popularity: 70,
  preview_url: null,
});

function spotify(search: (url: URL, init?: RequestInit) => Response) {
  const calls = { token: [] as RequestInit[], search: [] as URL[] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.href === "https://accounts.spotify.com/api/token") {
        calls.token.push(init ?? {});
        return Response.json({ access_token: `T${calls.token.length}`, token_type: "Bearer", expires_in: 3600 });
      }
      calls.search.push(url);
      return search(url, init);
    }),
  );
  return calls;
}

const get = (worker: ReturnType<typeof createWorker>, path: string, init?: RequestInit) =>
  worker.fetch(new Request(`https://search.test${path}`, init), env, ctx);

describe("Spotify search worker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("searches Spotify with the app's credentials and answers with what the add-on needs", async () => {
    const calls = spotify(() => Response.json({ tracks: { items: [spotifyTrack("4ipD5CMmWkehabGlAGTOBB")] } }));
    const response = await get(createWorker(), "/search?track=STORM%20II&artist=GENER8ION");
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await response.json()).toEqual({
      items: [
        {
          id: "4ipD5CMmWkehabGlAGTOBB",
          name: "STORM II",
          duration_ms: 173000,
          artists: [{ name: "GENER8ION" }, { name: "Yung Lean" }],
          album: { name: "Love & Tears" },
        },
      ],
    });
    expect(new Headers(calls.token[0].headers).get("Authorization")).toBe(`Basic ${btoa("id:secret")}`);
    expect(calls.search[0].searchParams.get("q")).toBe('track:"STORM II" artist:"GENER8ION"');
    expect(calls.search[0].searchParams.get("type")).toBe("track");
    expect(calls.search[0].searchParams.get("limit")).toBe("10");
  });

  it("keeps quotes out of the Spotify query", async () => {
    const calls = spotify(() => Response.json({ tracks: { items: [] } }));
    await get(createWorker(), `/search?track=${encodeURIComponent('Say "Hi"')}`);
    expect(calls.search[0].searchParams.get("q")).toBe('track:"Say Hi"');
  });

  it("reuses its token, and gets a new one when Spotify refuses it", async () => {
    let refuse = false;
    const calls = spotify((_url, init) => {
      const auth = new Headers(init?.headers).get("Authorization");
      if (refuse && auth === "Bearer T1") return new Response("expired", { status: 401 });
      return Response.json({ tracks: { items: [] } });
    });
    const worker = createWorker();
    await get(worker, "/search?track=a");
    await get(worker, "/search?track=b");
    expect(calls.token).toHaveLength(1);
    refuse = true;
    expect((await get(worker, "/search?track=c")).status).toBe(200);
    expect(calls.token).toHaveLength(2);
  });

  it("passes Spotify's rate limit on", async () => {
    spotify(() => new Response("slow down", { status: 429, headers: { "Retry-After": "7" } }));
    const response = await get(createWorker(), "/search?track=a");
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("7");
  });

  it("answers only track searches", async () => {
    spotify(() => Response.json({ tracks: { items: [] } }));
    const worker = createWorker();
    expect((await get(worker, "/search")).status).toBe(400);
    expect((await get(worker, "/other?track=a")).status).toBe(404);
    expect((await get(worker, "/search?track=a", { method: "POST" })).status).toBe(405);
    const preflight = await get(worker, "/search?track=a", { method: "OPTIONS" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("says so when the Spotify app's credentials are missing", async () => {
    spotify(() => Response.json({ tracks: { items: [] } }));
    const response = await createWorker().fetch(new Request("https://search.test/search?track=a"), {}, ctx);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "not_configured" });
  });
});
