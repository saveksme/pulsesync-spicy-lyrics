import { hasLyricsText } from "../core/text";
import type { LyricsSource, StaticLyrics, Syllable } from "./types";

export const roundSeconds = (seconds: number) => Math.round(seconds * 1000) / 1000;

export function plainToStatic(text: string | null | undefined, source: LyricsSource): StaticLyrics | null {
  if (typeof text !== "string") return null;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => hasLyricsText(line))
    .map((line) => ({ Text: line }));
  return lines.length > 0 ? { Type: "Static", source, Lines: lines } : null;
}

// A line without word timings inside word-synced lyrics: spread its words
// across the line in proportion to their length.
export function evenSyllables(text: string, start: number, end: number): Syllable[] {
  const words = text.split(/\s+/).filter(Boolean);
  const total = words.reduce((sum, word) => sum + word.length, 0) || 1;
  let at = start;
  return words.map((word) => {
    const length = ((end - start) * word.length) / total;
    const syllable = { Text: word, StartTime: roundSeconds(at), EndTime: roundSeconds(at + length), IsPartOfWord: false };
    at += length;
    return syllable;
  });
}
