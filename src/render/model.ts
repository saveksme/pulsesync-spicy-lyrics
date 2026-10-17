// Ported from Spicy Lyrics (AGPL-3.0, github.com/Spikerko/spicy-lyrics): src/utils/Lyrics/lyrics.ts
import type { Lyrics } from "../sources/types";

export interface Springish {
  Step(dt: number): number;
  SetGoal(goal: number, replace?: boolean): void;
  CanSleep?(): boolean;
}

export interface SpringSet {
  Scale: Springish;
  YOffset: Springish;
  Glow: Springish;
  Opacity?: Springish;
}

export type ElementState = "NotSung" | "Active" | "Sung";

// All times here are milliseconds.
export interface TimedItem {
  HTMLElement: HTMLElement;
  StartTime: number;
  EndTime: number;
  TotalTime: number;
}

export interface LetterItem extends TimedItem {
  Emphasis?: boolean;
  BGLetter?: boolean;
  AnimatorStore?: SpringSet;
}

export interface WordItem extends TimedItem {
  LetterGroup?: boolean;
  Letters?: LetterItem[];
  BGWord?: boolean;
  Dot?: boolean;
  AnimatorStore?: SpringSet;
}

export interface LineItem extends TimedItem {
  Syllables?: { Lead: WordItem[] };
  DotLine?: boolean;
  BGLine?: boolean;
  AnimatorStore?: { Glow: Springish };
  AnimatedState?: ElementState;
  Settling?: boolean;
  Status?: ElementState;
}

export interface RenderedLyrics {
  type: "Syllable" | "Line" | "Static";
  root: HTMLElement;
  lines: LineItem[];
  data: Lyrics;
}
