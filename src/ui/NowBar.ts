// Ported from Spicy Lyrics (AGPL-3.0, github.com/Spikerko/spicy-lyrics):
// src/components/Utils/NowBar.ts (MediaBox, metadata, timeline, playback and volume
// controls), src/components/Utils/Fullscreen.ts (controls hover springs)
import type { Host } from "../core/host";
import type { PlayerClock } from "../core/PlayerClock";
import type { TrackInfo } from "../core/track";
import { Spring } from "../render/Spring";
import { Icons } from "./Icons";
import { formatTime } from "./time";

const CONTROLS_IDLE_MS = 750;
const COVER_SWAP_MS = 1100;
const METADATA_SWAP_MS = 350;
const LOW_VOLUME = 0.5;

function markup(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content;
}

function setText(el: Element | null, text: string): void {
  if (el && el.textContent !== text) el.textContent = text;
}

export class NowBar {
  private readonly mediaBox: HTMLElement;
  private readonly mediaContent: HTMLElement;
  private readonly imageContainer: HTMLElement;
  private readonly metadata: HTMLElement;
  private readonly timeline: HTMLElement;
  private readonly slider: HTMLElement;
  private readonly positionText: HTMLElement;
  private readonly durationText: HTMLElement;
  private controls: HTMLElement | null = null;
  private volume: HTMLElement | null = null;
  private track: TrackInfo | null = null;
  private coverToken = 0;
  private metadataToken = 0;
  private dragging = false;
  private lastProgress = -1;
  private lastSecond = -1;
  private volumeLevel = 1;
  private volumeDragging = false;
  private cleanups: (() => void)[] = [];
  private cinemaCleanups: (() => void)[] = [];
  private timers = new Set<ReturnType<typeof setTimeout>>();
  // Fullscreen.ts: controls fade in over the artwork while the pointer moves.
  private readonly controlsOpacity = new Spring(0, 2, 2);
  private readonly artworkBrightness = new Spring(1, 2, 2);
  private hoverMedia = false;
  private lastPointerMove = -Infinity;
  private lastHoverStep = 0;

  constructor(
    private readonly root: HTMLElement,
    // openArtist: opens an artist's page (by Yandex Music id); without it the artists are text.
    private readonly deps: { host: Host; clock: PlayerClock; openArtist?: (artistId: string) => void },
  ) {
    root.replaceChildren(
      markup(`
        <div class="CenteredView">
          <div class="Header">
            <div class="MediaBox">
              <div class="MediaContent"></div>
              <div class="MediaImageContainer">
                <div class="fi_FromImage ib_ImageBox"></div>
                <div class="ti_ToImage ib_ImageBox MB_hidden"></div>
              </div>
            </div>
            <div class="Timeline">
              <span class="Time Position">0:00</span>
              <div class="SliderBar" style="--SliderProgress: 0"><div class="Handle"></div></div>
              <span class="Time Duration">0:00</span>
            </div>
            <div class="Metadata">
              <div class="SongName"><span></span></div>
              <div class="Artists"><span></span></div>
            </div>
          </div>
        </div>`),
    );
    this.mediaBox = root.querySelector<HTMLElement>(".MediaBox")!;
    this.mediaContent = root.querySelector<HTMLElement>(".MediaContent")!;
    this.imageContainer = root.querySelector<HTMLElement>(".MediaImageContainer")!;
    this.metadata = root.querySelector<HTMLElement>(".Metadata")!;
    this.timeline = root.querySelector<HTMLElement>(".Timeline")!;
    this.slider = root.querySelector<HTMLElement>(".SliderBar")!;
    this.positionText = root.querySelector<HTMLElement>(".Time.Position")!;
    this.durationText = root.querySelector<HTMLElement>(".Time.Duration")!;
    this.setupTimeline();
    this.setupArtistLinks();
  }

  private later(fn: () => void, ms: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
  }

