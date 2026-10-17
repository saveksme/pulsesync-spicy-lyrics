/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { buildLyrics } from "../src/render/build";
import { buildCredits } from "../src/render/credits";

const syl = (Text: string, s: number, e: number, IsPartOfWord = false) => ({ Text, StartTime: s, EndTime: e, IsPartOfWord });
const data: any = {
  Type: "Syllable",
  source: "spicy_lyrics",
  StartTime: 4,
  SongWriters: ["A", "B"],
  UploadAttribution: {
    Uploader: { id: "1", username: "up", url: "https://spicylyrics.org/uid/1" },
    Maker: { id: "2", username: "mk", url: "https://spicylyrics.org/uid/2" },
  },
  Content: [
    {
      Type: "Vocal",
      OppositeAligned: false,
      Lead: { StartTime: 4, EndTime: 6, Syllables: [syl("Hel", 4, 4.5, true), syl("lo", 4.5, 5), syl("woooorld", 5, 6.2)] },
      Background: [{ StartTime: 5, EndTime: 5.9, Syllables: [syl("yeah", 5, 5.9)] }],
    },
    { Type: "Vocal", OppositeAligned: true, Lead: { StartTime: 9.2, EndTime: 10, Syllables: [syl("Bye", 9.2, 10)] } },
  ],
};

describe("buildLyrics", () => {
  it("builds syllable DOM with intro dots, word groups, letters, bg and interlude", () => {
    const r = buildLyrics(data, { simple: false });
    expect(r.root.getAttribute("data-lyrics-type")).toBe("Syllable");
    const kinds = r.lines.map((l) => (l.DotLine ? "dots" : l.BGLine ? "bg" : "line"));
    expect(kinds).toEqual(["dots", "line", "bg", "dots", "line"]);
    expect(r.root.querySelector(".word-group")!.children).toHaveLength(2);
    expect(r.root.querySelectorAll(".letterGroup .letter.Emphasis")).toHaveLength(8);
    expect(r.lines[4].HTMLElement.classList.contains("OppositeAligned")).toBe(true);
    const dots = r.lines[3].Syllables!.Lead;
    expect(dots.map((d) => [d.StartTime, d.EndTime].map(Math.round))).toEqual([
      [6000, 6883],
      [6883, 7767],
      [7767, 8650],
    ]);
  });

  it("no intro dots when first line starts before 3s; Line and Static types", () => {
    const line = buildLyrics(
      { Type: "Line", source: "yandex", StartTime: 1, Content: [{ Type: "Vocal", OppositeAligned: false, Text: "a", StartTime: 1, EndTime: 2 }] } as any,
      { simple: false },
    );
    expect(line.lines).toHaveLength(1);
    expect(
      buildLyrics({ Type: "Static", source: "yandex", Lines: [{ Text: "x" }, { Text: " " }] } as any, { simple: false }).root.querySelectorAll(
        ".line.static",
      ),
    ).toHaveLength(1);
  });

  it("credits: provider always, uploader/maker only for spicy_lyrics", () => {
    const text = buildCredits(data)
      .map((e) => e.textContent)
      .join("|");
    expect(text).toContain("A, B");
    expect(text).toContain("Spicy Lyrics");
    expect(text).toContain("up");
    expect(text).toContain("mk");
    const apple = buildCredits({ ...data, source: "apple_music", UploadAttribution: undefined })
      .map((e) => e.textContent)
      .join("|");
    expect(apple).toContain("Apple Music");
    expect(apple).not.toContain("up");
  });
});
