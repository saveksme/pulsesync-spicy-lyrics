import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLrclib, lrclibToLyrics, pickLrclibCandidate } from "../src/sources/lrclib";
import { fakeFetch } from "./helpers/fakeHost";

const t = { id: "1", title: "Song", artists: ["Art"], album: "Alb", durationMs: 200400, isUgc: false } as any;
const rec = (o: any) => ({ id: 1, trackName: "Song", artistName: "Art", duration: 200, instrumental: false, ...o });
// LRCLIB now sends a lyricsfile with every record, also when it has no timed lines.
const plainOnly = (o: any = {}) => rec({ plainLyrics: "a\nb", syncedLyrics: null, lyricsfile: "version: '1.0'\nlines: []\nplain: a", ...o });
// What LRCLIB answers when it is overloaded.
const busy = (retryAfter = "1") =>
  new Response('{"message":"The server is busy, please retry in a moment","name":"ServerOverloaded","statusCode":503}', {
    status: 503,
    headers: { "Retry-After": retryAfter },
  });

describe("lrclib when busy", () => {
  afterEach(() => vi.useRealTimers());

  it("asks again while LRCLIB is busy, waiting as long as it says", async () => {
    vi.useFakeTimers();
    const answers = [busy("2"), busy(), Response.json(rec({ syncedLyrics: "[00:01.00]x" }))];
    const at: number[] = [];
    const host = {
      fetch: fakeFetch({
        "https://lrclib.net/api/get": () => {
          at.push(Date.now());
          return answers.shift()!;
        },
      }),
    };
    const pending = fetchLrclib(host as any, t);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending)!.syncedLyrics).toBe("[00:01.00]x");
    expect(at).toHaveLength(3);
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(2000);
  });

  it("gives up after a few attempts", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const host = {
      fetch: fakeFetch({
        "https://lrclib.net/api/get": () => {
          calls++;
          return busy();
        },
      }),
    };
    const pending = fetchLrclib(host as any, t);
    const failed = expect(pending).rejects.toThrow("LRCLIB HTTP 503");
    await vi.advanceTimersByTimeAsync(60_000);
    await failed;
    expect(calls).toBeGreaterThan(1);
    expect(calls).toBeLessThanOrEqual(6);
  });

  it("does not wait for a busy LRCLIB when told not to", async () => {
    let calls = 0;
    const host = {
      fetch: fakeFetch({
        "https://lrclib.net/api/get": () => {
          calls++;
          return busy();
        },
      }),
    };
    await expect(fetchLrclib(host as any, t, undefined, { shouldRetry: async () => false })).rejects.toThrow("LRCLIB HTTP 503");
    expect(calls).toBe(1);
  });
});

describe("lrclib synced lyrics", () => {
  it("looks further when the exact match has only plain text", async () => {
    const host = {
      fetch: fakeFetch({
        "https://lrclib.net/api/get": () => Response.json(plainOnly()),
        "https://lrclib.net/api/search": () => Response.json([plainOnly(), rec({ id: 2, duration: 201, syncedLyrics: "[00:01.00]y" })]),
      }),
    };
    expect((await fetchLrclib(host as any, t))!.id).toBe(2);
  });

  it("keeps the exact plain match when nothing better turns up", async () => {
    const host = {
      fetch: fakeFetch({
        "https://lrclib.net/api/get": () => Response.json(plainOnly({ id: 7 })),
        "https://lrclib.net/api/search": () => Response.json([]),
      }),
    };
    expect((await fetchLrclib(host as any, t))!.id).toBe(7);
  });

  it("does not count a lyricsfile without timed lines as synced", () => {
    const pick = pickLrclibCandidate(t, [plainOnly({ id: 1 }), rec({ id: 2, duration: 201.5, syncedLyrics: "[00:01.00]y" })]);
    expect(pick!.id).toBe(2);
  });
});

describe("lrclib", () => {
  it("get with duration, falls back to search on 404", async () => {
    const urls: string[] = [];
    const host = {
      fetch: fakeFetch({
        "https://lrclib.net/api/get": (u) => {
          urls.push(u.search);
          return new Response("{}", { status: 404 });
        },
        "https://lrclib.net/api/search": () =>
          Response.json([rec({ duration: 260, syncedLyrics: "[00:01.00]x" }), rec({ syncedLyrics: "[00:01.00]y" })]),
      }),
    };
    const r = await fetchLrclib(host as any, t);
    expect(urls[0]).toContain("duration=200");
    expect(r!.syncedLyrics).toBe("[00:01.00]y");
  });

  it("prefers word sync within 10s, rejects instrumental", () => {
    const pick = pickLrclibCandidate(t, [
      rec({ instrumental: true, syncedLyrics: "x" }),
      rec({ syncedLyrics: "s" }),
      rec({
        duration: 207,
        hasWordSync: true,
        lyricsfile: "version: '1.0'\nlines:\n- text: Hi you\n  start_ms: 1000\n  words:\n  - text: 'Hi '\n    start_ms: 1000\n  - text: you\n    start_ms: 1500\n",
      }),
    ]);
    expect(pick!.hasWordSync).toBe(true);
  });

  it("converts record to lyrics", () => {
    const out = lrclibToLyrics(rec({ syncedLyrics: "[00:01.00]a\n[00:02.00]b", plainLyrics: "a\nb" }), 200);
    expect(out.word).toBeNull();
    expect(out.synced!.Type).toBe("Line");
    expect(out.plain!.Lines).toHaveLength(2);
  });
});
