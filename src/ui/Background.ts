// Ported from Spicy Lyrics (AGPL-3.0, github.com/Spikerko/spicy-lyrics):
// src/components/DynamicBG/dynamicBackground.ts (Kawarp layer, cover image, cover colors)
import Kawarp, { type KawarpOptions } from "@kawarp/core";
import type { BackgroundStyle } from "../core/types";

const KAWARP_OPTIONS: KawarpOptions = {
  warpIntensity: 1,
  blurPasses: 8,
  animationSpeed: 0.1,
  saturation: 1.5,
  dithering: 0.008,
  transitionDuration: 500,
  tintIntensity: 0,
  scale: 1,
};
const KAWARP_TRANSITION_MS = 1000;
const PAUSED_SPEED = 0.1;
// Longest layer transition in spicy-background.css (refined look).
const LAYER_SETTLE_MS = 1500;

interface Palette {
  min: string;
  high: string;
  deep: string;
  wash: string;
}

function parseColor(color: string | undefined): [number, number, number] | null {
  if (!color) return null;
  const hex = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const value = parseInt(hex[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  const rgb = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(color);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

function paletteFrom([r, g, b]: [number, number, number]): Palette {
  const shade = (factor: number) => `${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)}, 1`;
  return { min: shade(0.6), high: shade(0.35), deep: shade(0.3), wash: shade(0.55) };
}

async function averageOfImage(url: string): Promise<[number, number, number] | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob(), { resizeWidth: 8, resizeHeight: 8, resizeQuality: "medium" });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 8;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = context.getImageData(0, 0, 8, 8).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < pixels.length; i += 4) {
      sum[0] += pixels[i];
      sum[1] += pixels[i + 1];
      sum[2] += pixels[i + 2];
    }
    return [sum[0] / 64, sum[1] / 64, sum[2] / 64];
  } catch {
    return null;
  }
}

export class Background {
  private style: BackgroundStyle = "dynamic";
  private cover: string | undefined;
  private averageColor: string | undefined;
  private kawarp: Kawarp | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private kawarpFailed = false;
  private speed = 1;
  private applied = "";
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private destroyed = false;

  constructor(private readonly hostEl: HTMLElement) {}

  private later(fn: () => void, ms: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
  }

  private liveLayers(): HTMLElement[] {
    return Array.from(this.hostEl.querySelectorAll<HTMLElement>(":scope > .spicy-dynamic-bg:not(.transition_Out)"));
  }

  // Send every layer but `keep` out; they fade under the new one and are removed.
  private retire(keep: HTMLElement | null) {
    for (const layer of this.hostEl.querySelectorAll<HTMLElement>(":scope > .spicy-dynamic-bg")) {
      if (layer === keep || layer.classList.contains("transition_Out")) continue;
      layer.classList.remove("transition_In");
      layer.classList.add("transition_Out");
      if (!keep) layer.classList.add("transition_Away");
      if (layer === this.canvas) {
        const kawarp = this.kawarp;
        this.kawarp = null;
        this.canvas = null;
        this.later(() => kawarp?.dispose(), LAYER_SETTLE_MS);
      }
      this.later(() => layer.remove(), LAYER_SETTLE_MS);
    }
  }

  private reveal(layer: HTMLElement) {
    layer.classList.remove("is-pending");
    this.retire(layer);
    layer.classList.add("transition_In");
    this.later(() => layer.classList.remove("transition_In"), LAYER_SETTLE_MS);
  }

  setStyle(style: BackgroundStyle): void {
    if (style === this.style && this.applied) return;
    this.style = style;
    this.applied = "";
    void this.apply();
  }

  async setCover(url: string | undefined, averageColor?: string): Promise<void> {
    this.cover = url;
    this.averageColor = averageColor;
    await this.apply();
  }

  setPlaying(playing: boolean): void {
    const speed = playing ? 1 : PAUSED_SPEED;
    if (speed === this.speed) return;
    this.speed = speed;
    this.kawarp?.setOptions({ animationSpeed: speed });
  }

