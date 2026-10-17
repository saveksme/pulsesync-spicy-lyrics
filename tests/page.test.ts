/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from "vitest";

const kawarps = vi.hoisted(() => ({ created: 0 }));
vi.mock("@kawarp/core", () => ({
  default: class {
    constructor() {
      kawarps.created++;
    }
    loadImage = async () => {};
    start() {}
    renderFrame() {}
    setOptions() {}
    dispose() {}
  },
}));
import type { Host } from "../src/core/host";
import { PlayerClock } from "../src/core/PlayerClock";
import { DEFAULT_SETTINGS } from "../src/settings";
import { parseLrc } from "../src/sources/lrc";
import { LyricsPage } from "../src/ui/Page";
import { fakeHost } from "./helpers/fakeHost";

const pages: LyricsPage[] = [];
function newPage(host: Host = fakeHost()): LyricsPage {
  const page = new LyricsPage({ host, clock: new PlayerClock() });
  pages.push(page);
  return page;
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  for (const page of pages.splice(0)) page.destroy();
  setHidden(false);
  vi.restoreAllMocks();
});

it("opens empty, without a 'not found' notice, before anything plays", () => {
  const page = newPage();
  page.open();
  expect(document.querySelector("#SpicyLyricsPage .LyricsNotice")).toBeNull();
  page.setLyrics({ status: "none" });
  expect(document.querySelector("#SpicyLyricsPage .LyricsNotice")).not.toBeNull();
  page.setLyrics({ status: "idle" });
  expect(document.querySelector("#SpicyLyricsPage .LyricsNotice")).toBeNull();
});

it("pauses the frame loop while the window is hidden and resumes it once", () => {
  const page = newPage();
  page.open();
  const raf = vi.spyOn(window, "requestAnimationFrame");
  const cancel = vi.spyOn(window, "cancelAnimationFrame");
  setHidden(true);
  expect(cancel).toHaveBeenCalled();
  setHidden(true);
  expect(raf).not.toHaveBeenCalled();
  setHidden(false);
  expect(raf).toHaveBeenCalledTimes(1);
  setHidden(false);
  expect(raf).toHaveBeenCalledTimes(1);
  page.destroy();
  setHidden(true);
  setHidden(false);
  expect(raf).toHaveBeenCalledTimes(1);
});

it("never starts the WebGL background when another background style is chosen", () => {
  const page = newPage(fakeHost({ getSettings: () => ({ ...DEFAULT_SETTINGS, backgroundStyle: "cover" }) }));
  page.setTrack({ id: "1", title: "t", artists: [], durationMs: 1000, coverUrl: "https://avatars.yandex.net/x/1000x1000", isUgc: false });
  kawarps.created = 0;
  page.open();
  expect(kawarps.created).toBe(0);
});

it("keeps Yandex Music's title bar uncovered in cinema mode", () => {
  const bar = document.createElement("div");
  bar.className = "TitleBar_root__QjdOZ";
  bar.getBoundingClientRect = () => ({ top: 0, bottom: 32, left: 0, right: 1024, width: 1024, height: 32, x: 0, y: 0, toJSON: () => ({}) });
  document.body.appendChild(bar);
  const page = newPage();
  page.open("cinema");
  const host = document.getElementById("SpicyLyricsHost")!;
  expect(host.style.top).toBe("32px");
  expect(host.style.height).toBe(`${window.innerHeight - 32}px`);
  page.open("page");
  expect(host.style.top).toBe("0px");
  bar.remove();
});

it("logs instead of throwing when a page event handler fails", () => {
  const error = vi.fn();
  const page = newPage(
    fakeHost({
      seek: () => {
        throw new Error("rpc");
      },
      log: { info: () => {}, warn: () => {}, error },
    }),
  );
  page.open();
  page.setLyrics({ status: "ready", lyrics: parseLrc("[00:01.00]one\n[00:03.00]two", { source: "yandex" })! });
  const line = [...document.querySelectorAll<HTMLElement>("#SpicyLyricsPage .line")].find((el) => el.textContent === "two")!;
  line.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(error).toHaveBeenCalledTimes(1);
  vi.spyOn(LyricsPage.prototype, "close").mockImplementationOnce(() => {
    throw new Error("close");
  });
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(error).toHaveBeenCalledTimes(2);
});
