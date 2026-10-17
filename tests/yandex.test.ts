import { describe, expect, it } from "vitest";
import { fetchYandexPlain, fetchYandexSynced, isYandexLyricsId } from "../src/sources/yandex";

const t = { id: "123", title: "T", artists: ["A"], durationMs: 60000, isUgc: false } as any;

describe("yandex", () => {
  it("validates ids", () => {
    expect(isYandexLyricsId("123")).toBe(true);
    expect(isYandexLyricsId("123:456")).toBe(true);
    expect(isYandexLyricsId("f1e2-uuid")).toBe(false);
  });

  it("parses native LRC and plain text", async () => {
    const host = {
      getYandexLyrics: async (_id: string, f: string) => (f === "LRC" ? "[00:01.00]a\n[00:02.00]b" : "a\n\nb\n"),
    };
    expect((await fetchYandexSynced(host as any, t))!.source).toBe("yandex");
    expect((await fetchYandexPlain(host as any, t))!.Lines.map((l) => l.Text)).toEqual(["a", "b"]);
  });

  it("skips UGC ids without calling host", async () => {
    const host = {
      getYandexLyrics: async () => {
        throw new Error("must not be called");
      },
    };
    expect(await fetchYandexSynced(host as any, { ...t, id: "uuid-x", isUgc: true })).toBeNull();
  });
});