  render(): void {
    this.kawarp?.renderFrame();
  }

  destroy(): void {
    this.destroyed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.kawarp?.dispose();
    this.kawarp = null;
    this.canvas = null;
    for (const layer of this.hostEl.querySelectorAll(":scope > .spicy-dynamic-bg")) layer.remove();
  }

  private async apply(): Promise<void> {
    if (this.destroyed) return;
    const style = this.style === "dynamic" && this.kawarpFailed ? "cover" : this.style;
    const key = `${style}|${this.cover ?? ""}|${this.averageColor ?? ""}`;
    if (key === this.applied) return;
    this.applied = key;

    if (style === "none" || !this.cover) {
      this.retire(null);
      return;
    }
    if (style === "dynamic") return this.applyKawarp(this.cover, key);
    if (style === "cover") return this.applyImage(this.cover);
    return this.applyColor(this.cover, key);
  }

  private async applyKawarp(cover: string, key: string): Promise<void> {
    let canvas = this.canvas;
    let kawarp = this.kawarp;
    const fresh = !canvas || !kawarp;
    if (fresh) {
      canvas = document.createElement("canvas");
      canvas.classList.add("spicy-dynamic-bg", "is-pending");
      try {
        kawarp = new Kawarp(canvas, { ...KAWARP_OPTIONS, animationSpeed: this.speed, transitionDuration: 0 });
      } catch {
        // No WebGL: the cover style is the closest look.
        this.kawarpFailed = true;
        this.applied = "";
        return this.apply();
      }
      this.canvas = canvas;
      this.kawarp = kawarp;
      this.hostEl.prepend(canvas);
    }
    try {
      await kawarp!.loadImage(cover);
    } catch {
      return;
    }
    if (this.destroyed || this.applied !== key || this.kawarp !== kawarp) return;
    // Kawarp's own loop is replaced by render() on the page's frame loop.
    kawarp!.start();
    const loop = kawarp as unknown as { animationId: number | null };
    if (loop.animationId != null) cancelAnimationFrame(loop.animationId);
    loop.animationId = null;
    if (fresh) {
      this.reveal(canvas!);
      kawarp!.setOptions({ transitionDuration: KAWARP_TRANSITION_MS });
    }
  }

  private async applyImage(cover: string): Promise<void> {
    const current = this.liveLayers().find((layer) => layer.classList.contains("StaticBackground"));
    if (current?.dataset.coverId === cover) return this.retire(current);
    const preload = new Image();
    preload.src = cover;
    await preload.decode().catch(() => undefined);
    if (this.destroyed || this.style !== "cover" || this.cover !== cover) return;
    const layer = document.createElement("div");
    layer.classList.add("spicy-dynamic-bg", "StaticBackground");
    layer.style.setProperty("--BackgroundImage", `url("${cover}")`);
    layer.dataset.coverId = cover;
    this.hostEl.prepend(layer);
    this.reveal(layer);
  }

  private async applyColor(cover: string, key: string): Promise<void> {
    const rgb = parseColor(this.averageColor) ?? (await averageOfImage(cover)) ?? [18, 18, 18];
    if (this.destroyed || this.applied !== key) return;
    const palette = paletteFrom(rgb as [number, number, number]);
    let layer = this.liveLayers().find((candidate) => candidate.classList.contains("ColorBackground"));
    const created = !layer;
    if (!layer) {
      layer = document.createElement("div");
      layer.classList.add("spicy-dynamic-bg", "ColorBackground");
      this.hostEl.prepend(layer);
    }
    layer.style.setProperty("--MinContrastColor", palette.min);
    layer.style.setProperty("--HighContrastColor", palette.high);
    layer.style.setProperty("--DeepColor", palette.deep);
    layer.style.setProperty("--WashColor", palette.wash);
    if (created) this.reveal(layer);
    else this.retire(layer);
  }
}
