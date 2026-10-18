/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";

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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// Like Yandex Music's own lyrics view: over the whole window, cover on one side, lyrics on the other.
it("opens over the whole window with the cover beside the lyrics", () => {
  const page = newPage();
  page.open();
  expect(document.getElementById("SpicyLyricsHost")!.classList.contains("Mode_Cinema")).toBe(true);
  expect(document.getElementById("SpicyLyricsPage")!.classList.contains("NowBarStatus__Open")).toBe(true);
});

// Spicy Lyrics starts with the NowBar closed (uiState $isNowBarOpen = false) in its page view.
it("keeps the NowBar closed in the content-area view, like Spicy Lyrics", async () => {
  const page = newPage();
  await Promise.resolve();
  page.open("page");
  const classes = document.getElementById("SpicyLyricsPage")!.classList;
  expect(classes.contains("NowBarStatus__Closed")).toBe(true);
  page.open("cinema");
  expect(classes.contains("NowBarStatus__Open")).toBe(true);
});

// Yandex Music's fullscreen player leaves with a 0.3 s fade and slide down.
describe("closing", () => {
  it("slides away before it goes", () => {
    vi.useFakeTimers();
    const page = newPage();
    page.open();
    vi.advanceTimersByTime(50);
    const host = document.getElementById("SpicyLyricsHost")!;
    expect(host.classList.contains("Visible")).toBe(true);
    page.close();
    expect(page.isOpen).toBe(false);
    expect(host.classList.contains("Visible")).toBe(false);
    expect(host.isConnected).toBe(true);
    vi.advanceTimersByTime(300);
    expect(host.isConnected).toBe(false);
  });

  it("stays when opened again while sliding away", () => {
    vi.useFakeTimers();
    const page = newPage();
    page.open();
    vi.advanceTimersByTime(50);
    page.close();
    page.open();
    vi.advanceTimersByTime(400);
    const host = document.getElementById("SpicyLyricsHost")!;
    expect(host.isConnected).toBe(true);
    expect(host.classList.contains("Visible")).toBe(true);
    expect(page.isOpen).toBe(true);
  });
});

// Yandex Music's lyrics view: the cover moves from the centre to its side and the lyrics fade in
// from the cover's place, 0.8 s ease-in-out, each overshooting by 1% of the width.
describe("entrance", () => {
  const rects: Record<string, { left: number; width: number }> = {};
  function layout() {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const key = this.id === "SpicyLyricsPage" ? "page" : this.classList.contains("NowBar") ? "nowBar" : "";
      const { left, width } = rects[key] ?? { left: 0, width: 0 };
      return { left, width, right: left + width, top: 0, bottom: 600, height: 600, x: left, y: 0, toJSON: () => ({}) } as DOMRect;
    });
  }
  function recordAnimations() {
    const calls: { element: HTMLElement; keyframes: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value(this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
        calls.push({ element: this, keyframes, options });
        return { cancel() {}, finished: Promise.resolve() };
      },
    });
    return calls;
  }
  afterEach(() => {
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });

  it("brings the cover in from the centre and the lyrics in from the cover", async () => {
    rects.page = { left: 0, width: 1000 };
    rects.nowBar = { left: 100, width: 300 };
    layout();
    const calls = recordAnimations();
    newPage().open();
    await nextFrame();
    const nowBar = calls.find((call) => call.element.classList.contains("NowBar"))!;
    const lyrics = calls.find((call) => call.element.classList.contains("LyricsContainer"))!;
    expect(nowBar.keyframes).toEqual([{ transform: "translateX(250px)" }, { transform: "translateX(-10px)", offset: 0.5 }, { transform: "none" }]);
    expect(nowBar.options).toMatchObject({ duration: 800, easing: "ease-in-out" });
    expect(lyrics.keyframes).toEqual([
      { opacity: 0, transform: "translateX(-400px)" },
      { transform: "translateX(10px)", offset: 0.5 },
      { opacity: 1, transform: "none" },
    ]);
  });

  it("mirrors it when the cover is on the right", async () => {
    rects.page = { left: 0, width: 1000 };
    rects.nowBar = { left: 600, width: 300 };
    layout();
    const calls = recordAnimations();
    const host = fakeHost();
    await host.storage.set("view", { nowBarOpen: false, nowBarSide: "right" });
    const page = newPage(host);
    await new Promise((resolve) => setTimeout(resolve, 0));
    page.open();
    await nextFrame();
    const nowBar = calls.find((call) => call.element.classList.contains("NowBar"))!;
    const lyrics = calls.find((call) => call.element.classList.contains("LyricsContainer"))!;
    expect(nowBar.keyframes[0]).toEqual({ transform: "translateX(-250px)" });
    expect(nowBar.keyframes[1]).toEqual({ transform: "translateX(10px)", offset: 0.5 });
    expect(lyrics.keyframes[0]).toEqual({ opacity: 0, transform: "translateX(400px)" });
  });

  it("keeps still when the system asks for less motion", async () => {
    rects.page = { left: 0, width: 1000 };
    rects.nowBar = { left: 100, width: 300 };
    layout();
    const calls = recordAnimations();
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    newPage().open();
    await nextFrame();
    expect(calls).toHaveLength(0);
  });
});

it("puts the view controls in the top corner, as in Yandex Music's player", () => {
  newPage().open();
  const controls = document.querySelector("#SpicyLyricsPage .ContentBox > .ViewControls")!;
  expect(controls).not.toBeNull();
  expect(controls.querySelector("#Close")).not.toBeNull();
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

// Spicy's hover background is fitted to the words of the line under the pointer (lineHover.ts).
it("fits a line's hover background to its words when the pointer comes in", () => {
  const rect = (left: number, width: number) =>
    ({ left, width, right: left + width, top: 0, bottom: 40, height: 40, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
  if (typeof Range.prototype.getClientRects !== "function") {
    Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, writable: true, value: () => [] });
  }
  vi.spyOn(Range.prototype, "getClientRects").mockReturnValue([rect(110, 300)] as unknown as DOMRectList);
  const page = newPage();
  page.open();
  page.setLyrics({ status: "ready", lyrics: parseLrc("[00:01.00]one\n[00:03.00]two", { source: "yandex" })! });
  const line = [...document.querySelectorAll<HTMLElement>("#SpicyLyricsPage .line")].find((el) => el.textContent === "two")!;
  line.getBoundingClientRect = () => rect(100, 600);
  Object.defineProperty(line, "offsetWidth", { configurable: true, value: 600 });
  line.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  expect(line.style.getPropertyValue("--HoverWidth")).toBe("300px");
  expect(line.style.getPropertyValue("--HoverLeft")).toBe("10px");
});
