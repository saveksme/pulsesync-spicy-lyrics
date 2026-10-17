import { describe, expect, it } from "vitest";
import { parseLyricsfile } from "../src/sources/lyricsfile";

const LINES = `version: '1.0'
metadata:
  title: Song
  duration_ms: 202000
lines:
- text: Yeah
  start_ms: 13420
  end_ms: 14810
- text: ''
  start_ms: 14810
  end_ms: 26950
- text: "I've been"
  start_ms: 26950
  end_ms: 28560
`;

const WORDS = `version: '1.0'
lines:
- text: Hello world
  start_ms: 1000
  end_ms: 3000
  words:
  - text: 'Hello '
    start_ms: 1000
    end_ms: 1800
  - text: world
    start_ms: 1800
    end_ms: 3000
`;

describe("parseLyricsfile", () => {
  it("parses line-synced lyricsfile, drops empty lines", () => {
    const l = parseLyricsfile(LINES, "lrclib")! as any;
    expect(l.Type).toBe("Line");
    expect(l.Content.map((c: any) => [c.Text, c.StartTime, c.EndTime])).toEqual([
      ["Yeah", 13.42, 14.81],
      ["I've been", 26.95, 28.56],
    ]);
  });

  it("parses word-synced lyricsfile to Syllable", () => {
    const s = parseLyricsfile(WORDS, "lrclib")! as any;
    expect(s.Type).toBe("Syllable");
    expect(s.Content[0].Lead.Syllables.map((x: any) => [x.Text, x.IsPartOfWord])).toEqual([
      ["Hello", false],
      ["world", false],
    ]);
    expect(s.Content[0].Lead.StartTime).toBe(1);
  });

  it("returns null for unsupported version or garbage", () => {
    expect(parseLyricsfile("version: '2.0'\nlines: []", "lrclib")).toBeNull();
    expect(parseLyricsfile("::::", "lrclib")).toBeNull();
  });
});
