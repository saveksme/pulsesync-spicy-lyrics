import type { Host } from "../core/host";
import type { TrackInfo } from "../core/track";

// The Spicy Lyrics API is keyed by Spotify track id. Yandex Music tracks are
// matched by metadata: ListenBrainz first (no key), then Spotify Search when
// the user supplied client credentials.

export interface SpotifyItem {
  id: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
}

// undefined: the lookup failed (network, server), so "no id" is not known yet.
export type SpotifyIdResolver = { resolve(track: TrackInfo, signal?: AbortSignal): Promise<string | null | undefined> };

const LISTENBRAINZ = "https://labs.api.listenbrainz.org/spotify-id-from-metadata/json";
const SPOTIFY_TOKEN = "https://accounts.spotify.com/api/token";
const SPOTIFY_SEARCH = "https://api.spotify.com/v1/search";
const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_DURATION_DELTA_MS = 3000;
const MIN_SCORE = 4;
const SPOTIFY_ID = /^[0-9A-Za-z]{22}$/;

export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/ё/g, "е")
    .replace(/[([][^)\]]*[)\]]/g, " ")
    .replace(/\s+[-–—]\s+.*\b(remaster\w*|version|edit|mix|live|mono|stereo|remix)\b.*$/i, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function similarity(a: string, b: string, equal: number, partial: number): number {
  if (!a || !b) return 0;
  if (a === b) return equal;
  return a.includes(b) || b.includes(a) ? partial : 0;
}

export function pickSpotifyCandidate(track: TrackInfo, items: SpotifyItem[]): string | null {
  const titles = [normalizeTitle(track.title), ...(track.version ? [normalizeTitle(`${track.title} ${track.version}`)] : [])];
  const artists = track.artists.map(normalizeTitle).filter(Boolean);
  let best: { id: string; score: number; delta: number } | null = null;
  for (const item of items) {
    if (!item || typeof item.id !== "string" || !item.id) continue;
    const delta = track.durationMs > 0 && Number.isFinite(item.duration_ms) ? Math.abs(item.duration_ms - track.durationMs) : 0;
    if (delta > MAX_DURATION_DELTA_MS) continue;
    const name = normalizeTitle(item.name ?? "");
    const titleScore = Math.max(...titles.map((title) => similarity(name, title, 3, 2)));
    const itemArtists = (item.artists ?? []).map((artist) => normalizeTitle(artist?.name ?? ""));
    let artistScore = 0;
    for (const wanted of artists) for (const candidate of itemArtists) artistScore = Math.max(artistScore, similarity(candidate, wanted, 2, 1));
    const score = titleScore + artistScore;
    if (score < MIN_SCORE) continue;
    if (!best || score > best.score || (score === best.score && delta < best.delta)) best = { id: item.id, score, delta };
  }
  return best?.id ?? null;
}

type Lookup = string | null | undefined; // undefined = network failure, not a miss

export function createSpotifyIdResolver(
  host: Pick<Host, "fetch" | "storage">,
  creds: () => { clientId: string; clientSecret: string },
): SpotifyIdResolver {
  const memory = new Map<string, string | null>();
  const inflight = new Map<string, Promise<string | null | undefined>>();
  let token: { key: string; value: string; expiresAt: number } | null = null;

  async function readCache(trackId: string): Promise<string | null | undefined> {
    if (memory.has(trackId)) return memory.get(trackId);
    const entry = await host.storage.get<{ id: string | null; at: number }>(`spotifyId:${trackId}`).catch(() => undefined);
    if (!entry || typeof entry.at !== "number") return undefined;
    if (Date.now() - entry.at > (entry.id ? FOUND_TTL_MS : MISS_TTL_MS)) return undefined;
    memory.set(trackId, entry.id);
    return entry.id;
  }

  async function writeCache(trackId: string, id: string | null) {
    memory.set(trackId, id);
    await host.storage.set(`spotifyId:${trackId}`, { id, at: Date.now() }).catch(() => undefined);
  }

  async function listenBrainz(artist: string, album: string, title: string, signal?: AbortSignal): Promise<Lookup> {
    const url = new URL(LISTENBRAINZ);
    url.searchParams.set("artist_name", artist);
    url.searchParams.set("release_name", album);
    url.searchParams.set("track_name", title);
    try {
      const response = await host.fetch(url.href, { timeoutMs: 10_000, signal });
      if (!response.ok) return undefined;
      const payload: unknown = await response.json();
      const ids = Array.isArray(payload) ? (payload[0] as { spotify_track_ids?: unknown })?.spotify_track_ids : undefined;
      const id = Array.isArray(ids) ? ids.find((value): value is string => typeof value === "string" && SPOTIFY_ID.test(value)) : undefined;
      return id ?? null;
    } catch {
      return undefined;
    }
  }

  async function spotifyToken(signal?: AbortSignal): Promise<Lookup> {
    const { clientId, clientSecret } = creds();
    if (!clientId || !clientSecret) return null;
    const key = `${clientId}:${clientSecret}`;
    if (token && token.key === key && Date.now() < token.expiresAt) return token.value;
    try {
      const response = await host.fetch(SPOTIFY_TOKEN, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(key)}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
        timeoutMs: 10_000,
        signal,
      });
      if (!response.ok) return response.status === 400 || response.status === 401 ? null : undefined;
      const payload = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
      if (typeof payload.access_token !== "string") return null;
      const lifetime = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
      token = { key, value: payload.access_token, expiresAt: Date.now() + Math.max(60, lifetime - 60) * 1000 };
      return token.value;
    } catch {
      return undefined;
    }
  }

  async function spotifySearch(title: string, artist: string, bearer: string, signal?: AbortSignal): Promise<SpotifyItem[] | undefined> {
    const url = new URL(SPOTIFY_SEARCH);
    url.searchParams.set("type", "track");
    url.searchParams.set("limit", "5");
    url.searchParams.set("q", artist ? `track:"${title}" artist:"${artist}"` : `track:"${title}"`);
    try {
      const response = await host.fetch(url.href, { headers: { Authorization: `Bearer ${bearer}` }, timeoutMs: 10_000, signal });
      if (!response.ok) return undefined;
      const payload = (await response.json()) as { tracks?: { items?: unknown } };
      return Array.isArray(payload.tracks?.items) ? (payload.tracks.items as SpotifyItem[]) : [];
    } catch {
      return undefined;
    }
  }

  async function lookup(track: TrackInfo, signal?: AbortSignal): Promise<string | null | undefined> {
    const artist = track.artists[0] ?? "";
    const titles = [track.title, ...(track.version ? [`${track.title} ${track.version}`] : [])];
    let failed = false;
    for (const title of titles) {
      if (artist) {
        for (const album of track.album ? [track.album, ""] : [""]) {
          const id = await listenBrainz(artist, album, title, signal);
          if (signal?.aborted) return null;
          if (id === undefined) failed = true;
          if (id) return writeCache(track.id, id).then(() => id);
        }
      }
      const bearer = await spotifyToken(signal);
      if (signal?.aborted) return null;
      if (bearer === undefined) failed = true;
      if (bearer) {
        const items = await spotifySearch(title, artist, bearer, signal);
        if (signal?.aborted) return null;
        if (items === undefined) failed = true;
        const id = items ? pickSpotifyCandidate(track, items) : null;
        if (id) return writeCache(track.id, id).then(() => id);
      }
    }
    if (failed) return undefined;
    await writeCache(track.id, null);
    return null;
  }

  return {
    async resolve(track, signal) {
      if (track.isUgc || !track.title.trim()) return null;
      const cached = await readCache(track.id);
      if (cached !== undefined) return cached;
      const running = inflight.get(track.id);
      if (running) return running;
      const promise = lookup(track, signal).finally(() => inflight.delete(track.id));
      inflight.set(track.id, promise);
      return promise;
    },
  };
}
