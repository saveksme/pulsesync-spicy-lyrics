import { describe, expect, it } from "vitest";
import { parseLrc } from "../src/sources/lrc";

describe("parseLrc", () => {
  it("parses timed lines; end = next stamp; empty lines are gap markers", () => {
    const l = parseLrc("[ar:x]\n[00:01.50]Hello\n[00:04.00]World\n[00:10.00]\n[00:20.25]Again", { source: "yandex", durationSec: 30 })!;
    expect(l.Type).toBe("Line");
    expect(l.StartTime).toBe(1.5);
    expect((l as any).Content.map((c: any) => [c.Text, c.StartTime, c.EndTime])).toEqual([
      ["Hello", 1.5, 4],
      ["World", 4, 10],
      ["Again", 20.25, 26.25],
    ]);
    expect(l.source).toBe("yandex");
  });

  it("last line ends at min(start + 6, duration)", () => {
    const l = parseLrc("[00:10.00]A", { source: "lrclib", durationSec: 12 })! as any;
    expect(l.Content[0].EndTime).toBe(12);
  });

  it("handles repeated stamps, [mm:ss:xx], offset and CRLF", () => {
    const l = parseLrc("[offset:+500]\r\n[00:02:00][00:08.00]Chorus\r\n[00:05.00]Verse", { source: "lrclib" })! as any;
    expect(l.Content.map((c: any) => [c.Text, c.StartTime])).toEqual([
      ["Chorus", 1.5],
      ["Verse", 4.5],
      ["Chorus", 7.5],
    ]);
  });

  it("enhanced LRC word stamps produce Syllable lyrics", () => {
    const s = parseLrc("[00:01.00]<00:01.00>Hel<00:01.40>lo <00:02.00>world<00:03.00>", { source: "lrclib" })!;
    expect(s.Type).toBe("Syllable");
    const syl = (s as any).Content[0].Lead.Syllables;
    expect(syl.map((x: any) => [x.Text, x.StartTime, x.EndTime, x.IsPartOfWord])).toEqual([
      ["Hel", 1, 1.4, true],
      ["lo", 1.4, 2, false],
      ["world", 2, 3, false],
    ]);
  });

  it("returns null without timed lines", () => {
    expect(parseLrc("just text", { source: "yandex" })).toBeNull();
  });
});
