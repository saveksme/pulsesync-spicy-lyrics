/** @vitest-environment happy-dom */
import { expect, it, vi } from "vitest";
import { PlayerClock } from "../src/core/PlayerClock";
import { NowBar } from "../src/ui/NowBar";
import { fakeHost } from "./helpers/fakeHost";

// Volume changes reach the player throttled, so snapshots lag behind a drag.
it("keeps the dragged volume while the player still reports older levels", () => {
  const setVolume = vi.fn();
  const root = document.createElement("div");
  document.body.appendChild(root);
  const nowBar = new NowBar(root, { host: fakeHost({ setVolume }), clock: new PlayerClock() });
  nowBar.setControlsVisible(true);
  const volume = root.querySelector<HTMLElement>(".VolumeControl")!;
  volume.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientY: 0 }));
  expect(setVolume).toHaveBeenLastCalledWith(0);
  nowBar.setVolume(0.8);
  expect(volume.style.getPropertyValue("--VolumeLevel")).toBe("0.000");
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  nowBar.setVolume(0.8);
  expect(volume.style.getPropertyValue("--VolumeLevel")).toBe("0.800");
  nowBar.destroy();
  root.remove();
});
