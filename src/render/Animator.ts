// Ported from Spicy Lyrics (AGPL-3.0, github.com/Spikerko/spicy-lyrics):
// src/utils/Lyrics/Animator/Lyrics/LyricsAnimator.ts (the default and Simple
// Lyrics Mode paths; the "Refreshed Simple Lyrics" experiment is not ported).
import { easeSinOut } from "d3-ease";
import type { ElementState, LineItem, RenderedLyrics, Springish, SpringSet, TimedItem } from "./model";
import { getSpline, type AnimationPoint } from "./Spline";
import { Spring } from "./Spring";
import { PRE_HIDDEN_DOT_LINE_MS } from "./build";

const BLUR_MULTIPLIER = 1.25;
const LETTER_GLOW_MULTIPLIER_OPACITY = 185;
const SUNG_LETTER_GLOW = 0.2;
const SIMPLE_MODE_POSITION_OFFSET = 33.5;

const ScaleRange: AnimationPoint[] = [
  { Time: 0, Value: 0.95 },
  { Time: 0.7, Value: 1.0505 },
  { Time: 1, Value: 1 },
];
const LetterScaleRange: AnimationPoint[] = [
  { Time: 0, Value: 0.95 },
  { Time: 0.7, Value: 1.175 },
  { Time: 1, Value: 1 },
];
const SimpleLetterScaleRange: AnimationPoint[] = [
  { Time: 0, Value: 0.95 },
  { Time: 0.7, Value: 1.07 },
  { Time: 1, Value: 1 },
];
const YOffsetRange: AnimationPoint[] = [
  { Time: 0, Value: 1 / 100 },
  { Time: 0.9, Value: -(1 / 60) },
  { Time: 1, Value: 0 },
];
const SimpleYOffsetRange: AnimationPoint[] = [
  { Time: 0, Value: 1 / 100 },
  { Time: 1, Value: -0.033 },
];
const LetterYOffsetRange: AnimationPoint[] = [
  { Time: 0, Value: 1 / 100 },
  { Time: 0.9, Value: -(1 / 56) },
  { Time: 1, Value: 0 },
];
const SimpleLetterYOffsetRange: AnimationPoint[] = [
  { Time: 0, Value: 1 / 100 },
  { Time: 0.9, Value: -(1 / 62) },
  { Time: 1, Value: 0 },
];
const GlowRange: AnimationPoint[] = [
  { Time: 0, Value: 0 },
  { Time: 0.15, Value: 1 },
  { Time: 0.6, Value: 1 },
  { Time: 1, Value: 0 },
];
const LineGlowRange: AnimationPoint[] = [
  { Time: 0, Value: 0 },
  { Time: 0.5, Value: 1 },
  { Time: 1, Value: 0 },
];
const dotOpacityRange = (simple: boolean): AnimationPoint[] => [
  { Time: 0, Value: simple ? 0.27 : 0.35 },
  { Time: 0.6, Value: 1 },
  { Time: 1, Value: 1 },
];
const DotScaleRange: AnimationPoint[] = [
  { Time: 0, Value: 0.75 },
  { Time: 0.7, Value: 1.05 },
  { Time: 1, Value: 1 },
];
const DotYOffsetRange: AnimationPoint[] = [
  { Time: 0, Value: 0 },
  { Time: 0.9, Value: -0.12 },
  { Time: 1, Value: 0 },
];
const DotGlowRange: AnimationPoint[] = [
  { Time: 0, Value: 0 },
  { Time: 0.6, Value: 1 },
  { Time: 1, Value: 1 },
];

const YOffsetDamping = 0.4;
const YOffsetFrequency = 1.45;
const ScaleDamping = 0.64;
const ScaleFrequency = 0.88;
const GlowDamping = 0.56;
const GlowFrequency = 1.18;
const Dot = {
  YOffsetDamping: 0.4,
  YOffsetFrequency: 1.25,
  ScaleDamping: 0.6,
  ScaleFrequency: 0.7,
  GlowDamping: 0.5,
  GlowFrequency: 1,
  OpacityDamping: 0.5,
  OpacityFrequency: 1,
};
const LineGlowDamping = 0.5;
const LineGlowFrequency = 1;

