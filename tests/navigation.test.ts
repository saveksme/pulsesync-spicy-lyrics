/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from "vitest";
import { openArtistPage, watchNavigation } from "../src/app/Navigation";
import { fakeHost } from "./helpers/fakeHost";

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  document.body.innerHTML = "";
});

// Clicks on links here would navigate happy-dom's window; Yandex Music's own handlers prevent that too.
function recordClicks(): string[] {
  const clicked: string[] = [];
  const record = (event: Event) => {
    event.preventDefault();
    clicked.push((event.target as Element).id);
  };
  document.addEventListener("click", record);
  stops.push(() => document.removeEventListener("click", record));
  return clicked;
}

function watch(onRoute?: (listener: (route: string) => void) => () => void) {
  const onLeave = vi.fn();
  stops.push(watchNavigation(document, fakeHost(onRoute ? { onRoute } : {}), onLeave));
  return onLeave;
}

// Yandex Music's own link goes through its router (no reload) and its own click handling.
it("opens an artist's page through Yandex Music's link to it, the player bar's first", () => {
  document.body.innerHTML = `
    <main><a id="page" href="/artist?artistId=7">A</a></main>
    <section class="PlayerBarDesktopWithBackgroundProgressBar_root__bpmwN"><a id="bar" href="/artist?artistId=7">A</a></section>
    <a id="other" href="/artist?artistId=8">B</a>`;
  const clicked = recordClicks();
  expect(openArtistPage(document, "7")).toBe(true);
  expect(openArtistPage(document, "8")).toBe(true);
  expect(openArtistPage(document, "9")).toBe(false);
  expect(clicked).toEqual(["bar", "other"]);
});

// PulseSync reports the current route first, then every change; another artist is another query.
it("leaves when Yandex Music's route changes", () => {
  let report!: (route: string) => void;
  const onLeave = watch((listener) => {
    report = listener;
    return () => {};
  });
  report("/collection");
  report("/collection");
  expect(onLeave).not.toHaveBeenCalled();
  report("/artist?artistId=7");
  report("/artist?artistId=8");
  expect(onLeave).toHaveBeenCalledTimes(2);
});

// The side bar's current section is a link without an address, and a click on it still leaves.
it("leaves on a click on Yandex Music's links and side bar, not on its buttons or in the view", () => {
  document.body.innerHTML = `
    <nav>
      <a id="home" data-test-id="NAVBAR_NAVIGATION_ITEM_HOME" href="/"><span id="home-label">Главная</span></a>
      <a id="collection" data-test-id="NAVBAR_NAVIGATION_ITEM_COLLECTION"><span id="collection-label">Коллекция</span></a>
    </nav>
    <a id="artist" href="/artist?artistId=7">A</a>
    <a id="external" href="https://yandex.ru/support">Помощь</a>
    <button id="like">♥</button>
    <div id="SpicyLyricsHost"><a id="inside" href="/artist?artistId=7">A</a></div>`;
  recordClicks();
  const onLeave = watch();
  const click = (id: string) => document.getElementById(id)!.click();
  click("home-label");
  click("collection-label");
  click("artist");
  expect(onLeave).toHaveBeenCalledTimes(3);
  click("external");
  click("like");
  click("inside");
  expect(onLeave).toHaveBeenCalledTimes(3);
});

// The fullscreen player that handed over to Spicy Lyrics is still closing when the view opens.
it("leaves when Yandex Music's fullscreen player opens", async () => {
  document.body.innerHTML = `<div id="closing" data-test-id="FULLSCREEN_PLAYER_MODAL"></div>`;
  const onLeave = watch();
  document.getElementById("closing")!.remove();
  document.body.insertAdjacentHTML("beforeend", `<div id="toast"></div>`);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(onLeave).not.toHaveBeenCalled();
  document.body.insertAdjacentHTML("beforeend", `<div class="portal"><div data-test-id="FULLSCREEN_PLAYER_MODAL"></div></div>`);
  await vi.waitFor(() => expect(onLeave).toHaveBeenCalledTimes(1));
});
