// Yandex Music's own "synced lyrics" entry points: the player-bar button and the
// track menu item that opens the same view. The menu's "hide lyrics" item is left alone.
const NATIVE_LYRICS_SELECTOR = [
  '[data-test-id="PLAYERBAR_DESKTOP_SYNC_LYRICS_BUTTON"]',
  '[data-test-id="TRACK_CONTEXT_MENU_SHOW_SYNC_LYRICS_BUTTON"]',
  '[data-test-id="SYNC_LYRICS_BUTTON"]',
].join(", ");
const LYRICS_BUTTON_SELECTOR = '[data-test-id="PLAYERBAR_DESKTOP_SYNC_LYRICS_BUTTON"]';
// Yandex Music's fullscreen player, which has a lyrics button of its own (same test id).
export const FULLSCREEN_PLAYER_SELECTOR = '[data-test-id="FULLSCREEN_PLAYER_MODAL"]';

export interface NativeLyricsOpen {
  fromFullscreenPlayer: boolean;
}

// Set on <html> while Yandex Music's lyrics button opens Spicy Lyrics; ym.css then hides the
// add-on's own player-bar button, so the player bar has one lyrics button.
export const OWNS_LYRICS_BUTTON_CLASS = "SpicyLyricsOwnsLyricsButton";

export interface NativeLyricsHook {
  // Applies a change of the option at once.
  refresh(): void;
  dispose(): void;
}

// Capture phase on the document runs before React's root listener, so the native view never
// opens while the option is on. Yandex Music disables its button for tracks it has no lyrics
// for; Spicy Lyrics may still have them, so the button is kept usable. Turning the option off
// leaves the button to Yandex Music, which sets it right on its next render.
export function installNativeLyricsHook(doc: Document, onOpen: (context: NativeLyricsOpen) => void, enabled: () => boolean): NativeLyricsHook {
  const onClick = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(NATIVE_LYRICS_SELECTOR) || !enabled()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onOpen({ fromFullscreenPlayer: target.closest(FULLSCREEN_PLAYER_SELECTOR) !== null });
  };

  const sync = () => {
    const owned = enabled();
    const buttons = doc.querySelectorAll<HTMLButtonElement>(LYRICS_BUTTON_SELECTOR);
    if (owned) {
      for (const button of buttons) {
        if (button.disabled) button.disabled = false;
        if (button.getAttribute("aria-hidden") === "true") button.removeAttribute("aria-hidden");
      }
    }
    doc.documentElement.classList.toggle(OWNS_LYRICS_BUTTON_CLASS, owned && buttons.length > 0);
  };

  const observer = new MutationObserver(sync);
  observer.observe(doc.body ?? doc.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["disabled", "aria-hidden"],
  });
  doc.addEventListener("click", onClick, true);
  sync();

  return {
    refresh: sync,
    dispose() {
      observer.disconnect();
      doc.removeEventListener("click", onClick, true);
      doc.documentElement.classList.remove(OWNS_LYRICS_BUTTON_CLASS);
    },
  };
}
