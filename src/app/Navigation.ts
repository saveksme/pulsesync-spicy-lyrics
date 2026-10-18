import { guarded } from "../core/guard";
import type { Host } from "../core/host";
import { PLAYER_BAR_SELECTORS } from "../ui/overlayRect";
import { FULLSCREEN_PLAYER_SELECTOR } from "./NativeLyricsHook";

const VIEW_SELECTOR = "#SpicyLyricsHost";
// Links within Yandex Music ("/collection", "/artist?artistId=7"), and its side bar's items: the
// current section's is a link without an address.
const NAVIGATION_SELECTOR = 'a[href^="/"]:not([href^="//"]), [data-test-id^="NAVBAR_NAVIGATION_ITEM"]';

// Opens an artist's page through Yandex Music's own link to it, preferably the player bar's: the
// click goes through its router (no reload) and its own handling. The desktop app keeps the id
// in the query. False when Yandex Music shows no such link.
export function openArtistPage(doc: Document, artistId: string): boolean {
  const href = `/artist?artistId=${encodeURIComponent(artistId)}`;
  const links = [...doc.querySelectorAll<HTMLElement>("a[href]")].filter((link) => link.getAttribute("href") === href);
  const link = links.find((candidate) => candidate.closest(PLAYER_BAR_SELECTORS.join(", ")) !== null) ?? links[0];
  link?.click();
  return link !== undefined;
}

// Calls onLeave whenever Yandex Music goes elsewhere, as Spicy's page closes when Spotify
// navigates away: a click on its links or side bar outside the view (also on the current
// section, whose route stays), any route change (back, forward, search), and its fullscreen
// player opening.
export function watchNavigation(doc: Document, host: Host, onLeave: () => void): () => void {
  const leave = guarded(host.log, "navigation", onLeave);

  const onClick = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target && !target.closest(VIEW_SELECTOR) && target.closest(NAVIGATION_SELECTOR)) leave();
  };
  doc.addEventListener("click", onClick, true);

  // The first report is the route the app starts on.
  let route: string | null = null;
  const offRoute = host.onRoute((next) => {
    if (route !== null && next !== route) leave();
    route = next;
  });

  // Only a player that appears: the one that handed over to the view is still closing.
  const observer = new MutationObserver((records) => {
    const opened = records.some((record) =>
      [...record.addedNodes].some((node) => node instanceof Element && (node.matches(FULLSCREEN_PLAYER_SELECTOR) || node.querySelector(FULLSCREEN_PLAYER_SELECTOR) !== null)),
    );
    if (opened) leave();
  });
  observer.observe(doc.body, { childList: true, subtree: true });

  return () => {
    doc.removeEventListener("click", onClick, true);
    offRoute();
    observer.disconnect();
  };
}
