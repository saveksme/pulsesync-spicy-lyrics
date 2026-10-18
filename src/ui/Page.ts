// The Spicy Lyrics page as a Yandex Music overlay. Structure and classes follow
// Spicy Lyrics' src/components/Pages/PageView.ts (AGPL-3.0, github.com/Spikerko/spicy-lyrics).
import { guarded } from "../core/guard";
import type { Host } from "../core/host";
import type { PlayerClock } from "../core/PlayerClock";
import type { TrackInfo } from "../core/track";
import type { Settings } from "../core/types";
import { Animator } from "../render/Animator";
import { buildLyrics } from "../render/build";
import type { LineItem, RenderedLyrics } from "../render/model";
import { Scroller } from "../render/Scroller";
import type { Lyrics } from "../sources/types";
import { Background } from "./Background";
import { Icons } from "./Icons";
import { fitLineHover } from "./lineHover";
import { buildNotice } from "./Notice";
import { NowBar } from "./NowBar";
import { computeCinemaRect, followContentArea, type OverlayRect, TITLE_BAR_SELECTOR } from "./overlayRect";

export type PageMode = "page" | "cinema";
// "idle": nothing is playing yet, so the page stays empty instead of claiming "not found".
export type LyricsState = { status: "idle" } | { status: "loading" } | { status: "none" } | { status: "ready"; lyrics: Lyrics };

const FONT_URL = "https://fonts.spikerko.org/spicy-lyrics/source.css";
const SEEK_FADE_COMPENSATION_MS = 300;
const MAX_FRAME_ERRORS = 5;
const VIEW_KEY = "view";
// Yandex Music's fullscreen player: the window fades and slides in or out in 0.3 s (ym.css),
// and its lyrics view brings the cover and the lyrics into place in 0.8 s.
const CLOSE_MS = 300;
const ENTRANCE_MS = 800;

// On <html> while the view covers the window: ym.css then gives Yandex Music's transparent title
// bar the background it has on other pages (on My Wave the wave's gradient shows through it).
const COVERS_WINDOW_CLASS = "SpicyLyricsCoversWindow";

const px = (value: number) => `${Math.round(value * 10) / 10}px`;

interface ViewState {
  nowBarOpen: boolean;
  nowBarSide: "left" | "right";
}

function markup(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content;
}

export class LyricsPage {
  private readonly host: Host;
  private readonly clock: PlayerClock;
  private readonly doc: Document;
  private settings: Settings;
  // Like Yandex Music's own lyrics view: over the whole window, the cover beside the lyrics.
  private mode: PageMode = "cinema";
  // The view the lyrics button opens: the one last picked with the view controls.
  private preferredMode: PageMode = "cinema";
  // Spicy Lyrics starts with the NowBar closed (uiState $isNowBarOpen = false).
  private view: ViewState = { nowBarOpen: false, nowBarSide: "left" };
  private track: TrackInfo | null = null;
  private lyricsState: LyricsState = { status: "idle" };

  private hostEl: HTMLElement | null = null;
  private contentRect: OverlayRect | null = null;
  private page: HTMLElement | null = null;
  private contentBox: HTMLElement | null = null;
  private nowBarEl: HTMLElement | null = null;
  private lyricsContainer: HTMLElement | null = null;
  private lyricsContent: HTMLElement | null = null;
  private loader: HTMLElement | null = null;
  private viewControls: HTMLElement | null = null;
  private nowBar: NowBar | null = null;
  private background: Background | null = null;
  private scroller: Scroller | null = null;
  private animator: Animator;
  private rendered: RenderedLyrics | null = null;
  private lineByElement = new WeakMap<Element, LineItem>();
  private raf = 0;
  private frameErrors = 0;
  private wasPlaying: boolean | null = null;
  private cleanups: (() => void)[] = [];
  private closing: ReturnType<typeof setTimeout> | null = null;
  private readonly openArtist?: (artistId: string) => void;

  constructor(deps: { host: Host; clock: PlayerClock; doc?: Document; openArtist?: (artistId: string) => void }) {
    this.host = deps.host;
    this.clock = deps.clock;
    this.doc = deps.doc ?? document;
    this.openArtist = deps.openArtist;
    this.settings = deps.host.getSettings();
    this.animator = new Animator({ simple: this.settings.simpleLyricsMode });
    void this.host.storage
      .get<ViewState>(VIEW_KEY)
      .then((saved) => {
        if (saved && typeof saved.nowBarOpen === "boolean") this.view = { nowBarOpen: saved.nowBarOpen, nowBarSide: saved.nowBarSide === "right" ? "right" : "left" };
        this.applyViewClasses();
      })
      .catch(() => undefined);
  }

