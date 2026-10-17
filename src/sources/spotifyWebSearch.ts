import type { Host } from "../core/host";
import type { SpotifyItem } from "./spotifyId";

// Spotify's own catalogue search without any keys, the way Spicy Lyrics Mobile matches tracks
// played by other apps (github.com/spicylyrics/mobile, AGPL-3.0): Spotify's embed player page
// hands every visitor an anonymous web-player session, and the web player's search accepts it.
// Neither is a documented API, so everything here fails soft: when Spotify changes them, the
// search turns itself off and the ListenBrainz lookup still runs.

const EMBED_URL = "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC";
const PATHFINDER_URL = "https://api-partner.spotify.com/pathfinder/v1/query";
const SEARCH_OPERATION = "searchDesktop";
// Spotify renames its persisted queries now and then; PersistedQueryNotFound means it did.
const SEARCH_SHA256 = "eff59fa0a3d026b88b56fddbcf4bdfa16a186b8175a5c1a358c072e053c2e5b0";
const SEARCH_LIMIT = 10;
const EXPIRY_SKEW_MS = 60_000;
const DEFAULT_RETRY_AFTER_SEC = 60;
const NEXT_DATA = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;
const SPOTIFY_ID = /^[0-9A-Za-z]{22}$/;

export interface SpotifyWebSearch {
  // Tracks Spotify finds for a free-text term; undefined = the search failed.
  search(term: string, signal?: AbortSignal): Promise<SpotifyItem[] | undefined>;
  // False once Spotify changed its page or search beyond what this code understands.
  available(): boolean;
}

// Spotify changed something this code depends on; asking again will not help.
class SpotifyChanged extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const at = (value: unknown, ...keys: string[]): unknown =>
  keys.reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), value);

function parseSession(html: string): { token: string; expiresAt: number } {
  let data: unknown;
  try {
    data = JSON.parse(NEXT_DATA.exec(html)?.[1] ?? "");
  } catch {
    throw new SpotifyChanged("Spotify's embed page has no __NEXT_DATA__");
  }
  const session = at(data, "props", "pageProps", "state", "settings", "session");
  const token = at(session, "accessToken");
  const expiresAt = at(session, "accessTokenExpirationTimestampMs");
  if (typeof token !== "string" || !token || typeof expiresAt !== "number") throw new SpotifyChanged("Spotify's embed page has no session");
  return { token, expiresAt };
}

function parseTracks(payload: unknown): SpotifyItem[] {
  const errors = at(payload, "errors");
  if (Array.isArray(errors) && errors.some((error) => at(error, "message") === "PersistedQueryNotFound")) {
    throw new SpotifyChanged("Spotify renamed its search query");
  }
  const items = at(payload, "data", "searchV2", "tracksV2", "items");
  if (!Array.isArray(items)) throw new SpotifyChanged("Spotify's search answer changed shape");
  return items.flatMap((entry) => {
    const data = at(entry, "item", "data");
    const id = at(data, "id");
    const name = at(data, "name");
    const durationMs = at(data, "duration", "totalMilliseconds");
    const artistItems = at(data, "artists", "items");
    const artists = (Array.isArray(artistItems) ? artistItems : [])
      .map((artist) => at(artist, "profile", "name"))
      .filter((artist): artist is string => typeof artist === "string" && artist !== "");
    const album = at(data, "albumOfTrack", "name");
    if (typeof id !== "string" || !SPOTIFY_ID.test(id) || typeof name !== "string" || typeof durationMs !== "number" || artists.length === 0) return [];
    return [{ id, name, duration_ms: durationMs, artists: artists.map((artist) => ({ name: artist })), album: { name: typeof album === "string" ? album : "" } }];
  });
}

export function createSpotifyWebSearch(host: Pick<Host, "fetch">): SpotifyWebSearch {
  let session: { token: string; expiresAt: number } | null = null;
  let starting: Promise<string> | null = null;
  let changed = false;
  let restUntil = 0;

  async function startSession(signal?: AbortSignal): Promise<string> {
    const response = await host.fetch(EMBED_URL, { timeoutMs: 10_000, signal });
    if (!response.ok) throw new Error(`Spotify embed page: HTTP ${response.status}`);
    session = parseSession(await response.text());
    return session.token;
  }

  function token(signal: AbortSignal | undefined, fresh: boolean): Promise<string> {
    if (!fresh && session && session.expiresAt - EXPIRY_SKEW_MS > Date.now()) return Promise.resolve(session.token);
    starting ??= startSession(signal).finally(() => {
      starting = null;
    });
    return starting;
  }

  function query(term: string, bearer: string, signal?: AbortSignal): Promise<Response> {
    const url = new URL(PATHFINDER_URL);
    url.searchParams.set("operationName", SEARCH_OPERATION);
    url.searchParams.set(
      "variables",
      JSON.stringify({
        searchTerm: term,
        offset: 0,
        limit: SEARCH_LIMIT,
        numberOfTopResults: 5,
        includeAudiobooks: false,
        includePreReleases: true,
        includeAlbumPreReleases: false,
        includeAuthors: false,
        includeEpisodeContentRatingsV2: false,
      }),
    );
    url.searchParams.set("extensions", JSON.stringify({ persistedQuery: { version: 1, sha256Hash: SEARCH_SHA256 } }));
    return host.fetch(url.href, { headers: { Authorization: `Bearer ${bearer}`, "app-platform": "WebPlayer" }, timeoutMs: 10_000, signal });
  }

  return {
    available: () => !changed,
    async search(term, signal) {
      if (changed || Date.now() < restUntil || !term.trim()) return undefined;
      try {
        let response = await query(term, await token(signal, false), signal);
        // A session Spotify has ended before its time: start another one, once.
        if (response.status === 401) response = await query(term, await token(signal, true), signal);
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("Retry-After"));
          restUntil = Date.now() + (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : DEFAULT_RETRY_AFTER_SEC) * 1000;
          return undefined;
        }
        if (!response.ok) return undefined;
        return parseTracks(await response.json());
      } catch (error) {
        if (error instanceof SpotifyChanged) changed = true;
        return undefined;
      }
    },
  };
}
