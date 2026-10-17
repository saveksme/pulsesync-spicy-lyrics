import type { Host } from "../core/host";
import type { TrackInfo } from "../core/track";

// The Spicy Lyrics API is keyed by Spotify track id. Yandex Music tracks are
// matched by metadata: a Spotify search first — with the user's own client
// credentials, or else through the add-on's search server (server/spotify-search),
// which holds the add-on's Spotify app — then ListenBrainz (no key, but it does not
// know most new and Russian releases).

// The add-on's Spotify search server; "" turns it off. Its origin must also be in
// addon.config.mjs allowedUrls.
export const SPOTIFY_SEARCH_SERVER = "";

export interface SpotifyItem {
  id: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album?: { name?: string };
}

// Candidate Spotify ids for a track, most likely first. [] = none found;
// undefined = a lookup failed (network, server), so "none" is not known yet.
export type SpotifyIdResolver = { candidates(track: TrackInfo, signal?: AbortSignal): Promise<string[] | undefined> };

const LISTENBRAINZ = "https://labs.api.listenbrainz.org/spotify-id-from-metadata/json";
const SPOTIFY_TOKEN = "https://accounts.spotify.com/api/token";
const SPOTIFY_SEARCH = "https://api.spotify.com/v1/search";
const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
// v2: earlier builds kept a single Spotify search match, not every release of the song.
const CACHE_VERSION = 2;
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

// Every release of the song in the results, best first: the one on the same album as in
// Yandex Music, then by how well title and artists match and by duration. Spicy's syncs
// belong to one release, so the others are kept as fallbacks.
export function pickSpotifyCandidates(track: TrackInfo, items: SpotifyItem[]): string[] {
  const titles = [normalizeTitle(track.title), ...(track.version ? [normalizeTitle(`${track.title} ${track.version}`)] : [])];
  const artists = track.artists.map(normalizeTitle).filter(Boolean);
  const album = normalizeTitle(track.album ?? "");
  const matches: { id: string; sameAlbum: boolean; score: number; delta: number }[] = [];
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
    matches.push({ id: item.id, sameAlbum: album !== "" && normalizeTitle(item.album?.name ?? "") === album, score, delta });
  }
  matches.sort((a, b) => Number(b.sameAlbum) - Number(a.sameAlbum) || b.score - a.score || a.delta - b.delta);
  return [...new Set(matches.map((match) => match.id))];
}

type Lookup = string | null | undefined; // undefined = network failure, not a miss

interface MetadataQuery {
  artist_name: string;
  release_name: string;
  track_name: string;
}

// Every artist spelling (all artists, then the first one), with and without the album:
// Spotify lists the releases of one song under different ids, and ListenBrainz names a
// different one depending on how the query is spelled.
export function listenBrainzQueries(track: TrackInfo): MetadataQuery[] {
  const first = track.artists[0] ?? "";
  if (!first) return [];
  const artists = [...new Set([track.artists.join(", "), first])];
  const albums = track.album ? [track.album, ""] : [""];
  const titles = [track.title, ...(track.version ? [`${track.title} ${track.version}`] : [])];
  const queries: MetadataQuery[] = [];
  for (const title of titles)
    for (const album of albums) for (const artist of artists) queries.push({ artist_name: artist, release_name: album, track_name: title });
  return queries;
}

interface Found {
  ids: string[];
  // Whether a Spotify search took part; a lookup made without one is redone once a
  // search is possible (keys entered, search server deployed).
  searched: boolean;
}

