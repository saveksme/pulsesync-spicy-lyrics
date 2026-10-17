// Yandex Music's own "synced lyrics" entry points: the player-bar button and the
// track menu item that opens the same view. The menu's "hide lyrics" item is left alone.
const NATIVE_LYRICS_SELECTOR = [
  '[data-test-id="PLAYERBAR_DESKTOP_SYNC_LYRICS_BUTTON"]',
  '[data-test-id="TRACK_CONTEXT_MENU_SHOW_SYNC_LYRICS_BUTTON"]',
  '[data-test-id="SYNC_LYRICS_BUTTON"]',
].join(", ");

// Capture phase on the document runs before React's root listener, so the
// native view never opens while the option is on.
export function installNativeLyricsHook(doc: Document, onOpen: () => void, enabled: () => boolean): () => void {
  const onClick = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(NATIVE_LYRICS_SELECTOR) || !enabled()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onOpen();
  };
  doc.addEventListener("click", onClick, true);
  return () => doc.removeEventListener("click", onClick, true);
}
