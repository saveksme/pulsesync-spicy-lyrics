import type { Host } from "../core/host";
import type { TrackInfo } from "../core/track";
import type { Settings } from "../core/types";
import { fetchLrclib, lrclibToLyrics } from "./lrclib";
import { fetchSpicyLyrics, spicyKeyFor } from "./spicyApi";
import { createSpotifyIdResolver, type SpotifyIdResolver } from "./spotifyId";
import type { Lyrics } from "./types";
import { fetchYandexPlain, fetchYandexSynced } from "./yandex";

export type StepId = "spicy" | "lrclibWord" | "yandexSynced" | "lrclibSynced" | "yandexPlain" | "lrclibPlain";

export interface LyricsResolver {
  get(track: TrackInfo, signal: AbortSignal): Promise<Lyrics | null>;
  clear(): void;
}

const BEST_ORDER: StepId[] = ["spicy", "lrclibWord", "yandexSynced", "lrclibSynced", "yandexPlain", "lrclibPlain"];
const HIT_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 10 * 60 * 1000;
// An answer reached while a better source was failing (network, 5xx, 429, over budget):
// kept for a minute and never stored, so the better source gets another chance.
const DEGRADED_TTL_MS = 60 * 1000;
// Spicy (with its Spotify ID lookup) and LRCLIB share this much time per track before
// Yandex Music's own lyrics get their turn.
const EXTERNAL_BUDGET_MS = 6000;
const STORED_LIMIT = 40;
const INDEX_KEY = "lyrics:index";
const DEFAULT_RETRY_AFTER_SEC = 60;
const INVALID_KEY_MESSAGE = "Ключ Spicy Lyrics недействителен — использую другие источники";
export const BUILT_IN_KEY_REFUSED_MESSAGE =
  "Spicy Lyrics сейчас не принимает встроенный ключ — показываю тексты Яндекс Музыки и LRCLIB. Можно указать свой ключ в настройках аддона.";

// Spicy requests per track: each costs one request of the per-viewer allowance.
const MAX_SPICY_CANDIDATES = 3;
const PRECISION: Record<Lyrics["Type"], number> = { Syllable: 3, Line: 2, Static: 1 };
// Lyrics ending well after the track ends belong to another version (live, extended).
const END_TOLERANCE_SEC = 5;

function lastTime(lyrics: Lyrics): number {
  if (lyrics.Type === "Syllable") return Math.max(0, ...lyrics.Content.map((line) => line.Lead.EndTime));
  if (lyrics.Type === "Line") return Math.max(0, ...lyrics.Content.map((line) => line.EndTime));
  return 0;
}

function fitsTrack(lyrics: Lyrics, track: TrackInfo): boolean {
  return track.durationMs <= 0 || lastTime(lyrics) <= track.durationMs / 1000 + END_TOLERANCE_SEC;
}

export function sourceSteps(settings: Settings): StepId[] {
  const order =
    settings.sourceOrder === "yandexFirst"
      ? (["yandexSynced", ...BEST_ORDER.filter((step) => step !== "yandexSynced")] as StepId[])
      : BEST_ORDER;
  return order.filter((step) => {
    if (step === "spicy") return settings.useSpicy;
    if (step.startsWith("lrclib")) return settings.useLrclib;
    return settings.useYandex;
  });
}

// FNV-1a: lets the stored cache notice that the sources changed without
// storing the API key itself.
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function sourcesSignature(settings: Settings): string {
  return [
    sourceSteps(settings).join(","),
    fingerprint(spicyKeyFor(settings).key),
    fingerprint(`${settings.spotifyClientId}:${settings.spotifyClientSecret}`),
  ].join("|");
}

// v3: earlier builds cached fallbacks while Spicy was off, or a line-level Spicy sync where
// another release of the song has a word-level one.
const STORED_VERSION = 3;

interface StoredLyrics {
  v: typeof STORED_VERSION;
  at: number;
  sig: string;
  lyrics: Lyrics;
}

interface Flight {
  promise: Promise<Lyrics | null>;
  controller: AbortController;
  waiters: number;
}

