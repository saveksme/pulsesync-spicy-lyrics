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

  // A line taller than the viewport centres fine, but leaves the next line below the fold.
  // The follow must not die there: only a scroll by hand may park it.
  describe("out-of-view active line", () => {
    function setup() {
      const clock = { t: 0 };
      const scrollEl = document.createElement("div");
      Object.defineProperty(scrollEl, "clientHeight", { value: 600 });
      const tall = L(0, 1000);
      Object.defineProperty(tall.HTMLElement, "offsetTop", { value: 0 });
      Object.defineProperty(tall.HTMLElement, "clientHeight", { value: 800 });
      const next = L(1000, 2000);
      Object.defineProperty(next.HTMLElement, "offsetTop", { value: 820 });
      Object.defineProperty(next.HTMLElement, "clientHeight", { value: 100 });
      const scroller = new Scroller(scrollEl, document.createElement("div"), () => clock.t);
      const frame = (pos: number) => scroller.frame({ type: "Syllable", lines: [tall, next] } as any, pos, true);
      return { clock, scrollEl, scroller, frame };
    }

    it("keeps chasing when the user has not scrolled", () => {
      const { clock, scrollEl, scroller, frame } = setup();
      frame(500); // centres the tall line: 0 - (300 - 400) + 30
      expect(scrollEl.scrollTop).toBe(130);
      // 820 is below the fold (viewport is 130..730); the follow must scroll anyway.
      clock.t = 1000; // past the user-scroll cooldown
      frame(1500);
      expect(scrollEl.scrollTop).toBe(820 - (300 - 50) + 30);
      scroller.destroy();
    });

    it("stays parked after a scroll by hand", () => {
      const { clock, scrollEl, scroller, frame } = setup();
      frame(500);
      scrollEl.dispatchEvent(new WheelEvent("wheel"));
      scrollEl.scrollTop = 0;
      clock.t = 1000; // past the 750ms cooldown
      frame(1500);
      expect(scrollEl.scrollTop).toBe(0);
      scroller.destroy();
    });
  });

  // A line taller than the visible band can never be followed by centring it:
  // the sung words leave the screen. The follow keeps the active word in the middle band.
  describe("a line taller than the viewport", () => {
    const W = (s: number, e: number, top: number, h: number) => {
      const el = document.createElement("span");
      Object.defineProperty(el, "offsetTop", { value: top });
      Object.defineProperty(el, "clientHeight", { value: h });
      return { HTMLElement: el, StartTime: s, EndTime: e, TotalTime: e - s } as any;
    };
    function setup() {
      const clock = { t: 0 };
      const scrollEl = document.createElement("div");
      Object.defineProperty(scrollEl, "clientHeight", { value: 600 });
      const line = L(0, 9000);
      Object.defineProperty(line.HTMLElement, "offsetTop", { value: 500 });
      Object.defineProperty(line.HTMLElement, "clientHeight", { value: 1200 });
      line.Syllables = { Lead: [W(0, 4000, 0, 200), W(4000, 9000, 1000, 200)] };
      const scroller = new Scroller(scrollEl, document.createElement("div"), () => clock.t);
      const frame = (pos: number) => scroller.frame({ type: "Syllable", lines: [line] } as any, pos, true);
      return { clock, scrollEl, scroller, frame };
    }

    it("follows the active word instead of centring the line", () => {
      const { clock, scrollEl, scroller, frame } = setup();
      // First word spans 500..700; the band is 20% off each edge of the 600px view.
      frame(100);
      expect(scrollEl.scrollTop).toBe(700 + 120 - 600);
      // The same word stays active: while it is inside the band the view does not move.
      clock.t = 800; // past the user-scroll cooldown
      for (const pos of [1000, 1900, 2800, 3700]) frame(pos);
      expect(scrollEl.scrollTop).toBe(700 + 120 - 600);
      // Second word spans 1500..1700 — still the same line, the follow keeps it on screen.
      frame(4600);
      expect(scrollEl.scrollTop).toBe(1700 + 120 - 600);
      scroller.destroy();
    });
  });
});
