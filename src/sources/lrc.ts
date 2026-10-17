import { evenSyllables, roundSeconds as round } from "./shared";
import type { LineLyrics, LyricsSource, Syllable, SyllableLyrics } from "./types";

const LINE_STAMP = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;
const WORD_STAMP = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;
const OFFSET_TAG = /\[offset:\s*([+-]?\d+(?:\.\d+)?)\s*\]/i;
// Without a following stamp the last line gets this long.
const LAST_LINE_SECONDS = 6;

function stampToSeconds(minutes: string, seconds: string, fraction: string | undefined): number {
  const frac = fraction ? Number(fraction) / 10 ** fraction.length : 0;
  return Number(minutes) * 60 + Number(seconds) + frac;
}

interface Entry {
  time: number;
  text: string;
}

interface WordToken {
  time: number;
  raw: string;
}

function readEntries(text: string, offsetSeconds: number): Entry[] {
  const entries: Entry[] = [];
  for (const row of text.split(/\r?\n/)) {
    let rest = row.trim();
    const times: number[] = [];
    for (let match = LINE_STAMP.exec(rest); match; match = LINE_STAMP.exec(rest)) {
      times.push(Math.max(0, stampToSeconds(match[1], match[2], match[3]) - offsetSeconds));
      rest = rest.slice(match[0].length).trimStart();
    }
    for (const time of times) entries.push({ time: round(time), text: rest });
  }
  return entries.sort((a, b) => a.time - b.time);
}

function readWordTokens(text: string, lineStart: number, offsetSeconds: number): WordToken[] | null {
  WORD_STAMP.lastIndex = 0;
  const tokens: WordToken[] = [];
  let last = 0;
  let lastTime = lineStart;
  let found = false;
  for (let match = WORD_STAMP.exec(text); match; match = WORD_STAMP.exec(text)) {
    found = true;
    const before = text.slice(last, match.index);
    if (before) tokens.push({ time: lastTime, raw: before });
    lastTime = round(Math.max(0, stampToSeconds(match[1], match[2], match[3]) - offsetSeconds));
    tokens.push({ time: lastTime, raw: "" });
    last = match.index + match[0].length;
  }
  if (!found) return null;
  const tail = text.slice(last);
  if (tail) tokens.push({ time: lastTime, raw: tail });
  // Merge each stamp with the text that follows it.
  const merged: WordToken[] = [];
  for (const token of tokens) {
    const previous = merged[merged.length - 1];
    if (previous && previous.raw === "" && token.raw !== "" && previous.time === token.time) previous.raw = token.raw;
    else merged.push({ ...token });
  }
  return merged;
}

function syllablesFromTokens(tokens: WordToken[], lineEnd: number): Syllable[] {
  const syllables: Syllable[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.raw.trim()) continue;
    const nextTime = tokens.slice(i + 1).find((next) => next.time > token.time)?.time ?? lineEnd;
    const next = tokens.slice(i + 1).find((candidate) => candidate.raw.trim());
    syllables.push({
      Text: token.raw.trim(),
      StartTime: token.time,
      EndTime: round(Math.max(nextTime, token.time)),
      IsPartOfWord: Boolean(next) && !/\s$/.test(token.raw) && !/^\s/.test(next!.raw),
    });
  }
  return syllables;
}

export function parseLrc(
  text: string,
  opts: { source: LyricsSource; durationSec?: number },
): LineLyrics | SyllableLyrics | null {
  if (typeof text !== "string" || !text.trim()) return null;
  const offsetMatch = OFFSET_TAG.exec(text);
  const offsetSeconds = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;
  const entries = readEntries(text, offsetSeconds);

  const lines: { start: number; end: number; text: string; words: WordToken[] | null }[] = [];
  entries.forEach((entry, index) => {
    const words = readWordTokens(entry.text, entry.time, offsetSeconds);
    const visible = (words ? words.map((word) => word.raw).join("") : entry.text).trim();
    if (!visible) return;
    const next = entries.slice(index + 1).find((candidate) => candidate.time > entry.time);
    const end = next ? next.time : Math.min(entry.time + LAST_LINE_SECONDS, opts.durationSec ?? Infinity);
    lines.push({ start: entry.time, end: round(Math.max(end, entry.time)), text: visible, words });
  });
  if (lines.length === 0) return null;

  if (lines.some((line) => line.words)) {
    return {
      Type: "Syllable",
      source: opts.source,
      StartTime: lines[0].start,
      Content: lines.map((line) => {
        const syllables = line.words ? syllablesFromTokens(line.words, line.end) : evenSyllables(line.text, line.start, line.end);
        const start = syllables[0]?.StartTime ?? line.start;
        const end = Math.max(line.end, ...syllables.map((syllable) => syllable.EndTime));
        return { Type: "Vocal", OppositeAligned: false, Lead: { StartTime: start, EndTime: end, Syllables: syllables } };
      }),
    };
  }

  return {
    Type: "Line",
    source: opts.source,
    StartTime: lines[0].start,
    Content: lines.map((line) => ({
      Type: "Vocal",
      OppositeAligned: false,
      Text: line.text,
      StartTime: line.start,
      EndTime: line.end,
    })),
  };
}
