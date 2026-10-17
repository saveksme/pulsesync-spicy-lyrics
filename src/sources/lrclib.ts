import type { Host } from "../core/host";
import type { TrackInfo } from "../core/track";
import { parseLrc } from "./lrc";
import { parseLyricsfile } from "./lyricsfile";
import { plainToStatic } from "./shared";
import type { LineLyrics, StaticLyrics, SyllableLyrics } from "./types";

const API = "https://lrclib.net/api/";
// LRCLIB matches by duration; word-synced files are timed against more releases,
// so they get a wider window (same tolerances as the PulseSync mod).
const LINE_TOLERANCE_SEC = 2;
const WORD_TOLERANCE_SEC = 10;
// An overloaded LRCLIB answers 503 "server busy" with Retry-After (often to half of the
// requests); a second ask usually gets through, so busy answers are retried like the
// PulseSync mod does.
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [1000, 1500, 2500, 4000, 6000];
const MAX_RETRY_AFTER_MS = 10_000;

export interface LrclibOptions {
  // Asked before each retry of a busy LRCLIB; false gives up at once (something else
  // is ready to be shown instead).
  shouldRetry?: () => boolean | Promise<boolean>;
}

export interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration: number;
  instrumental: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
  lyricsfile?: string | null;
  hasWordSync?: boolean;
}

const isRecord = (value: unknown): value is LrclibRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as LrclibRecord).id === "number";

// LRCLIB sends a lyricsfile with every record, timed or not; only timed lines count.
const isSynced = (record: LrclibRecord) =>
  Boolean(record.syncedLyrics?.trim()) || (typeof record.lyricsfile === "string" && parseLyricsfile(record.lyricsfile, "lrclib") !== null);

export function pickLrclibCandidate(track: TrackInfo, items: LrclibRecord[]): LrclibRecord | null {
  const duration = track.durationMs / 1000;
  const candidates = items
    .filter((record) => isRecord(record) && !record.instrumental)
    .map((record) => ({
      record,
      synced: isSynced(record),
      delta: duration > 0 && typeof record.duration === "number" ? Math.abs(record.duration - duration) : 0,
    }))
    .filter(
      ({ record, synced, delta }) =>
        (synced || Boolean(record.plainLyrics?.trim())) && delta <= (record.hasWordSync ? WORD_TOLERANCE_SEC : LINE_TOLERANCE_SEC),
    );
  candidates.sort(
    (a, b) =>
      Number(Boolean(b.record.hasWordSync)) - Number(Boolean(a.record.hasWordSync)) ||
      Number(b.synced) - Number(a.synced) ||
      a.delta - b.delta,
  );
  return candidates[0]?.record ?? null;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function getJson(host: Pick<Host, "fetch">, url: URL, signal: AbortSignal | undefined, options: LrclibOptions): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const response = await host.fetch(url.href, { timeoutMs: 10_000, signal });
    if (response.status === 404) return null;
    if (response.ok) return response.json();
    const delay = RETRY_DELAYS_MS[attempt];
    if (!RETRY_STATUSES.has(response.status) || delay === undefined || !(await (options.shouldRetry?.() ?? true))) {
      throw new Error(`LRCLIB HTTP ${response.status}`);
    }
    const retryAfter = Number(response.headers.get("Retry-After")) * 1000;
    await wait(Math.min(Math.max(delay, Number.isFinite(retryAfter) ? retryAfter : 0), MAX_RETRY_AFTER_MS), signal);
  }
}

export async function fetchLrclib(
  host: Pick<Host, "fetch">,
  track: TrackInfo,
  signal?: AbortSignal,
  options: LrclibOptions = {},
): Promise<LrclibRecord | null> {
  if (!track.title.trim()) return null;
  const artist = track.artists[0] ?? "";
  const duration = Math.round(track.durationMs / 1000);

  // The exact match may carry only plain text while another upload of the song is
  // timed, so a plain match is kept as the fallback of a search.
  let exact: LrclibRecord | null = null;
  if (artist) {
    const url = new URL("get", API);
    url.searchParams.set("track_name", track.title);
    url.searchParams.set("artist_name", artist);
    if (track.album) url.searchParams.set("album_name", track.album);
    if (duration > 0) url.searchParams.set("duration", String(duration));
    const found = await getJson(host, url, signal, options);
    if (isRecord(found) && pickLrclibCandidate(track, [found])) {
      if (isSynced(found)) return found;
      exact = found;
    }
  }

  const url = new URL("search", API);
  url.searchParams.set("track_name", track.title);
  if (artist) url.searchParams.set("artist_name", artist);
  const results = await getJson(host, url, signal, options);
  const items = Array.isArray(results) ? (results as LrclibRecord[]) : [];
  return pickLrclibCandidate(track, exact ? [exact, ...items] : items);
}

export function lrclibToLyrics(
  record: LrclibRecord,
  durationSec: number,
): { word: SyllableLyrics | null; synced: LineLyrics | SyllableLyrics | null; plain: StaticLyrics | null } {
  const fromFile = record.lyricsfile ? parseLyricsfile(record.lyricsfile, "lrclib") : null;
  const word = fromFile?.Type === "Syllable" ? fromFile : null;
  const synced = record.syncedLyrics
    ? parseLrc(record.syncedLyrics, { source: "lrclib", durationSec: durationSec > 0 ? durationSec : undefined })
    : fromFile?.Type === "Line"
      ? fromFile
      : null;
  return { word, synced, plain: plainToStatic(record.plainLyrics, "lrclib") };
}
