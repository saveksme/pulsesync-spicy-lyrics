/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from "vitest";
import { installNativeLyricsHook, type NativeLyricsHook } from "../src/app/NativeLyricsHook";

const hooks: NativeLyricsHook[] = [];
const install = (onOpen: () => void, enabled: () => boolean) => {
  const hook = installNativeLyricsHook(document, onOpen, enabled);
  hooks.push(hook);
  return hook;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const OWNED = "SpicyLyricsOwnsLyricsButton";

afterEach(() => {
  for (const hook of hooks.splice(0)) hook.dispose();
  document.body.innerHTML = "";
});

it("intercepts the native lyrics button only when enabled", () => {
  document.body.innerHTML = `<button data-test-id="PLAYERBAR_DESKTOP_SYNC_LYRICS_BUTTON"><span>i</span></button>`;
  const native = vi.fn();
  document.body.addEventListener("click", native);
  let enabled = true;
  const onOpen = vi.fn();
  install(onOpen, () => enabled);
  document.querySelector("span")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(native).not.toHaveBeenCalled();
  enabled = false;
  document.querySelector("span")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(native).toHaveBeenCalledTimes(1);
  document.body.removeEventListener("click", native);
});

it("opens from the track menu's show-lyrics item but leaves its hide-lyrics item alone", () => {
  document.body.innerHTML = `
    <div data-test-id="TRACK_CONTEXT_MENU_SHOW_SYNC_LYRICS_BUTTON">show</div>
    <div data-test-id="TRACK_CONTEXT_MENU_HIDE_SYNC_LYRICS_BUTTON">hide</div>`;
  const onOpen = vi.fn();
  const hook = install(onOpen, () => true);
  const [show, hide] = document.querySelectorAll("div");
  hide.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(onOpen).not.toHaveBeenCalled();
  show.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(onOpen).toHaveBeenCalledTimes(1);
  hook.dispose();
  show.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(onOpen).toHaveBeenCalledTimes(1);
});

// Yandex Music greys its button out for tracks it has no lyrics for; Spicy Lyrics may have them.
it("keeps Yandex Music's lyrics button usable for tracks Yandex Music has no lyrics for", async () => {
  document.body.innerHTML = `<button disabled aria-hidden="true" data-test-id="PLAYERBAR_DESKTOP_SYNC_LYRICS_BUTTON"></button>`;
  const button = document.querySelector("button")!;
  const onOpen = vi.fn();
  install(onOpen, () => true);
  expect(button.disabled).toBe(false);
  expect(button.hasAttribute("aria-hidden")).toBe(false);
  button.disabled = true;
  await settle();
  expect(button.disabled).toBe(false);
  button.click();
  expect(onOpen).toHaveBeenCalledTimes(1);
});

it("leaves Yandex Music's button as it is while the option is off", async () => {
  document.body.innerHTML = `<button disabled data-test-id="PLAYERBAR_DESKTOP_SYNC_LYRICS_BUTTON"></button>`;
  install(vi.fn(), () => false);
  await settle();
  expect(document.querySelector("button")!.disabled).toBe(true);
});

// One lyrics button: the add-on's own player-bar button is hidden (ym.css) while Yandex Music's opens Spicy.
it("marks the page while Yandex Music's lyrics button is there to open Spicy Lyrics", async () => {
  let enabled = true;
  const hook = install(vi.fn(), () => enabled);
  expect(document.documentElement.classList.contains(OWNED)).toBe(false);
  const button = document.createElement("button");
  button.setAttribute("data-test-id", "PLAYERBAR_DESKTOP_SYNC_LYRICS_BUTTON");
  document.body.appendChild(button);
  await settle();
  expect(document.documentElement.classList.contains(OWNED)).toBe(true);
  enabled = false;
  hook.refresh();
  expect(document.documentElement.classList.contains(OWNED)).toBe(false);
  enabled = true;
  hook.refresh();
  button.remove();
  await settle();
  expect(document.documentElement.classList.contains(OWNED)).toBe(false);
});
