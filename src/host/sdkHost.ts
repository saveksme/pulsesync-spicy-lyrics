import type { AddonApi, StorageValue } from "@pulsesync/addon-sdk";
import type { Host, PlayerState } from "../core/host";
import { toTrackInfo } from "../core/track";
import { normalizeSettings } from "../settings";

// Every client call is an RPC and PulseSync allows 300 of them per 10 s, so a
// volume drag (one event per mouse move) is coalesced to one call per interval.
const VOLUME_INTERVAL_MS = 100;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

// Yandex Music keeps a linear gain in its player state and takes the slider
// position (its "exponent volume") in setVolume: gain = 0.01 ^ (1 - position).
export function sliderVolume(gain: unknown): number | null {
  if (typeof gain !== "number" || !Number.isFinite(gain)) return null;
  if (gain <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - Math.log(Math.max(gain, 0.01)) / Math.log(0.01)));
}

export function mapSnapshot(snapshot: unknown): PlayerState {
  const s = isRecord(snapshot) ? snapshot : {};
  const progress = typeof s.progress === "number" ? s.progress : isRecord(s.progress) ? s.progress.position : null;
  return {
    status: typeof s.status === "string" ? s.status : "idle",
    progressSec: typeof progress === "number" && Number.isFinite(progress) ? progress : null,
    track: toTrackInfo(s.track),
    volume: sliderVolume(s.volume),
  };
}

// PulseSync storage refuses undefined and non-finite numbers; a JSON round trip drops them.
function toStorageValue(value: unknown): StorageValue {
  return JSON.parse(JSON.stringify(value ?? null)) as StorageValue;
}

export function createSdkHost(api: AddonApi): Host {
  const log = api.logger;
  const call = (name: string, run: () => unknown) => {
    try {
      void Promise.resolve(run()).catch((error) => log.warn(`[spicy-lyrics] ${name} failed`, error));
    } catch (error) {
      log.warn(`[spicy-lyrics] ${name} failed`, error);
    }
  };

  let pendingVolume: number | null = null;
  let volumeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastVolumeAt = -Infinity;
  const flushVolume = () => {
    volumeTimer = null;
    if (pendingVolume === null) return;
    const volume = pendingVolume;
    pendingVolume = null;
    lastVolumeAt = Date.now();
    call("setVolume", () => api.client.setVolume(volume));
  };

  return {
    fetch: (url, init) => api.net.fetch(url, init),
    storage: {
      get: (key) => api.storage.get(key),
      set: (key, value) => api.storage.set(key, toStorageValue(value)),
      remove: (key) => api.storage.remove(key),
    },
    getYandexLyrics: (trackId, format) => api.resources.getLyrics(trackId, format),
    onPlayer(listener) {
      let received = false;
      let active = true;
      const off = api.player.onChange((snapshot) => {
        received = true;
        if (active) listener(mapSnapshot(snapshot));
      });
      // The change stream may stay silent while paused, so ask once for the current state.
      void Promise.resolve()
        .then(() => api.player.getSnapshot())
        .then(
          (snapshot) => {
            if (active && !received) listener(mapSnapshot(snapshot));
          },
          (error) => log.warn("[spicy-lyrics] player snapshot failed", error),
        );
      return () => {
        active = false;
        off();
      };
    },
    seek: (sec) => call("seek", () => api.client.setProgress(Math.max(0, sec))),
    togglePlay: () => call("togglePlay", () => api.client.togglePlayPause()),
    next: () => call("next", () => api.client.next()),
    previous: () => call("previous", () => api.client.previous()),
    setVolume(volume) {
      pendingVolume = Math.min(1, Math.max(0, volume));
      if (volumeTimer !== null) return;
      volumeTimer = setTimeout(flushVolume, Math.max(0, lastVolumeAt + VOLUME_INTERVAL_MS - Date.now()));
    },
    getSettings: () => normalizeSettings(api.settings.getCurrent()),
    onSettings: (listener) => api.settings.onChange((raw) => listener(normalizeSettings(raw))),
    notify: (message) => call("notify", () => api.notifications.info(message)),
    log,
  };
}
