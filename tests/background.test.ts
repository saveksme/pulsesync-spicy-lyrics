/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";

vi.mock("@kawarp/core", () => {
  const instances: any[] = [];
  return {
    __instances: instances,
    default: class {
      constructor() {
        instances.push(this);
      }
      loadImage = vi.fn(async () => {});
      loadBlob = vi.fn(async () => {});
      start() {}
      stop() {}
      renderFrame() {}
      setOptions() {}
      dispose = vi.fn();
    },
  };
});

import { Background } from "../src/ui/Background";
import { __instances } from "@kawarp/core";

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

  it("disposes retired Kawarp instances on destroy", async () => {
    vi.useFakeTimers();
    __instances.length = 0;
    const el = document.createElement("div");
    const bg = new Background(el);
    bg.setStyle("dynamic");
    await bg.setCover("https://avatars.yandex.net/x/1000x1000");
    bg.setStyle("none");
    // The retired instance is still waiting for its fade-out timer.
    bg.destroy();
    expect(__instances.length).toBeGreaterThan(0);
    for (const instance of __instances) expect(instance.dispose).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
