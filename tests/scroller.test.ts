/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { getScrollLineIndex, Scroller } from "../src/render/Scroller";

const L = (s: number, e: number, bg = false) =>
  ({ HTMLElement: document.createElement("div"), StartTime: s, EndTime: e, TotalTime: e - s, BGLine: bg }) as any;

describe("scroller", () => {
  it("anchors to the top active lead line, ignores trailing bg lines", () => {
    const lines = [L(0, 1000), L(1000, 2000), L(1500, 3500, true), L(2000, 3000), L(3000, 4000)];
    expect(getScrollLineIndex(lines, 1200)).toBe(1);
    expect(getScrollLineIndex(lines, 2500)).toBe(3);
    expect(getScrollLineIndex(lines, 9999)).toBeNull();
  });

  it("wheel pauses auto-scroll and hides blur for 750ms", () => {
    let t = 0;
    const scrollEl = document.createElement("div");
    const content = document.createElement("div");
    const s = new Scroller(scrollEl, content, () => t);
    scrollEl.dispatchEvent(new WheelEvent("wheel"));
    expect(content.classList.contains("HideLineBlur")).toBe(true);
    s.destroy();
  });
});
