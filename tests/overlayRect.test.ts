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

  it("stops above the player bar where the content runs under it", () => {
    const content = box(25, 200, 1052, 765);
    const playerBar = box(712, 200, 1045, 78);
    expect(computeOverlayRect(content, { width: 1265, height: 800 }, { playerBar, gap: 12 })).toEqual({ top: 25, left: 200, width: 1052, height: 675 });
  });

  // Measured in Yandex Music (1280×800): on My Wave the content area reaches 12 px up under the
  // title bar (0–32) and down to the player bar (708), where other pages leave Yandex Music's gap.
  it("keeps My Wave's view in the same place as on other pages", () => {
    const titleBar = box(0, 0, 1280, 32);
    const playerBar = box(708, 224, 1044, 80);
    const myWave = box(20, 224, 1044, 688);
    expect(computeOverlayRect(myWave, { width: 1280, height: 800 }, { titleBar, playerBar, gap: 12 })).toEqual({ top: 32, left: 224, width: 1044, height: 664 });
    const otherPage = box(32, 224, 1044, 664);
    expect(computeOverlayRect(otherPage, { width: 1280, height: 800 }, { titleBar, playerBar, gap: 12 })).toEqual({ top: 32, left: 224, width: 1044, height: 664 });
  });

  // Yandex Music draws its own title bar (window buttons, drag area) inside the page.
  it("starts the cinema view below Yandex Music's title bar", () => {
    const bar = (bottom: number) => ({ getBoundingClientRect: () => ({ top: 0, bottom, left: 0, width: 1280, height: bottom }) as DOMRect });
    expect(computeCinemaRect(bar(32), { width: 1280, height: 800 })).toEqual({ top: 32, left: 0, width: 1280, height: 768 });
    expect(computeCinemaRect(null, { width: 1280, height: 800 })).toEqual({ top: 0, left: 0, width: 1280, height: 800 });
    expect(computeCinemaRect(bar(600), { width: 1280, height: 800 })).toEqual({ top: 0, left: 0, width: 1280, height: 800 });
  });
});
