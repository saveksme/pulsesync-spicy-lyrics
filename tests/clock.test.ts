import { describe, expect, it } from "vitest";
import { PlayerClock } from "../src/core/PlayerClock";

describe("PlayerClock", () => {
  it("interpolates while playing, freezes when paused", () => {
    let t = 1000;
    const c = new PlayerClock(() => t);
    c.update({ progressSec: 10, status: "playing" });
    t += 250;
    expect(c.getPositionMs()).toBe(10250);
    c.update({ progressSec: 10.25, status: "paused" });
    t += 5000;
    expect(c.getPositionMs()).toBe(10250);
  });

  it("does not step back by small corrections, detects seeks, applies offset", () => {
    let t = 0;
    const c = new PlayerClock(() => t);
    c.update({ progressSec: 5, status: "playing" });
    t = 300;
    expect(c.getPositionMs()).toBe(5300);
    expect(c.update({ progressSec: 5.25, status: "playing" }).seeked).toBe(false);
    expect(c.getPositionMs()).toBe(5300);
    expect(c.update({ progressSec: 60, status: "playing" }).seeked).toBe(true);
    expect(c.getPositionMs()).toBe(60000);
    expect(c.update({ progressSec: 2, status: "playing" }).seeked).toBe(true);
    expect(c.getPositionMs()).toBe(2000);
    c.offsetMs = 200;
    expect(c.getPositionMs()).toBe(2200);
  });

  // Snapshots also fire on volume, like, shuffle or repeat changes and then carry the last
  // timeupdate's progress, which is already up to ~250 ms old.
  it("keeps running through snapshots that repeat the last progress sample", () => {
    let t = 0;
    const c = new PlayerClock(() => t);
    c.update({ progressSec: 5, status: "playing" });
    t = 200;
    expect(c.getPositionMs()).toBe(5200);
    expect(c.update({ progressSec: 5, status: "playing" }).seeked).toBe(false);
    expect(c.getPositionMs()).toBe(5200);
    t = 250;
    expect(c.getPositionMs()).toBe(5250);
    c.update({ progressSec: 5.25, status: "paused" });
    t = 900;
    c.update({ progressSec: 5.25, status: "playing" });
    t = 1000;
    expect(c.getPositionMs()).toBe(5350);
  });
});
