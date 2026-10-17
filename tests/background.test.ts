/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";

vi.mock("@kawarp/core", () => ({
  default: class {
    loadImage = vi.fn(async () => {});
    loadBlob = vi.fn(async () => {});
    start() {}
    stop() {}
    renderFrame() {}
    setOptions() {}
    dispose = vi.fn();
  },
}));

import { Background } from "../src/ui/Background";

describe("Background", () => {
  it("does not leak layers on style switches", async () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    const bg = new Background(el);
    bg.setStyle("dynamic");
    await bg.setCover("https://avatars.yandex.net/x/1000x1000");
    bg.setStyle("cover");
    await bg.setCover("https://avatars.yandex.net/x/1000x1000");
    bg.setStyle("none");
    vi.advanceTimersByTime(2000);
    expect(el.querySelectorAll(".spicy-dynamic-bg")).toHaveLength(0);
    bg.destroy();
    vi.useRealTimers();
  });
});
