import { describe, expect, it } from "vitest";
import { computeCinemaRect, computeOverlayRect } from "../src/ui/overlayRect";

const box = (top: number, left: number, width: number, height: number) => ({
  getBoundingClientRect: () => ({ top, left, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect,
});

describe("overlay rect", () => {
  it("covers content element or whole viewport", () => {
    const el = box(0, 240, 1000, 640);
    expect(computeOverlayRect(el, { width: 1240, height: 720 })).toEqual({ top: 0, left: 240, width: 1000, height: 640 });
    expect(computeOverlayRect(null, { width: 1240, height: 720 })).toEqual({ top: 0, left: 0, width: 1240, height: 720 });
  });

  // On My Wave the page runs under Yandex Music's floating player bar.
  it("stops above the player bar where the content runs under it", () => {
    const content = box(25, 200, 1052, 765);
    const playerBar = box(712, 200, 1045, 78);
    expect(computeOverlayRect(content, { width: 1265, height: 800 }, playerBar, 12)).toEqual({ top: 25, left: 200, width: 1052, height: 675 });
  });

  it("leaves the content area as it is where the player bar sits below it", () => {
    const content = box(25, 200, 1052, 663);
    const playerBar = box(700, 200, 1052, 80);
    expect(computeOverlayRect(content, { width: 1252, height: 790 }, playerBar, 12)).toEqual({ top: 25, left: 200, width: 1052, height: 663 });
  });

  // Yandex Music draws its own title bar (window buttons, drag area) inside the page.
  it("starts the cinema view below Yandex Music's title bar", () => {
    const bar = (bottom: number) => ({ getBoundingClientRect: () => ({ top: 0, bottom, left: 0, width: 1280, height: bottom }) as DOMRect });
    expect(computeCinemaRect(bar(32), { width: 1280, height: 800 })).toEqual({ top: 32, left: 0, width: 1280, height: 768 });
    expect(computeCinemaRect(null, { width: 1280, height: 800 })).toEqual({ top: 0, left: 0, width: 1280, height: 800 });
    expect(computeCinemaRect(bar(600), { width: 1280, height: 800 })).toEqual({ top: 0, left: 0, width: 1280, height: 800 });
  });
});