  private listen<K extends keyof HTMLElementEventMap>(
    target: EventTarget,
    type: K | string,
    handler: (event: Event) => void,
    bucket: (() => void)[] = this.cleanups,
    options?: AddEventListenerOptions,
  ) {
    target.addEventListener(type, handler, options);
    bucket.push(() => target.removeEventListener(type, handler, options));
  }

  setTrack(track: TrackInfo | null): void {
    const previous = this.track;
    this.track = track;
    if (track?.coverUrl !== previous?.coverUrl) this.swapCover(track?.coverUrl);
    if (track?.title !== previous?.title || track?.artists.join() !== previous?.artists.join() || track?.artistIds?.join() !== previous?.artistIds?.join()) {
      this.swapMetadata(track);
    }
    setText(this.durationText, formatTime(track?.durationMs ?? 0));
  }

  private swapCover(url: string | undefined): void {
    const token = ++this.coverToken;
    const from = this.imageContainer.querySelector<HTMLElement>(".fi_FromImage")!;
    const to = this.imageContainer.querySelector<HTMLElement>(".ti_ToImage")!;
    if (!url) {
      from.style.backgroundImage = "";
      from.classList.remove("containsImage");
      return;
    }
    const image = `url("${url}")`;
    if (!from.classList.contains("containsImage")) {
      from.style.backgroundImage = image;
      from.classList.add("containsImage");
      return;
    }
    to.style.backgroundImage = image;
    to.classList.remove("MB_hidden");
    to.classList.add("containsImage", "MB_anim_enter");
    from.classList.add("MB_anim_fimg");
    this.later(() => {
      if (token !== this.coverToken) return;
      from.style.backgroundImage = image;
      from.classList.remove("MB_anim_fimg");
      this.later(() => {
        if (token !== this.coverToken) return;
        to.classList.add("MB_hidden");
        to.classList.remove("MB_anim_enter");
      }, 950);
    }, COVER_SWAP_MS);
  }

  private swapMetadata(track: TrackInfo | null): void {
    const token = ++this.metadataToken;
    this.metadata.classList.add("tr_VisuallyHidden");
    this.later(() => {
      if (token !== this.metadataToken) return;
      const title = track ? [track.title, track.version].filter(Boolean).join(" · ") : "";
      setText(this.metadata.querySelector(".SongName span"), title);
      this.renderArtists(track);
      this.later(() => {
        if (token === this.metadataToken) this.metadata.classList.remove("tr_VisuallyHidden");
      }, 80);
    }, METADATA_SWAP_MS);
  }

  // Spicy's NowBar.ts: artists with a page are Clickable spans between ", ".
  private renderArtists(track: TrackInfo | null): void {
    const list = this.metadata.querySelector<HTMLElement>(".Artists > span")!;
    list.replaceChildren();
    track?.artists.forEach((name, index) => {
      if (index > 0) list.append(", ");
      const artistId = track.artistIds?.[index];
      if (!artistId || !this.deps.openArtist) {
        list.append(name);
        return;
      }
      const link = document.createElement("span");
      link.className = "Clickable";
      link.dataset.artistId = artistId;
      link.setAttribute("role", "link");
      link.tabIndex = 0;
      link.textContent = name;
      list.append(link);
    });
  }

