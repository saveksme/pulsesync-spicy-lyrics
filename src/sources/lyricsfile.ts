import { evenSyllables, roundSeconds } from "./shared";
import type { LineLyrics, LyricsSource, Syllable, SyllableLyrics } from "./types";
import { parseYaml } from "./yaml";

// LRCLIB "lyricsfile" v1.0: lines with start_ms/end_ms and optional words.

const LAST_LINE_MS = 6000;

interface FileWord {
  text: string;
  start: number;
  end?: number;
}

interface FileLine {
  text: string;
  start: number;
  end?: number;
  words: FileWord[] | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isMs = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

function readWords(raw: unknown, text: string): FileWord[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const words: FileWord[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.text !== "string" || !isMs(item.start_ms)) return null;
    words.push({ text: item.text, start: item.start_ms, end: isMs(item.end_ms) ? item.end_ms : undefined });
  }
  return words.map((word) => word.text).join("") === text ? words : null;
}

function readLines(raw: unknown[]): FileLine[] {
  const lines: FileLine[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.text !== "string" || !isMs(item.start_ms)) continue;
    lines.push({
      text: item.text,
      start: item.start_ms,
      end: isMs(item.end_ms) && item.end_ms >= item.start_ms ? item.end_ms : undefined,
      words: readWords(item.words, item.text),
    });
  }
  return lines.sort((a, b) => a.start - b.start);
}

function wordSyllables(words: FileWord[], lineEnd: number): Syllable[] {
  const syllables: Syllable[] = [];
  words.forEach((word, index) => {
    if (!word.text.trim()) return;
    const end = word.end ?? words[index + 1]?.start ?? lineEnd;
    const next = words.slice(index + 1).find((candidate) => candidate.text.trim());
    syllables.push({
      Text: word.text.trim(),
      StartTime: roundSeconds(word.start / 1000),
      EndTime: roundSeconds(Math.max(end, word.start) / 1000),
      IsPartOfWord: Boolean(next) && !/\s$/.test(word.text) && !/^\s/.test(next!.text),
    });
  });
  return syllables;
}

export function parseLyricsfile(yaml: string, source: LyricsSource): SyllableLyrics | LineLyrics | null {
  let document: unknown;
  try {
    document = parseYaml(yaml);
  } catch {
    return null;
  }
  if (!isRecord(document) || !Array.isArray(document.lines)) return null;
  if (!(document.version === "1.0" || document.version === 1)) return null;

  const all = readLines(document.lines);
  const lines = all
    .map((line) => {
      const next = all.find((candidate) => candidate.start > line.start);
      const end = line.end ?? next?.start ?? line.start + LAST_LINE_MS;
      return { ...line, end };
    })
    .filter((line) => line.text.trim());
  if (lines.length === 0) return null;

  if (lines.some((line) => line.words)) {
    return {
      Type: "Syllable",
      source,
      StartTime: roundSeconds(lines[0].start / 1000),
      Content: lines.map((line) => {
        const start = roundSeconds(line.start / 1000);
        const end = roundSeconds(line.end / 1000);
        const syllables = line.words ? wordSyllables(line.words, line.end) : evenSyllables(line.text.trim(), start, end);
        return {
          Type: "Vocal",
          OppositeAligned: false,
          Lead: { StartTime: syllables[0]?.StartTime ?? start, EndTime: Math.max(end, ...syllables.map((s) => s.EndTime)), Syllables: syllables },
        };
      }),
    };
  }

  return {
    Type: "Line",
    source,
    StartTime: roundSeconds(lines[0].start / 1000),
    Content: lines.map((line) => ({
      Type: "Vocal",
      OppositeAligned: false,
      Text: line.text.trim(),
      StartTime: roundSeconds(line.start / 1000),
      EndTime: roundSeconds(line.end / 1000),
    })),
  };
}