  get isOpen(): boolean {
    return this.hostEl !== null && this.closing === null;
  }

  open(mode: PageMode = this.preferredMode): void {
    if (this.closing !== null) {
      clearTimeout(this.closing);
      this.closing = null;
      this.hostEl?.classList.add("Visible");
    }
    if (this.hostEl) {
      if (mode !== this.mode) this.setMode(mode);
      return;
    }
    this.mode = mode;
    this.build();
    this.loadFont();
    this.applySettingsClasses();
    this.applyViewClasses();
    this.setMode(mode);
    this.nowBar!.setTrack(this.track);
    // Style first: the background starts as "dynamic", and a cover set before the style
    // would spin up a WebGL context for users of the other styles.
    this.background!.setStyle(this.settings.backgroundStyle);
    void this.background!.setCover(this.track?.coverUrl, this.track?.averageColor);
    this.renderLyrics();
    this.doc.body.appendChild(this.hostEl!);
    requestAnimationFrame(() => {
      if (!this.hostEl || this.closing !== null) return;
      this.hostEl.classList.add("Visible");
      this.playEntrance();
    });
    this.startLoop();
  }

  // Slides away like Yandex Music's fullscreen player, then goes.
  close(): void {
    if (!this.hostEl || this.closing !== null) return;
    if (this.doc.fullscreenElement === this.hostEl) void this.doc.exitFullscreen().catch(() => undefined);
    this.hostEl.classList.remove("Visible");
    this.closing = setTimeout(() => this.teardown(), CLOSE_MS);
  }