const SimpleLetterStrength = {
  LongerThan: 1500,
  Longer: { Glow: 0.4, YOffset: 0.45, Scale: 1.103 },
  Shorter: { Glow: 0.285, YOffset: 0.1, Scale: 1.09 },
};

const noopSpring: Springish = { Step: () => 0, SetGoal: () => {} };

const ScaleSpline = getSpline(ScaleRange);
const GlowSpline = getSpline(GlowRange);
const LineGlowSpline = getSpline(LineGlowRange);
const DotScaleSpline = getSpline(DotScaleRange);
const DotYOffsetSpline = getSpline(DotYOffsetRange);
const DotGlowSpline = getSpline(DotGlowRange);

function getElementState(position: number, start: number, end: number): ElementState {
  if (position < start) return "NotSung";
  if (position >= end) return "Sung";
  return "Active";
}

function getProgress(position: number, start: number, end: number): number {
  if (position <= start) return 0;
  if (position >= end) return 1;
  return (position - start) / (end - start);
}

// Last written value per property, and the batch of writes for this frame.
const styleCache = new WeakMap<HTMLElement, Map<string, number | string>>();
const styleQueue = new Map<HTMLElement, Map<string, string>>();

function setStyleIfChanged(el: HTMLElement, prop: string, value: string, epsilon = 0, compareValue?: number): void {
  let cache = styleCache.get(el);
  if (!cache) {
    cache = new Map();
    styleCache.set(el, cache);
  }
  let next: number | string = compareValue ?? parseFloat(value);
  if (Number.isNaN(next)) next = value;
  const previous = cache.get(prop);
  if (previous !== undefined) {
    if (typeof previous === "number" && typeof next === "number") {
      if (Math.abs(previous - next) <= epsilon) return;
    } else if (previous === next) {
      return;
    }
  }
  let props = styleQueue.get(el);
  if (!props) {
    props = new Map();
    styleQueue.set(el, props);
  }
  props.set(prop, value);
  cache.set(prop, next);
}

function flushStyles(): void {
  for (const [el, props] of styleQueue) for (const [prop, value] of props) el.style.setProperty(prop, value);
  styleQueue.clear();
}

