import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Native Yandex Music layers: header 200, player 300, popover 400 (queue, menus),
// modal 500 (fullscreen player), notification 600, loader 999. The lyrics overlay covers
// the content and player bar, but native popovers must stay usable above it.
describe("Yandex Music layering", () => {
  it("keeps the lyrics overlay below native popovers", () => {
    const css = readFileSync(new URL("../src/styles/ym.css", import.meta.url), "utf8");
    const rule = css.match(/#SpicyLyricsHost\s*\{[^}]*z-index:\s*(\d+)/);
    expect(rule).not.toBeNull();
    const zIndex = Number(rule![1]);
    expect(zIndex).toBeGreaterThan(300);
    expect(zIndex).toBeLessThan(400);
  });
});
