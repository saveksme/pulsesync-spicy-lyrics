/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from "vitest";
import { PlayerClock } from "../src/core/PlayerClock";
import type { TrackInfo } from "../src/core/track";
import { NowBar } from "../src/ui/NowBar";
import { fakeHost } from "./helpers/fakeHost";

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

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

const song: TrackInfo = {
  id: "1",
  title: "Song",
  artists: ["Макс Корж", "Various artists"],
  artistIds: ["975699", null],
  durationMs: 1000,
  isUgc: false,
};

function showTrack(openArtist?: (artistId: string) => void) {
  vi.useFakeTimers();
  const root = document.createElement("div");
  document.body.appendChild(root);
  const nowBar = new NowBar(root, { host: fakeHost(), clock: new PlayerClock(), openArtist });
  nowBar.setTrack(song);
  vi.advanceTimersByTime(500);
  return { artists: root.querySelector<HTMLElement>(".Artists")!, nowBar };
}

// Like the player bar's links: an artist opens its page in Yandex Music.
it("lets each artist with a page open it, by click or keyboard", () => {
  const openArtist = vi.fn();
  const { artists, nowBar } = showTrack(openArtist);
  expect(artists.textContent).toBe("Макс Корж, Various artists");
  const links = [...artists.querySelectorAll<HTMLElement>(".Clickable")];
  expect(links.map((link) => link.textContent)).toEqual(["Макс Корж"]);
  links[0].click();
  expect(openArtist).toHaveBeenLastCalledWith("975699");
  links[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(openArtist).toHaveBeenCalledTimes(2);
  nowBar.destroy();
});

it("shows the artists as plain text when nothing opens them", () => {
  const { artists, nowBar } = showTrack();
  expect(artists.textContent).toBe("Макс Корж, Various artists");
  expect(artists.querySelector(".Clickable")).toBeNull();
  nowBar.destroy();
});