function setClass(el: HTMLElement, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

const promotedLines = new WeakSet<HTMLElement>();
function promoteLine(el: HTMLElement): void {
  if (promotedLines.has(el)) return;
  el.style.willChange = "transform, opacity, text-shadow, scale";
  el.style.backfaceVisibility = "hidden";
  promotedLines.add(el);
}

const translate = (value: number) => `translate3d(0, calc(var(--DefaultLyricsSize) * ${value}), 0)`;

export class Animator {
  private readonly simple: boolean;
  private readonly now: () => number;
  private readonly YOffsetSpline;
  private readonly LetterScaleSpline;
  private readonly LetterYOffsetSpline;
  private readonly DotOpacitySpline;
  private lastFrameTime: number;
  private blurredLine: number | null = null;
  private lastRendered: RenderedLyrics | null = null;

  constructor(opts: { simple: boolean; now?: () => number }) {
    this.simple = opts.simple;
    this.now = opts.now ?? (() => performance.now());
    this.lastFrameTime = this.now();
    this.YOffsetSpline = getSpline(this.simple ? SimpleYOffsetRange : YOffsetRange);
    this.LetterScaleSpline = getSpline(this.simple ? SimpleLetterScaleRange : LetterScaleRange);
    this.LetterYOffsetSpline = getSpline(this.simple ? SimpleLetterYOffsetRange : LetterYOffsetRange);
    this.DotOpacitySpline = getSpline(dotOpacityRange(this.simple));
  }

  reset(): void {
    this.blurredLine = null;
    this.lastFrameTime = this.now();
  }

  // Forces the next frame to rewrite --BlurAmount (lines were re-mounted).
  invalidateBlur(): void {
    this.blurredLine = null;
  }

  private wordSprings(): SpringSet {
    if (this.simple) {
      return { Scale: noopSpring, YOffset: new Spring(this.YOffsetSpline.at(0), YOffsetFrequency, YOffsetDamping), Glow: noopSpring };
    }
    return {
      Scale: new Spring(ScaleSpline.at(0), ScaleFrequency, ScaleDamping),
      YOffset: new Spring(this.YOffsetSpline.at(0), YOffsetFrequency, YOffsetDamping),
      Glow: new Spring(GlowSpline.at(0), GlowFrequency, GlowDamping),
    };
  }

  private letterSprings(): SpringSet {
    return {
      Scale: new Spring(this.LetterScaleSpline.at(0), ScaleFrequency, ScaleDamping),
      YOffset: new Spring(this.LetterYOffsetSpline.at(0), YOffsetFrequency, YOffsetDamping),
      Glow: new Spring(GlowSpline.at(0), GlowFrequency, GlowDamping),
    };
  }

  private dotSprings(): SpringSet {
    const opacity = new Spring(this.DotOpacitySpline.at(0), Dot.OpacityFrequency, Dot.OpacityDamping);
    if (this.simple) return { Scale: noopSpring, YOffset: noopSpring, Glow: noopSpring, Opacity: opacity };
    return {
      Scale: new Spring(DotScaleSpline.at(0), Dot.ScaleFrequency, Dot.ScaleDamping),
      YOffset: new Spring(DotYOffsetSpline.at(0), Dot.YOffsetFrequency, Dot.YOffsetDamping),
      Glow: new Spring(DotGlowSpline.at(0), Dot.GlowFrequency, Dot.GlowDamping),
      Opacity: opacity,
    };
  }

  private applyBlur(lines: LineItem[], activeIndex: number, position: number): void {
    if (!lines[activeIndex]) return;
    promoteLine(lines[activeIndex].HTMLElement);
    const max = BLUR_MULTIPLIER * 5 + BLUR_MULTIPLIER * 0.465;
    for (let i = 0; i < lines.length; i++) {
      const el = lines[i].HTMLElement;
      if (!el.isConnected) continue;
      const state = getElementState(position, lines[i].StartTime, lines[i].EndTime);
      const distance = Math.abs(i - activeIndex);
      const amount = distance === 0 ? 0 : Math.min(BLUR_MULTIPLIER * distance, max);
      setStyleIfChanged(el, "--BlurAmount", state === "Active" || distance === 0 ? "0px" : `${amount}px`, 0.25);
      promoteLine(el);
    }
  }

  private setLineClasses(line: LineItem, state: ElementState, position: number): void {
    const el = line.HTMLElement;
    setClass(el, "Active", state === "Active");
    setClass(el, "NotSung", state === "NotSung");
    setClass(el, "Sung", state === "Sung");
    if (line.DotLine) setClass(el, "pre-hidden", state === "NotSung" || (state === "Active" && position > line.EndTime - PRE_HIDDEN_DOT_LINE_MS));
    line.Status = state;
  }

  private animateDot(word: TimedItem & { AnimatorStore?: SpringSet }, state: ElementState, percentage: number, dt: number): void {
    if (!word.AnimatorStore) {
      word.AnimatorStore = this.dotSprings();
      word.AnimatorStore.Scale.SetGoal(DotScaleSpline.at(0), true);
      word.AnimatorStore.YOffset.SetGoal(DotYOffsetSpline.at(0), true);
      word.AnimatorStore.Glow.SetGoal(DotGlowSpline.at(0), true);
      word.AnimatorStore.Opacity!.SetGoal(this.DotOpacitySpline.at(0), true);
    }
    const at = state === "Active" ? percentage : state === "NotSung" ? 0 : 1;
    const store = word.AnimatorStore;
    store.Scale.SetGoal(DotScaleSpline.at(at));
    store.YOffset.SetGoal(DotYOffsetSpline.at(at));
    store.Glow.SetGoal(DotGlowSpline.at(at));
    store.Opacity!.SetGoal(this.DotOpacitySpline.at(at));
    const scale = store.Scale.Step(dt);
    const yOffset = store.YOffset.Step(dt) ?? 0;
    const glow = store.Glow.Step(dt);
    const opacity = store.Opacity!.Step(dt);
    setStyleIfChanged(word.HTMLElement, "transform", translate(yOffset), 0.0001, yOffset);
    if (!this.simple) setStyleIfChanged(word.HTMLElement, "scale", `${scale}`, 0.001);
    setStyleIfChanged(word.HTMLElement, "opacity", `${opacity}`, 0.001);
    setStyleIfChanged(word.HTMLElement, "--text-shadow-blur-radius", `${4 + 6 * glow}px`, 0.5);
    setStyleIfChanged(word.HTMLElement, "--text-shadow-opacity", `${glow * 90}%`, 1);
  }

  private writeLetter(letter: TimedItem, scale: number, yOffset: number, glow: number): void {
    setStyleIfChanged(letter.HTMLElement, "transform", translate(yOffset * 2), 0.0001, yOffset * 2);
    setStyleIfChanged(letter.HTMLElement, "scale", `${scale}`, 0.001);
    setStyleIfChanged(letter.HTMLElement, "--text-shadow-blur-radius", `${4 + 12 * glow}px`, 0.5);
    setStyleIfChanged(letter.HTMLElement, "--text-shadow-opacity", `${glow * LETTER_GLOW_MULTIPLIER_OPACITY}%`, 1);
  }

  private gradientProp(): string {
    return this.simple ? "--SLM_GradientPosition" : "--gradient-position";
  }

  private ensureLetterSprings(letter: TimedItem & { AnimatorStore?: SpringSet }): SpringSet {
    if (!letter.AnimatorStore) {
      letter.AnimatorStore = this.letterSprings();
      letter.AnimatorStore.Scale.SetGoal(this.LetterScaleSpline.at(0), true);
      letter.AnimatorStore.YOffset.SetGoal(this.LetterYOffsetSpline.at(0), true);
      letter.AnimatorStore.Glow.SetGoal(GlowSpline.at(0), true);
    }
    return letter.AnimatorStore;
  }

  private animateActiveLetters(word: NonNullable<LineItem["Syllables"]>["Lead"][number], position: number, dt: number): void {
    const letters = word.Letters!;
    let activeIndex = -1;
    let activePercentage = 0;
    for (let i = 0; i < letters.length; i++) {
      if (getElementState(position, letters[i].StartTime, letters[i].EndTime) === "Active") {
        activeIndex = i;
        activePercentage = getProgress(position, letters[i].StartTime, letters[i].EndTime);
        break;
      }
    }
    for (let k = 0; k < letters.length; k++) {
      const letter = letters[k];
      const store = this.ensureLetterSprings(letter);
      let targetScale = this.LetterScaleSpline.at(0);
      let targetYOffset = this.LetterYOffsetSpline.at(0);
      let targetGlow = GlowSpline.at(0);
      const letterState = getElementState(position, letter.StartTime, letter.EndTime);

      if (activeIndex !== -1) {
        const count = this.simple ? getProgress(position, word.StartTime, word.EndTime) : activePercentage;
        const strength = word.TotalTime > SimpleLetterStrength.LongerThan ? SimpleLetterStrength.Longer : SimpleLetterStrength.Shorter;
        const baseScale = this.LetterScaleSpline.at(count) * (this.simple ? strength.Scale : 1);
        const baseYOffset = this.LetterYOffsetSpline.at(count) * (this.simple ? strength.YOffset : 1);
        const baseGlow = GlowSpline.at(count) * (this.simple ? strength.Glow : 1);
        const distance = Math.abs(k - activeIndex);
        const falloff = Math.max(0, 1 / (1 + Math.pow(distance, 2.8)));
        const glowFalloff = Math.max(0, 1 / (1 + distance * 0.9));
        targetScale = this.LetterScaleSpline.at(0) + (baseScale - this.LetterScaleSpline.at(0)) * falloff;
        targetYOffset = this.LetterYOffsetSpline.at(0) + (baseYOffset - this.LetterYOffsetSpline.at(0)) * falloff;
        targetGlow = GlowSpline.at(0) + (baseGlow - GlowSpline.at(0)) * glowFalloff;
      }
      if (letterState === "NotSung" && !this.simple) {
        targetScale = this.LetterScaleSpline.at(0);
        targetYOffset = this.LetterYOffsetSpline.at(0);
        targetGlow = GlowSpline.at(0);
      } else if (letterState === "Sung" && activeIndex === -1) {
        targetGlow = GlowSpline.at(SUNG_LETTER_GLOW);
      }

      const rest = this.simple ? -50 : -20;
      const gradient =
        letterState === "NotSung" ? rest : letterState === "Sung" ? 100 : k === activeIndex ? rest + 120 * easeSinOut(activePercentage) : rest;
      setStyleIfChanged(letter.HTMLElement, this.gradientProp(), `${gradient}%`);

      store.Scale.SetGoal(targetScale);
      store.YOffset.SetGoal(targetYOffset);
      store.Glow.SetGoal(targetGlow);
      this.writeLetter(letter, store.Scale.Step(dt), store.YOffset.Step(dt), store.Glow.Step(dt));
    }
  }

  private restLetters(word: NonNullable<LineItem["Syllables"]>["Lead"][number], dt: number, sung: boolean, track?: (s: SpringSet) => void): void {
    for (const letter of word.Letters!) {
      const store = this.ensureLetterSprings(letter);
      store.Scale.SetGoal(this.LetterScaleSpline.at(sung ? 1 : 0));
      store.YOffset.SetGoal(this.LetterYOffsetSpline.at(sung ? 1 : 0));
      store.Glow.SetGoal(GlowSpline.at(sung ? 1 : 0));
      const scale = store.Scale.Step(dt);
      const yOffset = store.YOffset.Step(dt);
      const glow = store.Glow.Step(dt);
      track?.(store);
      setStyleIfChanged(letter.HTMLElement, this.gradientProp(), sung ? "100%" : this.simple ? "-50%" : "-20%");
      this.writeLetter(letter, scale, yOffset, glow);
    }
  }

  private animateSyllableLine(line: LineItem, position: number, dt: number): void {
    for (let wordIndex = 0; wordIndex < (line.Syllables?.Lead.length ?? 0); wordIndex++) {
      const word = line.Syllables!.Lead[wordIndex];
      const state = getElementState(position, word.StartTime, word.EndTime);
      const percentage = getProgress(position, word.StartTime, word.EndTime);

      if (word.Dot) {
        this.animateDot(word, state, percentage, dt);
        continue;
      }

      if (!word.AnimatorStore) {
        word.AnimatorStore = this.wordSprings();
        word.AnimatorStore.Scale.SetGoal(ScaleSpline.at(0), true);
        word.AnimatorStore.YOffset.SetGoal(this.YOffsetSpline.at(0), true);
        word.AnimatorStore.Glow.SetGoal(GlowSpline.at(0), true);
      }
      const at = state === "Active" ? percentage : state === "NotSung" ? 0 : 1;
      const gradient =
        state === "Active" ? (this.simple ? -50 + 120 * percentage : -20 + 120 * percentage) : state === "NotSung" ? (this.simple ? -50 : -20) : 100;
      const store = word.AnimatorStore;
      store.Scale.SetGoal(ScaleSpline.at(at));
      store.YOffset.SetGoal(this.YOffsetSpline.at(at));
      store.Glow.SetGoal(GlowSpline.at(at));
      const scale = store.Scale.Step(dt);
      const yOffset = store.YOffset.Step(dt);
      const glow = store.Glow.Step(dt);
      if (!this.simple) setStyleIfChanged(word.HTMLElement, "scale", `${scale}`, 0.001);
      setStyleIfChanged(word.HTMLElement, "transform", translate(yOffset), 0.0001, yOffset);
      if (!word.LetterGroup) {
        setStyleIfChanged(word.HTMLElement, this.gradientProp(), `${gradient}%`);
        setStyleIfChanged(word.HTMLElement, "--text-shadow-blur-radius", `${4 + 2 * glow}px`, 0.5);
        setStyleIfChanged(word.HTMLElement, "--text-shadow-opacity", `${Math.min(glow * 35, 100)}%`, 1);
      }

      if (word.LetterGroup && word.Letters) {
        if (state === "Active") this.animateActiveLetters(word, position, dt);
        else this.restLetters(word, dt, state === "Sung");
      }
    }
  }

  // Steps a finished line's words to their sung values. Returns whether every spring rests.
  private settleSyllableLine(line: LineItem, dt: number): boolean {
    let settled = true;
    const track = (springs: SpringSet) => {
      if (!settled) return;
      for (const spring of Object.values(springs)) {
        if (spring?.CanSleep && !spring.CanSleep()) {
          settled = false;
          return;
        }
      }
    };
    for (const word of line.Syllables?.Lead ?? []) {
      if (word.AnimatorStore && word.Dot) {
        this.animateDot(word, "Sung", 1, dt);
        track(word.AnimatorStore);
        continue;
      }
      if (word.AnimatorStore) {
        const store = word.AnimatorStore;
        store.Scale.SetGoal(ScaleSpline.at(1));
        store.YOffset.SetGoal(this.YOffsetSpline.at(1));
        store.Glow.SetGoal(GlowSpline.at(1));
        const scale = store.Scale.Step(dt);
        const yOffset = store.YOffset.Step(dt);
        const glow = store.Glow.Step(dt);
        track(store);
        setStyleIfChanged(word.HTMLElement, "transform", translate(yOffset), 0.0001, yOffset);
        if (!this.simple) setStyleIfChanged(word.HTMLElement, "scale", `${scale}`, 0.001);
        if (!word.LetterGroup) {
          setStyleIfChanged(word.HTMLElement, this.gradientProp(), "100%");
          setStyleIfChanged(word.HTMLElement, "--text-shadow-blur-radius", `${4 + 2 * glow}px`, 0.5);
          setStyleIfChanged(word.HTMLElement, "--text-shadow-opacity", `${Math.min(glow * 35, 100)}%`, 1);
        }
      }
      if (word.LetterGroup && word.Letters) this.restLetters(word, dt, true, track);
    }
    return settled;
  }

  private animateLineType(line: LineItem, state: ElementState, position: number, dt: number): void {
    if (line.DotLine && line.Syllables?.Lead) {
      for (const dot of line.Syllables.Lead) {
        const dotState = getElementState(position, dot.StartTime, dot.EndTime);
        this.animateDot(dot, dotState, getProgress(position, dot.StartTime, dot.EndTime), dt);
      }
      return;
    }
    if (!line.AnimatorStore) {
      line.AnimatorStore = { Glow: this.simple ? noopSpring : new Spring(LineGlowSpline.at(0), LineGlowFrequency, LineGlowDamping) };
      line.AnimatorStore.Glow.SetGoal(LineGlowSpline.at(0), true);
    }
    const percentage = getProgress(position, line.StartTime, line.EndTime);
    line.AnimatorStore.Glow.SetGoal(LineGlowSpline.at(state === "Active" ? percentage : state === "NotSung" ? 0 : 1));
    const glow = line.AnimatorStore.Glow.Step(dt);
    if (!this.simple) {
      const gradient = state === "Active" ? percentage * 100 : state === "NotSung" ? -20 : 100;
      setStyleIfChanged(line.HTMLElement, "--gradient-position", `${gradient}%`);
      setStyleIfChanged(line.HTMLElement, "--text-shadow-blur-radius", `${4 + 8 * glow}px`, 0.5);
      setStyleIfChanged(line.HTMLElement, "--text-shadow-opacity", `${glow * 50}%`, 1);
    }
  }

  frame(rendered: RenderedLyrics, positionMs: number): void {
    const position = positionMs - (this.simple ? SIMPLE_MODE_POSITION_OFFSET : 0);
    const now = this.now();
    const dt = Math.max(0, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    if (rendered !== this.lastRendered) {
      this.lastRendered = rendered;
      this.blurredLine = null;
    }
    if (rendered.type === "Static") return;

    const lines = rendered.lines;
    let mountedLine: HTMLElement | null = null;
    let anyUnsung = false;

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!line.HTMLElement.isConnected) continue;
      const state = getElementState(position, line.StartTime, line.EndTime);
      mountedLine ??= line.HTMLElement;
      if (state !== "Sung") anyUnsung = true;
      if (line.AnimatedState !== state) {
        line.Settling = state === "Sung";
        line.AnimatedState = state;
      }
      this.setLineClasses(line, state, position);

      if (state === "Active" && this.blurredLine !== index) {
        this.applyBlur(lines, index, position);
        this.blurredLine = index;
      }

      if (rendered.type === "Syllable") {
        if (state === "Active") {
          this.animateSyllableLine(line, position, dt);
        } else if (state === "Sung") {
          const next = lines[index + 1];
          const nextState = next ? getElementState(position, next.StartTime, next.EndTime) : null;
          if (line.Settling || !next || nextState === "NotSung" || nextState === "Active") {
            if (this.settleSyllableLine(line, dt)) line.Settling = false;
          }
        }
      } else if (state === "Active") {
        this.animateLineType(line, state, position, dt);
      }
    }

    const content = mountedLine?.closest<HTMLElement>(".LyricsContent");
    if (content) setClass(content, "LinesAllSung", !anyUnsung);
    flushStyles();
  }
}
