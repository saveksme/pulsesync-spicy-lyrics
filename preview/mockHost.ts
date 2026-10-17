import type { Host, PlayerState } from "../src/core/host";
import type { TrackInfo } from "../src/core/track";
import type { Settings } from "../src/core/types";
import { DEFAULT_SETTINGS } from "../src/settings";

// A stand-in player for the browser preview: emits progress ~4 times a second,
// like Yandex Music's timeupdate-driven progress.
export class MockPlayer {
  playing = true;
  private base = 0;
  private baseAt = performance.now();
  volume = 0.7;
  listeners = new Set<(state: PlayerState) => void>();
  settingsListeners = new Set<(settings: Settings) => void>();
  settings: Settings = { ...DEFAULT_SETTINGS };

  constructor(
    public track: TrackInfo,
    private readonly durationMs: number,
  ) {
    setInterval(() => this.emit(), 250);
  }

  positionSec(): number {
    const elapsed = this.playing ? (performance.now() - this.baseAt) / 1000 : 0;
    let position = this.base + elapsed;
    if (position * 1000 >= this.durationMs) {
      this.base = 0;
      this.baseAt = performance.now();
      position = 0;
    }
    return position;
  }

  emit(): void {
    const state: PlayerState = { status: this.playing ? "playing" : "paused", progressSec: this.positionSec(), track: this.track, volume: this.volume };
    for (const listener of this.listeners) listener(state);
  }

  seek(sec: number): void {
    this.base = Math.max(0, sec);
    this.baseAt = performance.now();
    this.emit();
  }

  toggle(): void {
    this.base = this.positionSec();
    this.baseAt = performance.now();
    this.playing = !this.playing;
    this.emit();
  }

  setSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    for (const listener of this.settingsListeners) listener(this.settings);
  }
}

export function createMockHost(player: MockPlayer): Host {
  const store = new Map<string, unknown>();
  return {
    fetch: (url, init) => fetch(url, init),
    storage: {
      async get<T>(key: string) {
        return store.get(key) as T | undefined;
      },
      async set(key, value) {
        store.set(key, value);
      },
      async remove(key) {
        store.delete(key);
      },
    },
    getYandexLyrics: async () => null,
    onPlayer(listener) {
      player.listeners.add(listener);
      return () => player.listeners.delete(listener);
    },
    seek: (sec) => player.seek(sec),
    togglePlay: () => player.toggle(),
    next: () => player.seek(0),
    previous: () => player.seek(0),
    setVolume: (volume) => {
      player.volume = volume;
    },
    getSettings: () => player.settings,
    onSettings(listener) {
      player.settingsListeners.add(listener);
      return () => player.settingsListeners.delete(listener);
    },
    notify: (message) => console.info("[notify]", message),
    log: console,
  };
}

// A colourful generated cover, so the preview needs no network.
export async function makeCover(hueA: number, hueB: number): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 640;
  const context = canvas.getContext("2d")!;
  const gradient = context.createLinearGradient(0, 0, 640, 640);
  gradient.addColorStop(0, `hsl(${hueA} 85% 55%)`);
  gradient.addColorStop(1, `hsl(${hueB} 80% 35%)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 640, 640);
  for (let i = 0; i < 14; i++) {
    context.beginPath();
    context.fillStyle = `hsla(${(hueA + i * 23) % 360} 90% ${40 + (i % 4) * 12}% / 0.55)`;
    context.arc(80 + ((i * 97) % 520), 60 + ((i * 151) % 540), 40 + ((i * 37) % 110), 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = "rgba(255,255,255,0.92)";
  context.font = "800 64px sans-serif";
  context.fillText("SPICY", 60, 560);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
  return URL.createObjectURL(blob);
}
