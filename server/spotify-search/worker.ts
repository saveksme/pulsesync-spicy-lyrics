// Spicy Lyrics for Yandex Music — Spotify catalogue search (Cloudflare Worker).
//
// The Spicy Lyrics API finds lyrics by Spotify track id, which Yandex Music does not know.
// This worker searches Spotify's catalogue with the add-on author's Spotify app (client
// credentials kept as Worker secrets), so the add-on's users need no Spotify keys.
//
// GET /search?track=<title>&artist=<artist>
//   → { items: [{ id, name, duration_ms, artists: [{ name }], album: { name } }] }
//
// Secrets: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET (see README.md next to this file).

export interface Env {
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
}

interface Context {
  waitUntil(promise: Promise<unknown>): void;
}

interface SpotifyTrack {
  id?: unknown;
  name?: unknown;
  duration_ms?: unknown;
  artists?: { name?: unknown }[];
  album?: { name?: unknown };
}

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const SEARCH_URL = "https://api.spotify.com/v1/search";
const LIMIT = 10;
const MAX_INPUT = 200;
// Spotify ids of a song do not change; a miss may be a release that is not out yet.
const FOUND_TTL_SEC = 7 * 24 * 60 * 60;
const MISS_TTL_SEC = 24 * 60 * 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...CORS, ...headers } });

// Field filters break on quotes, and nothing in a title needs them for matching.
const clean = (value: string | null) => (value ?? "").replace(/"/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_INPUT);

const text = (value: unknown) => (typeof value === "string" ? value : "");

function slim(track: SpotifyTrack) {
  return {
    id: text(track.id),
    name: text(track.name),
    duration_ms: typeof track.duration_ms === "number" ? track.duration_ms : 0,
    artists: (Array.isArray(track.artists) ? track.artists : []).map((artist) => ({ name: text(artist?.name) })),
    album: { name: text(track.album?.name) },
  };
}

// The edge cache of Cloudflare (absent in tests and other runtimes).
const edgeCache = () => (globalThis as { caches?: { default?: Cache } }).caches?.default;

export function createWorker() {
  let token: { value: string; expiresAt: number } | null = null;

  async function accessToken(env: Env, fresh: boolean): Promise<string> {
    if (!fresh && token && Date.now() < token.expiresAt) return token.value;
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!response.ok) throw new Error(`Spotify token: HTTP ${response.status}`);
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string") throw new Error("Spotify token: no access_token");
    const lifetime = typeof body.expires_in === "number" ? body.expires_in : 3600;
    token = { value: body.access_token, expiresAt: Date.now() + Math.max(60, lifetime - 60) * 1000 };
    return token.value;
  }

  async function search(env: Env, query: string): Promise<Response> {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("type", "track");
    url.searchParams.set("limit", String(LIMIT));
    let response = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken(env, false)}` } });
    if (response.status === 401) response = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken(env, true)}` } });
    return response;
  }

  return {
    async fetch(request: Request, env: Env, ctx: Context): Promise<Response> {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      const url = new URL(request.url);
      if (url.pathname !== "/search") return json({ error: "not_found" }, 404);
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
      const track = clean(url.searchParams.get("track"));
      const artist = clean(url.searchParams.get("artist"));
      if (!track) return json({ error: "track_required" }, 400);
      if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) return json({ error: "not_configured" }, 500);

      const cache = edgeCache();
      const cacheKey = new Request(`${url.origin}/search?${new URLSearchParams({ track: track.toLowerCase(), artist: artist.toLowerCase() })}`);
      const cached = await cache?.match(cacheKey);
      if (cached) return cached;

      let upstream: Response;
      try {
        upstream = await search(env, artist ? `track:"${track}" artist:"${artist}"` : `track:"${track}"`);
      } catch {
        return json({ error: "upstream_unavailable" }, 502);
      }
      if (upstream.status === 429) return json({ error: "rate_limited" }, 429, { "Retry-After": upstream.headers.get("Retry-After") ?? "5" });
      if (!upstream.ok) return json({ error: "upstream_error", status: upstream.status }, 502);

      const body = (await upstream.json()) as { tracks?: { items?: unknown } };
      const items = (Array.isArray(body.tracks?.items) ? (body.tracks.items as SpotifyTrack[]) : []).map(slim).filter((item) => item.id);
      const response = json({ items }, 200, { "Cache-Control": `public, max-age=${items.length ? FOUND_TTL_SEC : MISS_TTL_SEC}` });
      if (cache) ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    },
  };
}

export default createWorker();
