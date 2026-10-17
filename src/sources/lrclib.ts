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

const hasLyrics = (record: LrclibRecord) => Boolean(record.syncedLyrics || record.plainLyrics || record.lyricsfile);

export function pickLrclibCandidate(track: TrackInfo, items: LrclibRecord[]): LrclibRecord | null {
  const duration = track.durationMs / 1000;
  const candidates = items
    .filter((record) => isRecord(record) && !record.instrumental && hasLyrics(record))
    .map((record) => ({ record, delta: duration > 0 && typeof record.duration === "number" ? Math.abs(record.duration - duration) : 0 }))
    .filter(({ record, delta }) => delta <= (record.hasWordSync ? WORD_TOLERANCE_SEC : LINE_TOLERANCE_SEC));
  candidates.sort(
    (a, b) =>
      Number(Boolean(b.record.hasWordSync)) - Number(Boolean(a.record.hasWordSync)) ||
      Number(Boolean(b.record.syncedLyrics || b.record.lyricsfile)) - Number(Boolean(a.record.syncedLyrics || a.record.lyricsfile)) ||
      a.delta - b.delta,
  );
  return candidates[0]?.record ?? null;
}

async function getJson(host: Pick<Host, "fetch">, url: URL, signal?: AbortSignal): Promise<unknown> {
  const response = await host.fetch(url.href, { timeoutMs: 10_000, signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`LRCLIB HTTP ${response.status}`);
  return response.json();
}

export async function fetchLrclib(host: Pick<Host, "fetch">, track: TrackInfo, signal?: AbortSignal): Promise<LrclibRecord | null> {
  if (!track.title.trim()) return null;
  const artist = track.artists[0] ?? "";
  const duration = Math.round(track.durationMs / 1000);

  if (artist) {
    const url = new URL("get", API);
    url.searchParams.set("track_name", track.title);
    url.searchParams.set("artist_name", artist);
    if (track.album) url.searchParams.set("album_name", track.album);
    if (duration > 0) url.searchParams.set("duration", String(duration));
    const exact = await getJson(host, url, signal);
    if (isRecord(exact) && pickLrclibCandidate(track, [exact])) return exact;
  }

  const url = new URL("search", API);
  url.searchParams.set("track_name", track.title);
  if (artist) url.searchParams.set("artist_name", artist);
  const results = await getJson(host, url, signal);
  return Array.isArray(results) ? pickLrclibCandidate(track, results as LrclibRecord[]) : null;
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