  private teardown(): void {
    if (this.closing !== null) clearTimeout(this.closing);
    this.closing = null;
    if (!this.hostEl) return;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.scroller?.destroy();
    this.nowBar?.destroy();
    this.background?.destroy();
    this.hostEl.remove();
    this.doc.documentElement.classList.remove(COVERS_WINDOW_CLASS);
    this.hostEl = this.page = this.contentBox = this.nowBarEl = this.lyricsContainer = this.lyricsContent = this.loader = this.viewControls = null;
    this.contentRect = null;
    this.nowBar = null;
    this.background = null;
    this.scroller = null;
    this.rendered = null;
    this.wasPlaying = null;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  destroy(): void {
    this.teardown();
  }

  setTrack(track: TrackInfo | null): void {
    this.track = track;
    if (!this.isOpen) return;
    this.nowBar?.setTrack(track);
    void this.background?.setCover(track?.coverUrl, track?.averageColor);
  }

  setLyrics(state: LyricsState): void {
    this.lyricsState = state;
    if (this.isOpen) this.renderLyrics();
  }

  setVolume(level: number | null): void {
    this.nowBar?.setVolume(level);
  }

  forceScroll(): void {
    this.scroller?.queueForceScroll();
  }

  applySettings(settings: Settings): void {
    const previous = this.settings;
    this.settings = settings;
    if (settings.simpleLyricsMode !== previous.simpleLyricsMode) this.animator = new Animator({ simple: settings.simpleLyricsMode });
    if (!this.isOpen) return;
    this.applySettingsClasses();
    if (settings.useSpicyFont) this.loadFont();
    this.background?.setStyle(settings.backgroundStyle);
    if (settings.simpleLyricsMode !== previous.simpleLyricsMode) this.renderLyrics();
  }

  private build(): void {
    const hostEl = this.doc.createElement("div");
    hostEl.id = "SpicyLyricsHost";
    const page = this.doc.createElement("div");
    page.id = "SpicyLyricsPage";
    page.append(
      markup(`
        <div class="ContentBox">
          <div class="NowBar"></div>
          <div class="LyricsContainer">
            <div class="loaderContainer"><div id="DotLoader"></div></div>
            <div class="LyricsContent ScrollbarScrollable"></div>
          </div>
          <div class="ViewControls"></div>
        </div>`),
    );
    hostEl.appendChild(page);
    this.hostEl = hostEl;
    this.page = page;
    this.contentBox = page.querySelector<HTMLElement>(".ContentBox");
    this.nowBarEl = page.querySelector<HTMLElement>(".NowBar");
    this.lyricsContainer = page.querySelector<HTMLElement>(".LyricsContainer");
    this.lyricsContent = page.querySelector<HTMLElement>(".LyricsContent");
    this.loader = page.querySelector<HTMLElement>(".loaderContainer");
    this.viewControls = page.querySelector<HTMLElement>(".ViewControls");
    this.nowBar = new NowBar(this.nowBarEl!, { host: this.host, clock: this.clock, openArtist: this.openArtist });
    this.background = new Background(this.contentBox!);
    this.scroller = new Scroller(this.lyricsContent!, this.lyricsContent!);

    const log = this.host.log;
    const onClick = guarded(log, "lyrics click", (event: Event) => this.seekToClickedLine(event));
    this.lyricsContent!.addEventListener("click", onClick);
    // Entering a line (not moving between its words) fits its hover background to the text.
    const onHover = guarded(log, "line hover", (event: MouseEvent) => {
      const line = event.target instanceof Element ? event.target.closest<HTMLElement>(".line") : null;
      const from = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (line && !(from && line.contains(from))) fitLineHover(line);
    });
    this.lyricsContent!.addEventListener("mouseover", onHover);
    const onKey = guarded(log, "keydown", (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (this.doc.fullscreenElement) void this.doc.exitFullscreen().catch(() => undefined);
      else this.close();
    });
    this.doc.addEventListener("keydown", onKey, true);
    const onFullscreen = guarded(log, "fullscreen change", () => this.renderViewControls());
    this.doc.addEventListener("fullscreenchange", onFullscreen);
    // A hidden window draws nothing, so the loop (and Kawarp's WebGL) sleeps until it is back.
    const onVisibility = guarded(log, "visibility change", () => {
      if (this.doc.hidden) {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
      } else if (this.hostEl && !this.raf) {
        this.startLoop();
      }
    });
    this.doc.addEventListener("visibilitychange", onVisibility);
    const stopFollow = followContentArea(
      this.doc,
      guarded(log, "layout update", (rect: OverlayRect) => {
        this.contentRect = rect;
        this.placeHost();
      }),
    );
    this.cleanups.push(
      () => this.lyricsContent?.removeEventListener("click", onClick),
      () => this.lyricsContent?.removeEventListener("mouseover", onHover),
      () => this.doc.removeEventListener("keydown", onKey, true),
      () => this.doc.removeEventListener("fullscreenchange", onFullscreen),
      () => this.doc.removeEventListener("visibilitychange", onVisibility),
      stopFollow,
    );
  }

  private loadFont(): void {
    if (!this.settings.useSpicyFont || this.doc.getElementById("SpicyLyricsFont")) return;
    const link = this.doc.createElement("link");
    link.id = "SpicyLyricsFont";
    link.rel = "stylesheet";
    link.href = FONT_URL;
    this.doc.head.appendChild(link);
  }

  private applySettingsClasses(): void {
    const page = this.page;
    if (!page) return;
    page.classList.add("SpicyRenderer", "Exp_NewProgressBar", "Exp_RefinedBackground", "ShowVolumeSlider", "DuetLinePadding", "ViewControlsPosition_Top");
    page.classList.toggle("UseSpicyFont", this.settings.useSpicyFont);
    page.classList.toggle("SimpleLyricsMode", this.settings.simpleLyricsMode);
    page.classList.toggle("NoLineHoverBackground", !this.settings.lineHoverBackground);
    page.classList.toggle("NoLineBlur", !this.settings.lineBlur);
    page.classList.toggle("NoBackground", this.settings.backgroundStyle === "none");
  }

  private applyViewClasses(): void {
    const page = this.page;
    const nowBar = this.nowBarEl;
    if (!page || !nowBar) return;
    const open = this.view.nowBarOpen || this.mode === "cinema";
    const right = this.view.nowBarSide === "right";
    nowBar.classList.toggle("Active", open);
    nowBar.classList.toggle("LeftSide", !right);
    nowBar.classList.toggle("RightSide", right);
    page.classList.toggle("NowBarStatus__Open", open);
    page.classList.toggle("NowBarStatus__Closed", !open);
    page.classList.toggle("NowBarSide__Right", right);
    page.classList.toggle("NowBarSide__Left", !right);
    this.scroller?.queueForceScroll();
  }

  private saveView(): void {
    void this.host.storage.set(VIEW_KEY, { ...this.view }).catch(() => undefined);
  }

  // Page mode covers Yandex Music's content column; cinema fills the window below its title bar.
  private placeHost(): void {
    if (!this.hostEl) return;
    const view = this.doc.defaultView ?? window;
    const rect =
      this.mode === "cinema"
        ? computeCinemaRect(this.doc.querySelector(TITLE_BAR_SELECTOR), { width: view.innerWidth, height: view.innerHeight })
        : this.contentRect;
    if (!rect) return;
    Object.assign(this.hostEl.style, {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }

  private setMode(mode: PageMode): void {
    this.mode = mode;
    const cinema = mode === "cinema";
    if (!cinema && this.doc.fullscreenElement === this.hostEl) void this.doc.exitFullscreen().catch(() => undefined);
    this.hostEl?.classList.toggle("Mode_Cinema", cinema);
    this.hostEl?.classList.toggle("Mode_Page", !cinema);
    this.doc.documentElement.classList.toggle(COVERS_WINDOW_CLASS, cinema && this.hostEl !== null);
    this.page?.classList.toggle("Fullscreen", cinema);
    this.nowBar?.setControlsVisible(cinema, this.page ?? undefined);
    this.placeHost();
    this.applyViewClasses();
    this.renderViewControls();
  }

  private renderViewControls(): void {
    const controls = this.viewControls;
    if (!controls || !this.page) return;
    const cinema = this.mode === "cinema";
    const fullscreen = Boolean(this.doc.fullscreenElement);
    const buttons: [string, string, string, () => void][] = [];
    if (!cinema) {
      buttons.push(["CinemaView", Icons.CinemaView, "Кинорежим", () => this.chooseMode("cinema")]);
      buttons.push(["NowBarToggle", Icons.NowBar, "NowBar", () => this.toggleNowBar()]);
    }
    if (this.view.nowBarOpen || cinema) buttons.push(["NowBarSideToggle", Icons.NowBarSideSwap, "Поменять сторону", () => this.swapNowBarSide()]);
    if (cinema) {
      buttons.push([
        "FullscreenToggle",
        fullscreen ? Icons.CloseFullscreen : Icons.Fullscreen,
        fullscreen ? "Выйти из полноэкранного режима" : "Во весь экран",
        () => this.toggleFullscreen(),
      ]);
      buttons.push(["CinemaExit", Icons.NowBar, "Обычный вид", () => this.chooseMode("page")]);
    }
    buttons.push(["Close", Icons.ArrowDown, "Закрыть", () => this.close()]);

    controls.replaceChildren(
      ...buttons.map(([id, icon, label, action]) => {
        const button = this.doc.createElement("button");
        button.id = id;
        button.className = "ViewControl";
        button.title = label;
        button.setAttribute("aria-label", label);
        button.append(markup(icon));
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          action();
        });
        return button;
      }),
    );
    // In the top corner in every view, like the buttons of Yandex Music's fullscreen player.
    if (this.contentBox && controls.parentElement !== this.contentBox) this.contentBox.appendChild(controls);
  }

  // Yandex Music's lyrics view (FullscreenPlayerDesktopContent): the cover moves from the centre to
  // its side while the lyrics fade in from the cover's place, each overshooting by 1% of the width.
  private playEntrance(): void {
    const page = this.page;
    const nowBar = this.nowBarEl;
    const lyrics = this.lyricsContainer;
    if (!page || !nowBar || !lyrics || !nowBar.classList.contains("Active") || typeof nowBar.animate !== "function") return;
    if (this.doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const pageRect = page.getBoundingClientRect();
    const cover = nowBar.getBoundingClientRect();
    if (pageRect.width <= 0) return;
    const right = this.view.nowBarSide === "right";
    const overshoot = pageRect.width / 100;
    const centre = pageRect.left + pageRect.width / 2;
    const textEdge = this.lyricsTextEdge(right) ?? centre;
    const timing: KeyframeAnimationOptions = { duration: ENTRANCE_MS, easing: "ease-in-out" };
    nowBar.animate(
      [
        { transform: `translateX(${px(centre - (cover.left + cover.width / 2))})` },
        { transform: `translateX(${px(right ? overshoot : -overshoot)})`, offset: 0.5 },
        { transform: "none" },
      ],
      timing,
    );
    lyrics.animate(
      [
        { opacity: 0, transform: `translateX(${px((right ? cover.right : cover.left) - textEdge)})` },
        { transform: `translateX(${px(right ? -overshoot : overshoot)})`, offset: 0.5 },
        { opacity: 1, transform: "none" },
      ],
      timing,
    );
  }

  // Where the lyrics text begins on the cover's side (the scroll column's padding), if laid out.
  private lyricsTextEdge(right: boolean): number | null {
    const content = this.lyricsContent;
    const column = content?.querySelector<HTMLElement>(".SpicyLyricsScrollContainer");
    const style = column ? this.doc.defaultView?.getComputedStyle(column) : undefined;
    if (!content || !style) return null;
    const padding = parseFloat(right ? style.paddingRight : style.paddingLeft);
    if (!Number.isFinite(padding) || padding <= 0) return null;
    const rect = content.getBoundingClientRect();
    return right ? rect.right - padding : rect.left + padding;
  }

  private chooseMode(mode: PageMode): void {
    this.preferredMode = mode;
    this.setMode(mode);
  }

  private toggleNowBar(): void {
    this.view.nowBarOpen = !this.view.nowBarOpen;
    this.saveView();
    this.applyViewClasses();
    this.renderViewControls();
  }

  private swapNowBarSide(): void {
    this.view.nowBarSide = this.view.nowBarSide === "left" ? "right" : "left";
    this.saveView();
    this.applyViewClasses();
  }

  private toggleFullscreen(): void {
    if (this.doc.fullscreenElement) void this.doc.exitFullscreen().catch(() => undefined);
    else void this.hostEl?.requestFullscreen().catch(() => undefined);
  }

  private renderLyrics(): void {
    const content = this.lyricsContent;
    if (!content) return;
    content.replaceChildren();
    this.rendered = null;
    this.lineByElement = new WeakMap();
    this.scroller?.reset();
    this.animator.reset();
    this.loader?.classList.toggle("active", this.lyricsState.status === "loading");
    content.scrollTop = 0;

    if (this.lyricsState.status === "ready") {
      const rendered = buildLyrics(this.lyricsState.lyrics, { simple: this.settings.simpleLyricsMode });
      for (const line of rendered.lines) {
        if (line.DotLine) continue;
        this.lineByElement.set(line.HTMLElement, line);
        for (const word of line.Syllables?.Lead ?? []) {
          this.lineByElement.set(word.HTMLElement, line);
          for (const letter of word.Letters ?? []) this.lineByElement.set(letter.HTMLElement, line);
        }
      }
      content.appendChild(rendered.root);
      this.rendered = rendered;
      this.scroller?.queueForceScroll();
    } else if (this.lyricsState.status === "none") {
      content.appendChild(buildNotice("Текст не найден", "Для этого трека нет текста в Spicy Lyrics, Яндекс Музыке и LRCLIB."));
    }
  }

  private seekToClickedLine(event: Event): void {
    if (this.rendered?.type === "Static") return;
    for (let el = event.target as Element | null; el && el !== this.lyricsContent; el = el.parentElement) {
      const line = this.lineByElement.get(el);
      if (!line) continue;
      const start = line.Syllables?.Lead[0]?.StartTime ?? line.StartTime;
      this.host.seek(Math.max(0, start - SEEK_FADE_COMPENSATION_MS) / 1000);
      this.scroller?.queueForceScroll();
      return;
    }
  }

  private startLoop(): void {
    this.frameErrors = 0;
    const loop = () => {
      if (!this.hostEl) return;
      this.raf = requestAnimationFrame(loop);
      try {
        const position = this.clock.getPositionMs();
        const playing = this.clock.isPlaying;
        if (playing !== this.wasPlaying) {
          this.wasPlaying = playing;
          this.background?.setPlaying(playing);
          this.nowBar?.setPlaying(playing);
        }
        if (this.rendered) {
          this.animator.frame(this.rendered, position);
          this.scroller?.frame(this.rendered, position, playing);
        }
        this.nowBar?.update(position);
        this.background?.render();
        this.frameErrors = 0;
      } catch (error) {
        if (++this.frameErrors >= MAX_FRAME_ERRORS) {
          cancelAnimationFrame(this.raf);
          this.raf = 0;
          this.host.log.error("[spicy-lyrics] frame loop stopped after repeated errors", error);
        }
      }
    };
    this.raf = requestAnimationFrame(loop);
  }
}
