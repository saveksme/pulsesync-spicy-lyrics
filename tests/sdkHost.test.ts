import type { AddonApi } from "@pulsesync/addon-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSdkHost, mapSnapshot, sliderVolume } from "../src/host/sdkHost";

it("maps snapshots with numeric or object progress", () => {
  expect(mapSnapshot({ status: "playing", progress: { position: 12.5, duration: 200 }, track: { id: "1", title: "t" }, volume: 0.5 }).progressSec).toBe(12.5);
  expect(mapSnapshot({ status: "paused", progress: 3, track: null, volume: null })).toMatchObject({ progressSec: 3, track: null });
});

it("maps the snapshot track and tolerates junk", () => {
  expect(mapSnapshot({ status: "playing", progress: 1, track: { id: 7, title: "Song", artists: [{ name: "A" }] }, volume: 1 }).track).toMatchObject({ id: "7", title: "Song", artists: ["A"] });
  expect(mapSnapshot(undefined)).toEqual({ status: "idle", progressSec: null, track: null, volume: null });
});

// Yandex Music stores a linear gain (0.01^(1 - position)) but setVolume takes the slider position.
it("turns Yandex Music's linear gain into the slider position", () => {
  expect(sliderVolume(1)).toBe(1);
  expect(sliderVolume(0.1)).toBeCloseTo(0.5, 6);
  expect(sliderVolume(0.01)).toBe(0);
  expect(sliderVolume(0)).toBe(0);
  expect(sliderVolume(null)).toBeNull();
});

function fakeApi(overrides: Record<string, unknown> = {}) {
  const calls = {
    setVolume: vi.fn(async (_volume: number) => {}),
    setProgress: vi.fn(async (_sec: number) => {}),
    togglePlayPause: vi.fn(async () => {
      throw new Error("rpc limit");
    }),
    storageSet: vi.fn(async (_key: string, _value: unknown) => {}),
    warn: vi.fn(),
  };
  let settingsListener: ((raw: unknown) => void) | undefined;
  let current: Record<string, unknown> = { simpleLyricsMode: { value: true, default: false } };
  const api = {
    client: { setVolume: calls.setVolume, setProgress: calls.setProgress, togglePlayPause: calls.togglePlayPause, next: async () => {}, previous: async () => {} },
    player: { onChange: () => () => {}, getSnapshot: async () => ({ status: "paused", progress: 0, track: null, volume: 1 }) },
    storage: { get: async () => undefined, set: calls.storageSet, remove: async () => {} },
    settings: {
      getCurrent: () => current,
      onChange: (listener: (raw: unknown) => void) => {
        settingsListener = listener;
        return () => {};
      },
    },
    logger: { info: vi.fn(), warn: calls.warn, error: vi.fn() },
    ...overrides,
  };
  const pushSettings = (raw: Record<string, unknown>) => {
    current = raw;
    settingsListener?.(raw);
  };
  return { api: api as unknown as AddonApi, calls, pushSettings };
}

describe("createSdkHost", () => {
  afterEach(() => vi.useRealTimers());

  it("coalesces a burst of volume changes into a few calls and lands on the last value", () => {
    vi.useFakeTimers();
    const { api, calls } = fakeApi();
    const host = createSdkHost(api);
    for (let i = 1; i <= 50; i++) host.setVolume(i / 50);
    vi.advanceTimersByTime(1000);
    expect(calls.setVolume.mock.calls.length).toBeLessThanOrEqual(2);
    expect(calls.setVolume).toHaveBeenLastCalledWith(1);
  });

  it("never leaves a failed player call as an unhandled rejection", async () => {
    const { api, calls } = fakeApi();
    createSdkHost(api).togglePlay();
    await vi.waitFor(() => expect(calls.warn).toHaveBeenCalled());
  });

  it("stores only JSON values (PulseSync storage rejects undefined fields)", async () => {
    const { api, calls } = fakeApi();
    await createSdkHost(api).storage.set("k", { a: 1, b: undefined, c: [1, Number.NaN] });
    expect(calls.storageSet).toHaveBeenCalledWith("k", { a: 1, c: [1, null] });
  });

  it("normalizes settings and follows changes", () => {
    const { api, pushSettings } = fakeApi();
    const host = createSdkHost(api);
    expect(host.getSettings().simpleLyricsMode).toBe(true);
    const seen: boolean[] = [];
    host.onSettings((settings) => seen.push(settings.lineBlur));
    pushSettings({ lineBlur: { value: false, default: true } });
    expect(seen).toEqual([false]);
    expect(host.getSettings().lineBlur).toBe(false);
  });

  it("delivers the current snapshot even if no change event comes", async () => {
    const { api } = fakeApi();
    const states: unknown[] = [];
    createSdkHost(api).onPlayer((state) => states.push(state));
    await vi.waitFor(() => expect(states).toHaveLength(1));
    expect(states[0]).toMatchObject({ status: "paused", progressSec: 0, volume: 1 });
  });
});
