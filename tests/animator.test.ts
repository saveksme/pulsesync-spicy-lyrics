/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { Animator } from "../src/render/Animator";
import { buildLyrics } from "../src/render/build";

const mk = () =>
  buildLyrics(
    {
      Type: "Syllable",
      source: "yandex",
      StartTime: 0.5,
      Content: [
        {
          Type: "Vocal",
          OppositeAligned: false,
          Lead: {
            StartTime: 0.5,
            EndTime: 1.5,
            Syllables: [
              { Text: "one", StartTime: 0.5, EndTime: 1, IsPartOfWord: false },
              { Text: "two", StartTime: 1, EndTime: 1.5, IsPartOfWord: false },
            ],
          },
        },
        { Type: "Vocal", OppositeAligned: false, Lead: { StartTime: 1.5, EndTime: 2.5, Syllables: [{ Text: "three", StartTime: 1.5, EndTime: 2.5, IsPartOfWord: false }] } },
        { Type: "Vocal", OppositeAligned: false, Lead: { StartTime: 2.5, EndTime: 3.5, Syllables: [{ Text: "four", StartTime: 2.5, EndTime: 3.5, IsPartOfWord: false }] } },
      ],
    } as any,
    { simple: false },
  );

describe("Animator", () => {
  it("sets line states, gradient and blur", () => {
    const r = mk();
    document.body.append(r.root);
    let t = 0;
    const a = new Animator({ simple: false, now: () => t });
    t = 16;
    a.frame(r, 750);
    const [l1, l2, l3] = r.lines.map((l) => l.HTMLElement);
    expect(l1.classList.contains("Active")).toBe(true);
    expect(l2.classList.contains("NotSung")).toBe(true);
    const w1 = r.lines[0].Syllables!.Lead[0].HTMLElement;
    expect(parseFloat(w1.style.getPropertyValue("--gradient-position"))).toBeCloseTo(-20 + 120 * 0.5, 0);
    expect(l2.style.getPropertyValue("--BlurAmount")).toBe("1.25px");
    expect(l3.style.getPropertyValue("--BlurAmount")).toBe("2.5px");
  });

  it("seeking backwards returns words to NotSung", () => {
    const r = mk();
    document.body.append(r.root);
    let t = 0;
    const a = new Animator({ simple: false, now: () => t });
    t = 16;
    a.frame(r, 3000);
    t = 32;
    a.frame(r, 600);
    expect(r.lines[1].HTMLElement.classList.contains("NotSung")).toBe(true);
    expect(r.lines[0].HTMLElement.classList.contains("Active")).toBe(true);
  });
});
