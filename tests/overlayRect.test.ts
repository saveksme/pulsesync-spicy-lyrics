import { describe, expect, it } from "vitest";
import { computeCinemaRect, computeOverlayRect } from "../src/ui/overlayRect";

describe("overlay rect", () => {
  it("covers content element or whole viewport", () => {
    const el = { getBoundingClientRect: () => ({ top: 0, left: 240, width: 1000, height: 640 }) as DOMRect };
    expect(computeOverlayRect(el, { width: 1240, height: 720 })).toEqual({ top: 0, left: 240, width: 1000, height: 640 });
    expect(computeOverlayRect(null, { width: 1240, height: 720 })).toEqual({ top: 0, left: 0, width: 1240, height: 720 });
  });

  // Yandex Music draws its own title bar (window buttons, drag area) inside the page.
  it("starts the cinema view below Yandex Music's title bar", () => {
    const bar = (bottom: number) => ({ getBoundingClientRect: () => ({ top: 0, bottom, left: 0, width: 1280, height: bottom }) as DOMRect });
    expect(computeCinemaRect(bar(32), { width: 1280, height: 800 })).toEqual({ top: 32, left: 0, width: 1280, height: 768 });
    expect(computeCinemaRect(null, { width: 1280, height: 800 })).toEqual({ top: 0, left: 0, width: 1280, height: 800 });
    expect(computeCinemaRect(bar(600), { width: 1280, height: 800 })).toEqual({ top: 0, left: 0, width: 1280, height: 800 });
  });
});
