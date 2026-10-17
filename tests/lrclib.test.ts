import { describe, expect, it } from "vitest";
import { fetchLrclib, lrclibToLyrics, pickLrclibCandidate } from "../src/sources/lrclib";
import { fakeFetch } from "./helpers/fakeHost";

const t = { id: "1", title: "Song", artists: ["Art"], album: "Alb", durationMs: 200400, isUgc: false } as any;
const rec = (o: any) => ({ id: 1, trackName: "Song", artistName: "Art", duration: 200, instrumental: false, ...o });

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
      rec({ duration: 207, hasWordSync: true, lyricsfile: "version: '1.0'\nlines: []" }),
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
