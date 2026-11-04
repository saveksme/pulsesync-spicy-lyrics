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

describe("hover animations", () => {
  it("animates the view-control dimming instead of snapping it", () => {
    const css = readFileSync(new URL("../src/styles/ym.css", import.meta.url), "utf8");
    const rule = css.match(/\.ViewControl\s*\{[^}]*transition:\s*([^}]+);/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain("opacity");
  });

  it("reserves the timeline hover height so time labels do not jump", () => {
    const css = readFileSync(new URL("../src/styles/ym.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.Header > \.Timeline\s*\{\s*min-height:\s*2\.3cqh;/);
  });
});