interface RunResult {
  lyrics: Lyrics | null;
  degraded: boolean;
}

export function createLyricsResolver(host: Host, deps: { spotify?: SpotifyIdResolver } = {}): LyricsResolver {
  const spotify =
    deps.spotify ??
    createSpotifyIdResolver(host, () => {
      const settings = host.getSettings();
      return { clientId: settings.spotifyClientId, clientSecret: settings.spotifyClientSecret };
    });
  const memory = new Map<string, { lyrics: Lyrics | null; at: number; sig: string; ttl: number }>();
  const flights = new Map<string, Flight>();
  let invalidKey: string | null = null;
  let rateLimitedUntil = 0;

  async function readStored(trackId: string, sig: string): Promise<Lyrics | null> {
    const entry = await host.storage.get<StoredLyrics>(`lyrics:${trackId}`).catch(() => undefined);
    if (!entry || entry.v !== STORED_VERSION || entry.sig !== sig || Date.now() - entry.at > HIT_TTL_MS) return null;
    return entry.lyrics;
  }

  async function store(trackId: string, sig: string, lyrics: Lyrics) {
    try {
      const index = ((await host.storage.get<string[]>(INDEX_KEY)) ?? []).filter((id) => id !== trackId);
      index.push(trackId);
      while (index.length > STORED_LIMIT) await host.storage.remove(`lyrics:${index.shift()}`);
      await host.storage.set(`lyrics:${trackId}`, { v: STORED_VERSION, at: Date.now(), sig, lyrics } satisfies StoredLyrics);
      await host.storage.set(INDEX_KEY, index);
    } catch (error) {
      host.log.warn("[spicy-lyrics] could not store lyrics", error);
    }
  }

  async function spicyStep(track: TrackInfo, settings: Settings, signal: AbortSignal, run: { degraded: boolean }): Promise<Lyrics | null> {
    const { key, builtIn } = spicyKeyFor(settings);
    // A refused key may be fixed any moment (allowlist, new key), so what the fallbacks
    // find meanwhile is not stored.
    if (key === invalidKey) {
      run.degraded = true;
      return null;
    }
    if (Date.now() < rateLimitedUntil) {
      run.degraded = true;
      return null;
    }
    const ids = await spotify.candidates(track, signal);
    if (ids === undefined) run.degraded = true;
    if (!ids?.length || signal.aborted) return null;
    // Releases of one song differ in Spicy (word-level on one, lines on another), so the
    // candidates are compared and the first word-level sync wins.
    let best: { lyrics: Lyrics; precision: number } | null = null;
    for (const id of ids.slice(0, MAX_SPICY_CANDIDATES)) {
      const result = await fetchSpicyLyrics(host, key, id, signal);
      if (signal.aborted) return null;
      if (result.ok) {
        if (!fitsTrack(result.lyrics, track)) continue;
        const precision = PRECISION[result.lyrics.Type];
        if (!best || precision > best.precision) best = { lyrics: result.lyrics, precision };
        if (result.lyrics.Type === "Syllable") break;
        continue;
      }
      if (result.reason === "not-found") continue;
      if (result.reason === "unauthorized" && invalidKey !== key) {
        invalidKey = key;
        host.notify(builtIn ? BUILT_IN_KEY_REFUSED_MESSAGE : INVALID_KEY_MESSAGE);
      }
      if (result.reason === "rate-limited") {
        rateLimitedUntil = Date.now() + (result.retryAfterSec ?? DEFAULT_RETRY_AFTER_SEC) * 1000;
      }
      if (result.reason === "rate-limited" || result.reason === "error" || result.reason === "unauthorized") run.degraded = true;
      break;
    }
    return best?.lyrics ?? null;
  }

  async function run(track: TrackInfo, settings: Settings, sig: string, signal: AbortSignal): Promise<RunResult> {
    const stored = await readStored(track.id, sig);
    if (stored || signal.aborted) return { lyrics: signal.aborted ? null : stored, degraded: false };

    const state = { degraded: false };
    const deadline = Date.now() + EXTERNAL_BUDGET_MS;
    // A step past the shared budget counts as a (temporary) failure of that source.
    const withinBudget = async <T>(work: () => Promise<T | null>): Promise<T | null> => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        state.degraded = true;
        return null;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const overBudget = new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          state.degraded = true;
          resolve(null);
        }, remaining);
      });
      try {
        return await Promise.race([work(), overBudget]);
      } finally {
        clearTimeout(timer);
      }
    };

    type LrclibParts = ReturnType<typeof lrclibToLyrics>;
    let lrclib: Promise<LrclibParts | null> | undefined;
    let lrclibSettled = false;
    const fromLrclib = () =>
      (lrclib ??= fetchLrclib(host, track, signal)
        .then(
          (record) => (record ? lrclibToLyrics(record, track.durationMs / 1000) : null),
          (error) => {
            if (!signal.aborted) {
              state.degraded = true;
              host.log.warn("[spicy-lyrics] LRCLIB failed", error);
            }
            return null;
          },
        )
        .finally(() => {
          lrclibSettled = true;
        }));
    const lrclibPart = async (pick: (parts: LrclibParts) => Lyrics | null) => {
      const parts = lrclibSettled ? await fromLrclib() : await withinBudget(fromLrclib);
      return parts ? pick(parts) : null;
    };

    for (const step of sourceSteps(settings)) {
      if (signal.aborted) return { lyrics: null, degraded: false };
      let lyrics: Lyrics | null = null;
      try {
        if (step === "spicy") lyrics = await withinBudget(() => spicyStep(track, settings, signal, state));
        else if (step === "lrclibWord") lyrics = await lrclibPart((parts) => parts.word);
        else if (step === "yandexSynced") lyrics = await fetchYandexSynced(host, track);
        else if (step === "lrclibSynced") lyrics = await lrclibPart((parts) => parts.synced);
        else if (step === "yandexPlain") lyrics = await fetchYandexPlain(host, track);
        else lyrics = await lrclibPart((parts) => parts.plain);
      } catch (error) {
        if (!signal.aborted) {
          state.degraded = true;
          host.log.warn(`[spicy-lyrics] source ${step} failed`, error);
        }
      }
      if (signal.aborted) return { lyrics: null, degraded: false };
      if (lyrics) {
        if (!state.degraded) await store(track.id, sig, lyrics);
        return { lyrics, degraded: state.degraded };
      }
    }
    return { lyrics: null, degraded: state.degraded };
  }

  function startFlight(track: TrackInfo): Flight {
    const settings = host.getSettings();
    const sig = sourcesSignature(settings);
    const controller = new AbortController();
    const flight: Flight = { controller, waiters: 0, promise: Promise.resolve(null) };
    flight.promise = run(track, settings, sig, controller.signal)
      .then(({ lyrics, degraded }) => {
        if (controller.signal.aborted) return null;
        const ttl = degraded ? DEGRADED_TTL_MS : lyrics ? HIT_TTL_MS : MISS_TTL_MS;
        memory.set(track.id, { lyrics, at: Date.now(), sig, ttl });
        return lyrics;
      })
      .finally(() => {
        if (flights.get(track.id) === flight) flights.delete(track.id);
      });
    flights.set(track.id, flight);
    return flight;
  }

  return {
    get(track, signal) {
      const cached = memory.get(track.id);
      if (cached && cached.sig === sourcesSignature(host.getSettings()) && Date.now() - cached.at < cached.ttl) {
        return Promise.resolve(cached.lyrics);
      }
      const flight = flights.get(track.id) ?? startFlight(track);
      flight.waiters++;
      return new Promise<Lyrics | null>((resolve) => {
        const onAbort = () => {
          signal.removeEventListener("abort", onAbort);
          flight.waiters--;
          if (flight.waiters <= 0) flight.controller.abort();
          resolve(null);
        };
        if (signal.aborted) return onAbort();
        signal.addEventListener("abort", onAbort, { once: true });
        void flight.promise.then((lyrics) => {
          signal.removeEventListener("abort", onAbort);
          resolve(signal.aborted ? null : lyrics);
        });
      });
    },
    clear() {
      memory.clear();
    },
  };
}
