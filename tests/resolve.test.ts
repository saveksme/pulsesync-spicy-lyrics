import { afterEach, describe, expect, it, vi } from "vitest";
import { createLyricsResolver, sourceSteps } from "../src/sources/resolve";
import { DEFAULT_SETTINGS } from "../src/settings";
import { fakeFetch, fakeHost } from "./helpers/fakeHost";

const track = { id: "42", title: "T", artists: ["A"], durationMs: 100000, isUgc: false } as any;
const lrc = "[00:01.00]a\n[00:02.00]b";

describe("resolver", () => {
  it("orders steps", () => {
    expect(sourceSteps(DEFAULT_SETTINGS)).toEqual(["lrclibWord", "yandexSynced", "lrclibSynced", "yandexPlain", "lrclibPlain"]);
    expect(sourceSteps({ ...DEFAULT_SETTINGS, spicyApiKey: "k" })[0]).toBe("spicy");
    expect(sourceSteps({ ...DEFAULT_SETTINGS, spicyApiKey: "k", sourceOrder: "yandexFirst" })[0]).toBe("yandexSynced");
    expect(sourceSteps({ ...DEFAULT_SETTINGS, useLrclib: false })).toEqual(["yandexSynced", "yandexPlain"]);
  });

  it("falls through to yandex and caches; dedupes concurrent calls", async () => {
    const getYandexLyrics = vi.fn(async () => lrc);
    const host = fakeHost({
      getYandexLyrics,
      fetch: fakeFetch({ "https://lrclib.net/": () => new Response("{}", { status: 404 }) }),
    });
    const r = createLyricsResolver(host);
    const [a, b] = await Promise.all([r.get(track, new AbortController().signal), r.get(track, new AbortController().signal)]);
    expect(a!.source).toBe("yandex");
    expect(b).toBe(a);
    await r.get(track, new AbortController().signal);
    expect(getYandexLyrics).toHaveBeenCalledTimes(1);
  });

  it("notifies once on invalid key and falls back", async () => {
    const notify = vi.fn();
    const host = fakeHost({
      notify,
      getSettings: () => ({ ...DEFAULT_SETTINGS, spicyApiKey: "bad", useLrclib: false }),
      getYandexLyrics: async () => lrc,
      fetch: fakeFetch({
        "https://labs.api.listenbrainz.org/": () => Response.json([{ spotify_track_ids: ["x".repeat(22)] }]),
        "https://api.spicylyrics.org/": () => new Response("{}", { status: 401 }),
      }),
    });
    const r = createLyricsResolver(host);
    expect((await r.get(track, new AbortController().signal))!.source).toBe("yandex");
    r.clear();
    await r.get({ ...track, id: "43" }, new AbortController().signal);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("aborted request resolves null and caches nothing", async () => {
    const ac = new AbortController();
    const host = fakeHost({ getYandexLyrics: () => new Promise((res) => setTimeout(() => res(lrc), 20)) });
    const r = createLyricsResolver(host);
    const p = r.get(track, ac.signal);
    ac.abort();
    expect(await p).toBeNull();
  });

  it("UGC track resolves null without throwing", async () => {
    const r = createLyricsResolver(fakeHost({ fetch: fakeFetch({ "https://lrclib.net/": () => new Response("{}", { status: 404 }) }) }));
    expect(await r.get({ ...track, id: "u-u-i-d", isUgc: true, artists: [] }, new AbortController().signal)).toBeNull();
  });
});

// A better source that failed for a moment must not decide the answer for days.
describe("resolver after transient failures", () => {
  afterEach(() => vi.useRealTimers());
  const signal = () => new AbortController().signal;

  it("keeps a fallback found during an LRCLIB outage out of the stored cache and retries within minutes", async () => {
    vi.useFakeTimers();
    let lrclibUp = false;
    const lrclibCalls = vi.fn();
    const getYandexLyrics = vi.fn(async (_id: string, format: "LRC" | "TEXT") => (format === "LRC" ? lrc : null));
    const host = fakeHost({
      getYandexLyrics,
      fetch: fakeFetch({
        "https://lrclib.net/": () => {
          lrclibCalls();
          return lrclibUp ? new Response("{}", { status: 404 }) : new Response("busy", { status: 503 });
        },
      }),
    });
    const r = createLyricsResolver(host);
    expect((await r.get(track, signal()))!.source).toBe("yandex");
    expect(await host.storage.get("lyrics:42")).toBeUndefined();
    const callsDuringOutage = lrclibCalls.mock.calls.length;
    lrclibUp = true;
    await vi.advanceTimersByTimeAsync(61_000);
    expect((await r.get(track, signal()))!.source).toBe("yandex");
    expect(lrclibCalls.mock.calls.length).toBeGreaterThan(callsDuringOutage);
    expect(await host.storage.get("lyrics:42")).toBeDefined();
  });

  it("does not remember a miss caused by an outage for ten minutes", async () => {
    vi.useFakeTimers();
    const lrclibCalls = vi.fn();
    const host = fakeHost({
      fetch: fakeFetch({
        "https://lrclib.net/": () => {
          lrclibCalls();
          return new Response("busy", { status: 503 });
        },
      }),
    });
    const r = createLyricsResolver(host);
    expect(await r.get(track, signal())).toBeNull();
    const first = lrclibCalls.mock.calls.length;
    await vi.advanceTimersByTimeAsync(61_000);
    expect(await r.get(track, signal())).toBeNull();
    expect(lrclibCalls.mock.calls.length).toBeGreaterThan(first);
  });

  it("keeps a fallback out of the stored cache when the Spicy API has a server error", async () => {
    const host = fakeHost({
      getSettings: () => ({ ...DEFAULT_SETTINGS, spicyApiKey: "sl_sk_ok", useLrclib: false }),
      getYandexLyrics: async () => lrc,
      fetch: fakeFetch({
        "https://labs.api.listenbrainz.org/": () => Response.json([{ spotify_track_ids: ["x".repeat(22)] }]),
        "https://api.spicylyrics.org/": () => new Response("oops", { status: 502 }),
      }),
    });
    expect((await createLyricsResolver(host).get(track, signal()))!.source).toBe("yandex");
    expect(await host.storage.get("lyrics:42")).toBeUndefined();
  });

  it("moves on to Yandex Music when an external source hangs", async () => {
    vi.useFakeTimers();
    const host = fakeHost({
      getYandexLyrics: async (_id: string, format: "LRC" | "TEXT") => (format === "LRC" ? lrc : null),
      fetch: fakeFetch({ "https://lrclib.net/": () => new Promise<Response>(() => {}) }),
    });
    const pending = createLyricsResolver(host).get(track, signal());
    await vi.advanceTimersByTimeAsync(6_000);
    expect((await pending)!.source).toBe("yandex");
    expect(await host.storage.get("lyrics:42")).toBeUndefined();
  });
});
