import type { TrackInfo } from "./track";
import type { Settings } from "./types";

export interface PlayerState {
  status: string;
  progressSec: number | null;
  track: TrackInfo | null;
  volume: number | null;
}

export type HostFetchInit = RequestInit & { timeoutMs?: number };

export interface HostStorage {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

// Everything the lyrics core needs from its environment. The PulseSync SDK
// implements it in host/sdkHost.ts, the preview with a mock.
export interface Host {
  fetch(url: string, init?: HostFetchInit): Promise<Response>;
  // Optional: a fetch whose requests carry Origin: null instead of Yandex Music's
  // music-application://desktop (see host/opaqueFetch.ts). Used for Spicy Lyrics.
  fetchOpaque?(url: string, init?: HostFetchInit): Promise<Response>;
  storage: HostStorage;
  getYandexLyrics(trackId: string, format: "LRC" | "TEXT"): Promise<string | null>;
  onPlayer(listener: (state: PlayerState) => void): () => void;
  seek(sec: number): void;
  togglePlay(): void;
  next(): void;
  previous(): void;
  setVolume(volume: number): void;
  getSettings(): Settings;
  onSettings(listener: (settings: Settings) => void): () => void;
  notify(message: string): void;
  log: {
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
  };
}
