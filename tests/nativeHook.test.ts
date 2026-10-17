/** @vitest-environment happy-dom */
import { expect, it, vi } from "vitest";
import { installNativeLyricsHook } from "../src/app/NativeLyricsHook";

it("intercepts the native lyrics button only when enabled", () => {
  document.body.innerHTML = `<button data-test-id="PLAYERBAR_DESKTOP_SYNC_LYRICS_BUTTON"><span>i</span></button>`;
  const native = vi.fn();
  document.body.addEventListener("click", native);
  let enabled = true;
  const onOpen = vi.fn();
  const off = installNativeLyricsHook(document, onOpen, () => enabled);
  document.querySelector("span")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(native).not.toHaveBeenCalled();
  enabled = false;
  document.querySelector("span")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(native).toHaveBeenCalledTimes(1);
  off();
  document.body.removeEventListener("click", native);
});

it("opens from the track menu's show-lyrics item but leaves its hide-lyrics item alone", () => {
  document.body.innerHTML = `
    <div data-test-id="TRACK_CONTEXT_MENU_SHOW_SYNC_LYRICS_BUTTON">show</div>
    <div data-test-id="TRACK_CONTEXT_MENU_HIDE_SYNC_LYRICS_BUTTON">hide</div>`;
  const onOpen = vi.fn();
  const off = installNativeLyricsHook(document, onOpen, () => true);
  const [show, hide] = document.querySelectorAll("div");
  hide.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(onOpen).not.toHaveBeenCalled();
  show.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(onOpen).toHaveBeenCalledTimes(1);
  off();
  show.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(onOpen).toHaveBeenCalledTimes(1);
});