export function createSpotifyIdResolver(
  host: Pick<Host, "fetch" | "storage">,
  creds: () => { clientId: string; clientSecret: string },
  options: { searchServer?: string } = {},
): SpotifyIdResolver {
  const searchServer = (options.searchServer ?? SPOTIFY_SEARCH_SERVER).replace(/\/+$/, "");
  const memory = new Map<string, Found>();
  const inflight = new Map<string, Promise<string[] | undefined>>();
  let token: { key: string; value: string; expiresAt: number } | null = null;

  const canSearch = () => {
    const { clientId, clientSecret } = creds();
    return Boolean(searchServer || (clientId && clientSecret));
  };

  async function readCache(trackId: string): Promise<string[] | undefined> {
    let found = memory.get(trackId);
    if (!found) {
      const entry = await host.storage
        .get<{ v?: number; ids: string[]; at: number; searched?: boolean }>(`spotifyIds:${trackId}`)
        .catch(() => undefined);
      if (!entry || entry.v !== CACHE_VERSION || typeof entry.at !== "number" || !Array.isArray(entry.ids)) return undefined;
      if (Date.now() - entry.at > (entry.ids.length ? FOUND_TTL_MS : MISS_TTL_MS)) return undefined;
      found = { ids: entry.ids, searched: entry.searched === true };
      memory.set(trackId, found);
    }
    return found.searched || !canSearch() ? found.ids : undefined;
  }

  async function writeCache(trackId: string, found: Found) {
    memory.set(trackId, found);
    await host.storage.set(`spotifyIds:${trackId}`, { v: CACHE_VERSION, ...found, at: Date.now() }).catch(() => undefined);
  }

  // One POST for all spellings; the answers come back in query order.
  async function listenBrainz(queries: MetadataQuery[], signal?: AbortSignal): Promise<string[] | undefined> {
    if (queries.length === 0) return [];
    try {
      const response = await host.fetch(LISTENBRAINZ, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queries),
        timeoutMs: 10_000,
        signal,
      });
      if (!response.ok) return undefined;
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) return undefined;
      return payload.flatMap((answer) => {
        const ids = (answer as { spotify_track_ids?: unknown })?.spotify_track_ids;
        return Array.isArray(ids) ? ids.filter((value): value is string => typeof value === "string" && SPOTIFY_ID.test(value)) : [];
      });
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
    url.searchParams.set("limit", "10");
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

  // The search server answers in the shape of Spotify's search items.
  async function serverSearch(title: string, artist: string, signal?: AbortSignal): Promise<SpotifyItem[] | undefined> {
    const url = new URL(`${searchServer}/search`);
    url.searchParams.set("track", title);
    if (artist) url.searchParams.set("artist", artist);
    try {
      const response = await host.fetch(url.href, { timeoutMs: 10_000, signal });
      if (!response.ok) return undefined;
      const payload = (await response.json()) as { items?: unknown };
      return Array.isArray(payload.items) ? (payload.items as SpotifyItem[]) : [];
    } catch {
      return undefined;
    }
  }

  async function lookup(track: TrackInfo, signal?: AbortSignal): Promise<string[] | undefined> {
    const found: string[] = [];
    let failed = false;
    let searched = false;
    const bearer = await spotifyToken(signal);
    if (signal?.aborted) return [];
    if (bearer === undefined && !searchServer) failed = true;
    const search = bearer
      ? (title: string, artist: string) => spotifySearch(title, artist, bearer, signal)
      : searchServer
        ? (title: string, artist: string) => serverSearch(title, artist, signal)
        : null;
    if (search) {
      // Spotify ranks its own releases, so search matches go first.
      for (const title of [track.title, ...(track.version ? [`${track.title} ${track.version}`] : [])]) {
        const items = await search(title, track.artists[0] ?? "");
        if (signal?.aborted) return [];
        if (items === undefined) {
          failed = true;
          continue;
        }
        searched = true;
        const ids = pickSpotifyCandidates(track, items);
        if (ids.length > 0) {
          found.push(...ids);
          break;
        }
      }
    }
    const fromListenBrainz = await listenBrainz(listenBrainzQueries(track), signal);
    if (signal?.aborted) return [];
    if (fromListenBrainz === undefined) failed = true;
    const ids = [...new Set([...found, ...(fromListenBrainz ?? [])])];
    if (ids.length === 0 && failed) return undefined;
    await writeCache(track.id, { ids, searched });
    return ids;
  }

  return {
    async candidates(track, signal) {
      if (track.isUgc || !track.title.trim()) return [];
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
