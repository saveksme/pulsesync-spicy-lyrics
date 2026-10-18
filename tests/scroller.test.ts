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

  // A view change eases the lyrics column's padding for 0.4 s and the lines rewrap all along:
  // centring the active line on the first frame only leaves it wherever the reflow puts it.
  describe("while the layout settles", () => {
    function setup() {
      const clock = { t: 0 };
      const scrollEl = document.createElement("div");
      Object.defineProperty(scrollEl, "clientHeight", { value: 600 });
      const line = L(0, 10_000);
      const layout = { top: 2000 };
      Object.defineProperty(line.HTMLElement, "offsetTop", { get: () => layout.top });
      Object.defineProperty(line.HTMLElement, "clientHeight", { value: 100 });
      const scroller = new Scroller(scrollEl, document.createElement("div"), () => clock.t);
      const frame = (t: number) => {
        clock.t = t;
        scroller.frame({ type: "Syllable", lines: [line] } as any, 5000, true);
      };
      // Centred: half the viewport minus half the line, 30 px above the middle.
      const centred = () => layout.top - (300 - 50) + 30;
      return { scrollEl, scroller, layout, frame, centred };
    }

    it("keeps the active line centred until it has settled", () => {
      const { scrollEl, scroller, layout, frame, centred } = setup();
      frame(0);
      scroller.holdCentre(500);
      frame(16);
      layout.top = 1200;
      frame(300);
      expect(scrollEl.scrollTop).toBe(centred());
      layout.top = 1100;
      frame(700);
      expect(scrollEl.scrollTop).toBe(1200 - 220);
      scroller.destroy();
    });

    it("lets a scroll by hand end it", () => {
      const { scrollEl, scroller, layout, frame } = setup();
      frame(0);
      scroller.holdCentre(500);
      frame(16);
      scrollEl.dispatchEvent(new WheelEvent("wheel"));
      scrollEl.scrollTop = 0;
      layout.top = 1200;
      frame(100);
      expect(scrollEl.scrollTop).toBe(0);
      scroller.destroy();
    });
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