  private setupArtistLinks(): void {
    const open = (event: Event) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLElement>(".Artists .Clickable") : null;
      if (link?.dataset.artistId) this.deps.openArtist?.(link.dataset.artistId);
    };
    this.listen(this.metadata, "click", open);
    this.listen(this.metadata, "keydown", (event) => {
      if ((event as KeyboardEvent).key === "Enter") open(event);
    });
  }

  private durationMs(): number {
    return this.track?.durationMs ?? 0;
  }

  private setupTimeline(): void {
    const ratioAt = (clientX: number) => {
      const rect = this.slider.getBoundingClientRect();
      return rect.width > 0 ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) : 0;
    };
    const preview = (ratio: number) => {
      this.slider.style.setProperty("--SliderProgress", String(ratio));
      setText(this.positionText, formatTime(ratio * this.durationMs()));
    };
    const move = (event: Event) => {
      if (this.dragging) preview(ratioAt((event as MouseEvent).clientX));
    };
    const end = (event: Event) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.slider.classList.remove("Dragging");
      const ratio = ratioAt((event as MouseEvent).clientX);
      this.deps.host.seek((ratio * this.durationMs()) / 1000);
      this.lastProgress = -1;
    };
    this.listen(this.slider, "mousedown", (event) => {
      this.dragging = true;
      this.slider.classList.add("Dragging");
      preview(ratioAt((event as MouseEvent).clientX));
      event.preventDefault();
    });
    this.listen(document, "mousemove", move);
    this.listen(document, "mouseup", end);
  }

  update(positionMs: number): void {
    if (!this.dragging) {
      const duration = this.durationMs();
      const ratio = duration > 0 ? Math.min(1, Math.max(0, positionMs / duration)) : 0;
      if (Math.abs(ratio - this.lastProgress) > 0.0005) {
        this.lastProgress = ratio;
        this.slider.style.setProperty("--SliderProgress", ratio.toFixed(4));
      }
      const second = Math.floor(positionMs / 1000);
      if (second !== this.lastSecond) {
        this.lastSecond = second;
        setText(this.positionText, formatTime(positionMs));
      }
    }
    if (this.controls) this.stepHover();
  }

  setPlaying(playing: boolean): void {
    const toggle = this.controls?.querySelector<HTMLElement>(".PlayStateToggle");
    if (!toggle || toggle.classList.contains(playing ? "Playing" : "Paused")) return;
    toggle.classList.toggle("Playing", playing);
    toggle.classList.toggle("Paused", !playing);
    toggle.replaceChildren(markup(playing ? Icons.Pause : Icons.Play));
  }

  // Player snapshots lag behind a drag (volume calls are throttled), so they wait for the drop.
  setVolume(level: number | null): void {
    if (!this.volumeDragging) this.showVolume(level);
  }

  private showVolume(level: number | null): void {
    if (level === null || !Number.isFinite(level)) return;
    this.volumeLevel = Math.min(1, Math.max(0, level));
    if (!this.volume) return;
    this.volume.style.setProperty("--VolumeLevel", this.volumeLevel.toFixed(3));
    this.volume.classList.toggle("Muted", this.volumeLevel === 0);
    this.volume.classList.toggle("Low", this.volumeLevel > 0 && this.volumeLevel < LOW_VOLUME);
    this.volume.classList.toggle("IconOnFill", this.volumeLevel > 0.12);
  }

  // Cinema mode: transport and volume over the artwork, shown on hover.
  setControlsVisible(visible: boolean, page?: HTMLElement): void {
    if (visible === Boolean(this.controls)) return;
    if (!visible) {
      for (const cleanup of this.cinemaCleanups.splice(0)) cleanup();
      this.controls?.remove();
      this.volume?.remove();
      this.controls = null;
      this.volume = null;
      this.volumeDragging = false;
      this.mediaBox.style.removeProperty("--ControlsOpacity");
      this.mediaBox.style.removeProperty("--ArtworkBrightness");
      return;
    }
    const controls = document.createElement("div");
    controls.classList.add("PlaybackControls");
    controls.append(
      markup(`${Icons.PrevTrack}<div class="PlaybackControl PlayStateToggle Paused">${Icons.Play}</div>${Icons.NextTrack}`),
    );
    const press = (event: Event) => (event.currentTarget as HTMLElement).classList.add("Pressed");
    const release = (event: Event) => (event.currentTarget as HTMLElement).classList.remove("Pressed");
    for (const control of controls.querySelectorAll<HTMLElement>(".PlaybackControl")) {
      this.listen(control, "mousedown", press, this.cinemaCleanups);
      this.listen(control, "mouseup", release, this.cinemaCleanups);
      this.listen(control, "mouseleave", release, this.cinemaCleanups);
    }
    this.listen(controls.querySelector(".PrevTrack")!, "click", () => this.deps.host.previous(), this.cinemaCleanups);
    this.listen(controls.querySelector(".NextTrack")!, "click", () => this.deps.host.next(), this.cinemaCleanups);
    this.listen(controls.querySelector(".PlayStateToggle")!, "click", () => this.deps.host.togglePlay(), this.cinemaCleanups);
    this.controls = controls;
    this.mediaContent.prepend(controls);
    this.setPlaying(this.deps.clock.isPlaying);

    const volume = document.createElement("div");
    volume.classList.add("VolumeControl");
    volume.append(markup(`<div class="VolumeFill"></div><div class="Handle"></div><div class="VolumeIcon">${Icons.Volume}</div>`));
    this.volume = volume;
    this.mediaContent.append(volume);
    this.showVolume(this.volumeLevel);
    this.setupVolume(volume);

    // Hover: the page dims the artwork a little, the artwork itself shows the controls.
    const pageEl = page ?? this.root;
    this.listen(pageEl, "mousemove", () => (this.lastPointerMove = performance.now()), this.cinemaCleanups);
    this.listen(this.mediaBox, "mouseenter", () => (this.hoverMedia = true), this.cinemaCleanups);
    this.listen(this.mediaBox, "mouseleave", () => (this.hoverMedia = false), this.cinemaCleanups);
  }

  private setupVolume(volume: HTMLElement): void {
    let beforeMute = this.volumeLevel || 0.5;
    const levelAt = (clientY: number) => {
      const rect = volume.getBoundingClientRect();
      return rect.height > 0 ? Math.min(1, Math.max(0, (rect.bottom - clientY) / rect.height)) : 0;
    };
    const apply = (level: number) => {
      this.showVolume(level);
      this.deps.host.setVolume(level);
    };
    this.listen(
      volume,
      "mousedown",
      (event) => {
        if ((event.target as HTMLElement).closest(".VolumeIcon")) return;
        this.volumeDragging = true;
        volume.classList.add("Dragging");
        apply(levelAt((event as MouseEvent).clientY));
        event.preventDefault();
      },
      this.cinemaCleanups,
    );
    this.listen(document, "mousemove", (event) => this.volumeDragging && apply(levelAt((event as MouseEvent).clientY)), this.cinemaCleanups);
    this.listen(
      document,
      "mouseup",
      () => {
        this.volumeDragging = false;
        volume.classList.remove("Dragging");
      },
      this.cinemaCleanups,
    );
    this.listen(
      volume,
      "wheel",
      (event) => {
        event.preventDefault();
        apply(Math.min(1, Math.max(0, this.volumeLevel - Math.sign((event as WheelEvent).deltaY) * 0.05)));
      },
      this.cinemaCleanups,
      { passive: false },
    );
    this.listen(
      volume.querySelector(".VolumeIcon")!,
      "click",
      () => {
        if (this.volumeLevel > 0) {
          beforeMute = this.volumeLevel;
          apply(0);
        } else {
          apply(beforeMute || 0.5);
        }
      },
      this.cinemaCleanups,
    );
  }

  private stepHover(): void {
    const now = performance.now();
    const idle = now - this.lastPointerMove >= CONTROLS_IDLE_MS && !this.hoverMedia;
    const hoveringPage = now - this.lastPointerMove < CONTROLS_IDLE_MS;
    this.controlsOpacity.SetGoal(idle ? 0 : this.hoverMedia ? 0.985 : hoveringPage ? 0.65 : 0);
    this.artworkBrightness.SetGoal(idle ? 1 : this.hoverMedia ? 0.55 : hoveringPage ? 0.78 : 1);
    const dt = this.lastHoverStep ? Math.min(0.1, (now - this.lastHoverStep) / 1000) : 1 / 60;
    this.lastHoverStep = now;
    const opacity = this.controlsOpacity.Step(dt);
    const brightness = this.artworkBrightness.Step(dt);
    this.mediaBox.style.setProperty("--ControlsOpacity", opacity.toFixed(3));
    this.mediaBox.style.setProperty("--ArtworkBrightness", brightness.toFixed(3));
    this.mediaContent.style.pointerEvents = opacity > 0.05 ? "" : "none";
  }

  destroy(): void {
    this.setControlsVisible(false);
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }
}
