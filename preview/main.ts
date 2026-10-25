import "../src/styles";
import { PlayerClock } from "../src/core/PlayerClock";
import type { TrackInfo } from "../src/core/track";
import type { BackgroundStyle } from "../src/core/types";
import type { Lyrics } from "../src/sources/types";
import { LyricsPage } from "../src/ui/Page";
import { DEMO_DURATION_MS, lineDemo, staticDemo, syllableDemo } from "./fixtures";
import { MockPlayer, createMockHost, makeCover } from "./mockHost";

const params = new URLSearchParams(location.search);
const covers = [await makeCover(330, 260), await makeCover(20, 200)];
const track = (cover: string): TrackInfo => ({
  id: "1",
  title: "Midnight Lights",
  version: "Demo",
  artists: ["Spicy Demo", "Гость"],
  artistIds: ["1", null],
  album: "Preview",
  durationMs: DEMO_DURATION_MS,
  coverUrl: cover,
  isUgc: false,
});

const player = new MockPlayer(track(covers[0]), DEMO_DURATION_MS);
const host = createMockHost(player);
const clock = new PlayerClock();
host.onPlayer((state) => {
  const { seeked } = clock.update(state);
  if (seeked) page.forceScroll();
  page.setVolume(state.volume);
});
host.onSettings((settings) => {
  clock.offsetMs = settings.timingOffsetMs;
  page.applySettings(settings);
});

// The add-on opens the artist's page in Yandex Music; the preview only logs it.
const page = new LyricsPage({ host, clock, openArtist: (artistId) => console.info("[open artist]", artistId) });
const fixtures: Record<string, Lyrics> = { syllable: syllableDemo, line: lineDemo, static: staticDemo };
let current = params.get("lyrics") ?? "syllable";
page.setTrack(player.track);
page.setLyrics({ status: "ready", lyrics: fixtures[current] ?? syllableDemo });
if (params.get("simple") === "1") player.setSettings({ simpleLyricsMode: true });
if (params.get("bg")) player.setSettings({ backgroundStyle: params.get("bg") as BackgroundStyle });
if (params.get("at")) player.seek(Number(params.get("at")));
if (params.get("paused") === "1") player.toggle();
// Like the add-on: over the whole window unless ?mode=page asks for the content-area view.
page.open(params.get("mode") === "page" ? "page" : undefined);
// Same font, same-origin through the dev-server proxy (see vite.preview.config.ts).
document.querySelector<HTMLLinkElement>("#SpicyLyricsFont")?.setAttribute("href", "/spicy-font/spicy-lyrics/source.css");

const backgrounds: BackgroundStyle[] = ["dynamic", "cover", "color", "none"];
document.getElementById("open")!.addEventListener("click", () => page.toggle());
document.addEventListener("keydown", (event) => {
  if (event.key === " ") player.toggle();
  else if (event.key === "ArrowRight") player.seek(player.positionSec() + 5);
  else if (event.key === "ArrowLeft") player.seek(player.positionSec() - 5);
  else if (event.key in { 1: 1, 2: 1, 3: 1 }) {
    current = ["syllable", "line", "static"][Number(event.key) - 1];
    page.setLyrics({ status: "ready", lyrics: fixtures[current] });
  } else if (event.key === "s") player.setSettings({ simpleLyricsMode: !player.settings.simpleLyricsMode });
  else if (event.key === "b") {
    const next = backgrounds[(backgrounds.indexOf(player.settings.backgroundStyle) + 1) % backgrounds.length];
    player.setSettings({ backgroundStyle: next });
  } else if (event.key === "t") {
    player.track = track(player.track.coverUrl === covers[0] ? covers[1] : covers[0]);
    page.setTrack(player.track);
  } else if (event.key === "o") page.toggle();
});

Object.assign(window, { page, player });

