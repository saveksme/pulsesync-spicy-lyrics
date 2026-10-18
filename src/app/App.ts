import { guarded } from "../core/guard";
import type { Host } from "../core/host";
import { PlayerClock } from "../core/PlayerClock";
import type { TrackInfo } from "../core/track";
import type { Settings } from "../core/types";
import { createLyricsResolver, type LyricsResolver } from "../sources/resolve";
import { LyricsPage, type PageMode } from "../ui/Page";
import { installNativeLyricsHook } from "./NativeLyricsHook";

const FULLSCREEN_PLAYER_CLOSE_SELECTOR = '[data-test-id="FULLSCREEN_PLAYER_CLOSE_BUTTON"]';

export interface AppController {
  open(mode?: PageMode): void;
  close(): void;
  toggle(): void;
  dispose(): void;
}

// Settings that decide where lyrics come from; the rest only change the look.
const SOURCE_FIELDS = [
  "spicyApiKey",
  "spotifyClientId",
  "spotifyClientSecret",
  "sourceOrder",
  "useSpicy",
  "useYandex",
  "useLrclib",
] as const satisfies readonly (keyof Settings)[];

// Wires the player, the lyrics sources and the page together. Lyrics are
// fetched on every track change, open or not, like Spicy Lyrics does.
export function startApp(host: Host, deps: { doc?: Document; resolver?: LyricsResolver } = {}): AppController {
  const doc = deps.doc ?? document;
  const clock = new PlayerClock();
  const page = new LyricsPage({ host, clock, doc });
  const resolver = deps.resolver ?? createLyricsResolver(host);
  let settings = host.getSettings();
  let track: TrackInfo | null = null;
  let loading: AbortController | null = null;
  let disposed = false;
  clock.offsetMs = settings.timingOffsetMs;

  function load(next: TrackInfo | null): void {
    loading?.abort();
    loading = null;
    if (!next) {
      page.setLyrics({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    loading = controller;
    page.setLyrics({ status: "loading" });
    const current = () => !controller.signal.aborted && !disposed && track?.id === next.id;
    const showNone = guarded(host.log, "lyrics fallback", () => page.setLyrics({ status: "none" }));
    resolver.get(next, controller.signal).then(
      (lyrics) => {
        if (!current()) return;
        loading = null;
        try {
          page.setLyrics(lyrics ? { status: "ready", lyrics } : { status: "none" });
        } catch (error) {
          host.log.error("[spicy-lyrics] lyrics render failed", error);
          showNone();
        }
      },
      (error) => {
        if (!current()) return;
        loading = null;
        host.log.warn("[spicy-lyrics] lyrics lookup failed", error);
        showNone();
      },
    );
  }

  const offPlayer = host.onPlayer(guarded(host.log, "player update", (state) => {
    if (disposed) return;
    const next = state.track;
    if ((next?.id ?? null) !== (track?.id ?? null)) {
      track = next;
      page.setTrack(next);
      load(next);
    } else if (next && track && (next.coverUrl !== track.coverUrl || next.title !== track.title)) {
      track = next;
      page.setTrack(next);
    }
    if (clock.update(state).seeked) page.forceScroll();
    page.setVolume(state.volume);
  }));

  // Yandex Music's own lyrics button opens Spicy Lyrics (and toggles it, like its own panel).
  // In its fullscreen player, where its lyrics fill the window, Spicy Lyrics takes the player's
  // place over the whole window, and the player closes so that nothing is left behind.
  const nativeHook = installNativeLyricsHook(
    doc,
    guarded(host.log, "native lyrics button", ({ fromFullscreenPlayer }: { fromFullscreenPlayer: boolean }) => {
      if (!fromFullscreenPlayer) return app.toggle();
      doc.querySelector<HTMLElement>(FULLSCREEN_PLAYER_CLOSE_SELECTOR)?.click();
      app.open("cinema");
    }),
    () => settings.replaceNativeLyricsButton,
  );

  const offSettings = host.onSettings(guarded(host.log, "settings update", (next) => {
    if (disposed) return;
    const previous = settings;
    settings = next;
    clock.offsetMs = next.timingOffsetMs;
    page.applySettings(next);
    if (previous.replaceNativeLyricsButton !== next.replaceNativeLyricsButton) nativeHook.refresh();
    if (SOURCE_FIELDS.some((field) => previous[field] !== next[field])) {
      resolver.clear();
      load(track);
    }
  }));

  const app: AppController = {
    open(mode) {
      if (disposed) return;
      page.open(mode);
    },
    close() {
      page.close();
    },
    toggle() {
      if (page.isOpen) page.close();
      else app.open();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loading?.abort();
      offPlayer();
      offSettings();
      nativeHook.dispose();
      page.destroy();
    },
  };

  return app;
}
