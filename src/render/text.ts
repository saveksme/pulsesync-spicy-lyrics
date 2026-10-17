// Ported from Spicy Lyrics (AGPL-3.0, github.com/Spikerko/spicy-lyrics):
// src/utils/Lyrics/Applyer/Utils/SplitLetters.ts, IsLetterCapable.ts, src/utils/Lyrics/isRtl.ts

export { hasLyricsText, stripZeroWidth } from "../core/text";

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

// Viramas of the Brahmic scripts (Devanagari … Malayalam, Sinhala, Myanmar,
// Khmer), plus ZERO WIDTH JOINER: a grapheme ending in one joins the next.
const JOINERS = new Set(
  [0x094d, 0x09cd, 0x0a4d, 0x0acd, 0x0b4d, 0x0bcd, 0x0c4d, 0x0ccd, 0x0d4d, 0x0dca, 0x1039, 0x17d2, 0x200d].map((code) =>
    String.fromCharCode(code),
  ),
);

// Splits a word into the units letter-by-letter emphasis animates: grapheme
// clusters, so marks stay with their base and emoji stay whole.
export function splitLetters(text: string): string[] {
  const graphemes = segmenter ? Array.from(segmenter.segment(text), (part) => part.segment) : Array.from(text);
  const letters: string[] = [];
  for (const grapheme of graphemes) {
    const last = letters.length - 1;
    if (last >= 0 && JOINERS.has(letters[last].slice(-1)) && grapheme.trim().length > 0) letters[last] += grapheme;
    else letters.push(grapheme);
  }
  return letters;
}

const RTL_RANGES: [number, number][] = [
  [0x0590, 0x05ff],
  [0x0600, 0x06ff],
  [0x0750, 0x077f],
  [0x08a0, 0x08ff],
  [0xfb1d, 0xfb4f],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfeff],
];
const NEUTRAL = /[\d\s,.;:?!()[\]{}"'\\/<>@#$%^&*_=+-]/;

// True when the first strongly directional character is Hebrew or Arabic.
export function isRtl(text: string): boolean {
  if (!text) return false;
  for (const char of text) {
    if (NEUTRAL.test(char)) continue;
    const code = char.codePointAt(0) ?? 0;
    return RTL_RANGES.some(([from, to]) => code >= from && code <= to);
  }
  return false;
}

const MIN_DURATION = 1000;
const SIMPLE_MIN_DURATION = 1050;
const SIMPLE_MAX_LETTERS = 12;

export function minLetterCapableDuration(simple: boolean): number {
  return simple ? SIMPLE_MIN_DURATION : MIN_DURATION;
}

// Long syllables are split into letters that light up one by one.
export function isLetterCapable(letterCount: number, durationMs: number, simple: boolean): boolean {
  if (simple) return letterCount <= SIMPLE_MAX_LETTERS && durationMs >= SIMPLE_MIN_DURATION;
  return durationMs >= MIN_DURATION;
}
