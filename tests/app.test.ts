/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppController, startApp as start } from "../src/app/App";
import type { PlayerState } from "../src/core/host";
import type { TrackInfo } from "../src/core/track";
import type { Settings } from "../src/core/types";
import { DEFAULT_SETTINGS } from "../src/settings";
import { LyricsPage } from "../src/ui/Page";
import { fakeHost, memoryStorage } from "./helpers/fakeHost";

const tr = (id: string): TrackInfo => ({ id, title: id, artists: ["A"], durationMs: 60000, isUgc: false });
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
// Every app is disposed even when a test fails half-way, so pages never leak into the next test.
const apps: AppController[] = [];
function startApp(...args: Parameters<typeof start>): AppController {
  const app = start(...args);
  apps.push(app);
  return app;
}
afterEach(() => {
  for (const app of apps.splice(0)) app.dispose();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const HINT = "Добавьте ключ Spicy Lyrics в настройках аддона — будет пословная синхронизация";

describe("App", () => {
  it("drops stale lyrics when tracks switch quickly", async () => {
    let emit!: (s: any) => void;
    const slow = new Map<string, (v: string) => void>();
    const host = fakeHost({
      onPlayer: (l) => {
        emit = l;
        return () => {};
      },
      getYandexLyrics: (id) => new Promise((res) => slow.set(id, res)),
      getSettings: () => ({ ...DEFAULT_SETTINGS, useLrclib: false }),
    });
    const app = startApp(host);
    app.open();
    emit({ status: "playing", progressSec: 0, track: tr("1"), volume: 1 });
    emit({ status: "playing", progressSec: 0, track: tr("2"), volume: 1 });
    await vi.waitFor(() => expect(slow.has("2")).toBe(true));
    slow.get("2")!("[00:01.00]second");
    await vi.waitFor(() => expect(document.querySelector("#SpicyLyricsPage .line")?.textContent).toBe("second"));
    slow.get("1")?.("[00:01.00]first");
    await new Promise((r) => setTimeout(r, 10));
    expect(document.body.textContent).not.toContain("first");
    app.dispose();
    expect(document.querySelector("#SpicyLyricsPage")).toBeNull();
  });

  it("settings change while open keeps a single page and loop", () => {
    let push!: (s: any) => void;
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const host = fakeHost({
      onSettings: (l) => {
        push = l;
        return () => {};
      },
    });
    const app = startApp(host);
    app.open();
    const before = raf.mock.calls.length;
    push({ ...DEFAULT_SETTINGS, simpleLyricsMode: true, backgroundStyle: "cover" });
    expect(document.querySelectorAll("#SpicyLyricsPage")).toHaveLength(1);
    expect(raf.mock.calls.length - before).toBeLessThanOrEqual(1);
    app.dispose();
    raf.mockRestore();
  });

  it("reloads lyrics when the sources change, not when only the look changes", async () => {
    let emit!: (s: PlayerState) => void;
    let push!: (s: Settings) => void;
    let settings: Settings = { ...DEFAULT_SETTINGS, useLrclib: false };
    const getYandexLyrics = vi.fn(async (_id: string, format: "LRC" | "TEXT") => (format === "LRC" ? "[00:01.00]hello" : null));
    const host = fakeHost({
      onPlayer: (l) => {
        emit = l;
        return () => {};
      },
      onSettings: (l) => {
        push = l;
        return () => {};
      },
      getSettings: () => settings,
      getYandexLyrics,
    });
    const app = startApp(host);
    app.open();
    emit({ status: "playing", progressSec: 0, track: tr("5"), volume: 1 });
    await vi.waitFor(() => expect(document.querySelector("#SpicyLyricsPage .line")?.textContent).toBe("hello"));
    expect(getYandexLyrics).toHaveBeenCalledTimes(1);
    settings = { ...settings, simpleLyricsMode: true, lineBlur: false };
    push(settings);
    await settle();
    expect(getYandexLyrics).toHaveBeenCalledTimes(1);
    expect(document.querySelector("#SpicyLyricsPage .line")?.textContent).toBe("hello");
    settings = { ...settings, useYandex: false };
    push(settings);
    await vi.waitFor(() => expect(document.querySelector("#SpicyLyricsPage .LyricsNotice")).not.toBeNull());
    app.dispose();
  });

  it("hints about the Spicy key once per install, never when a key is set", async () => {
    const notify = vi.fn();
    const storage = memoryStorage();
    const first = startApp(fakeHost({ notify, storage }));
    first.open();
    first.close();
    first.open();
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(notify).toHaveBeenCalledWith(HINT);
    first.dispose();

    const second = startApp(fakeHost({ notify, storage }));
    second.open();
    await settle();
    expect(notify).toHaveBeenCalledTimes(1);
    second.dispose();

    const keyed = vi.fn();
    const third = startApp(fakeHost({ notify: keyed, getSettings: () => ({ ...DEFAULT_SETTINGS, spicyApiKey: "sl_sk_test" }) }));
    third.open();
    await settle();
    expect(keyed).not.toHaveBeenCalled();
    third.dispose();
  });

  it("ignores player events after dispose", async () => {
    let emit!: (s: PlayerState) => void;
    const getYandexLyrics = vi.fn(async () => null);
    const app = startApp(
      fakeHost({
        onPlayer: (l) => {
          emit = l;
          return () => {};
        },
        getYandexLyrics,
      }),
    );
    app.dispose();
    emit({ status: "playing", progressSec: 0, track: tr("9"), volume: 1 });
    app.open();
    await settle();
    expect(getYandexLyrics).not.toHaveBeenCalled();
    expect(document.querySelector("#SpicyLyricsPage")).toBeNull();
  });

  // PulseSync disables an add-on after 3 uncaught errors in 10 s; snapshots arrive 4 times a second.
  it("keeps a failing page update inside the player and settings listeners", () => {
    let emit!: (s: PlayerState) => void;
    let push!: (s: Settings) => void;
    const error = vi.fn();
    const app = startApp(
      fakeHost({
        onPlayer: (l) => {
          emit = l;
          return () => {};
        },
        onSettings: (l) => {
          push = l;
          return () => {};
        },
        log: { info: () => {}, warn: () => {}, error },
      }),
    );
    app.open();
    vi.spyOn(LyricsPage.prototype, "setVolume").mockImplementation(() => {
      throw new Error("boom");
    });
    vi.spyOn(LyricsPage.prototype, "applySettings").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => emit({ status: "playing", progressSec: 1, track: null, volume: 1 })).not.toThrow();
    expect(() => push({ ...DEFAULT_SETTINGS, lineBlur: false })).not.toThrow();
    expect(error).toHaveBeenCalledTimes(2);
  });

  it("falls back to the not-found state when the lyrics fail to render", async () => {
    let emit!: (s: PlayerState) => void;
    const error = vi.fn();
    const app = startApp(
      fakeHost({
        onPlayer: (l) => {
          emit = l;
          return () => {};
        },
        getSettings: () => ({ ...DEFAULT_SETTINGS, useLrclib: false }),
        getYandexLyrics: async (_id, format) => (format === "LRC" ? "[00:01.00]hello" : null),
        log: { info: () => {}, warn: () => {}, error },
      }),
    );
    app.open();
    const original = LyricsPage.prototype.setLyrics;
    const setLyrics = vi.spyOn(LyricsPage.prototype, "setLyrics").mockImplementation(function (this: LyricsPage, state) {
      if (state.status === "ready") throw new Error("render failed");
      original.call(this, state);
    });
    emit({ status: "playing", progressSec: 0, track: tr("7"), volume: 1 });
    await vi.waitFor(() => expect(setLyrics).toHaveBeenLastCalledWith({ status: "none" }));
    expect(error).toHaveBeenCalled();
    expect(document.querySelector("#SpicyLyricsPage .LyricsNotice")).not.toBeNull();
  });

  it("toggles the view from the native lyrics button, like Yandex Music's own panel", () => {
    startApp(fakeHost());
    const button = document.createElement("button");
    button.setAttribute("data-test-id", "PLAYERBAR_DESKTOP_SYNC_LYRICS_BUTTON");
    document.body.appendChild(button);
    button.click();
    expect(document.querySelector("#SpicyLyricsPage")).not.toBeNull();
    button.click();
    expect(document.querySelector("#SpicyLyricsPage")).toBeNull();
  });
});
