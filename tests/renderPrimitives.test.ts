import { describe, expect, it } from "vitest";
import { Spring } from "../src/render/Spring";
import { getSpline } from "../src/render/Spline";
import { isLetterCapable, isRtl, minLetterCapableDuration, splitLetters, stripZeroWidth } from "../src/render/text";

const ZWSP = String.fromCharCode(0x200b);

describe("render primitives", () => {
  it("spring settles on goal", () => {
    const s = new Spring(0, 0.88, 0.64);
    s.SetGoal(1);
    for (let i = 0; i < 600; i++) s.Step(1 / 60);
    expect(s.Step(1 / 60)).toBeCloseTo(1, 4);
    expect(s.CanSleep()).toBe(true);
  });

  it("spline passes through points", () => {
    const sp = getSpline([
      { Time: 0, Value: 0.95 },
      { Time: 0.7, Value: 1.0505 },
      { Time: 1, Value: 1 },
    ]);
    expect(sp.at(0)).toBeCloseTo(0.95);
    expect(sp.at(0.7)).toBeCloseTo(1.0505);
    expect(sp.at(1)).toBeCloseTo(1);
  });

  it("text utils", () => {
    expect(splitLetters("Привет")).toHaveLength(6);
    expect(splitLetters("👍🏽a")).toEqual(["👍🏽", "a"]);
    expect(stripZeroWidth(`a${ZWSP}b`)).toBe("ab");
    expect(isRtl("שלום")).toBe(true);
    expect(isRtl("Hello")).toBe(false);
    expect(isLetterCapable(5, 1000, false)).toBe(true);
    expect(isLetterCapable(5, 999, false)).toBe(false);
    expect(isLetterCapable(13, 2000, true)).toBe(false);
    expect(minLetterCapableDuration(true)).toBe(1050);
  });
});
