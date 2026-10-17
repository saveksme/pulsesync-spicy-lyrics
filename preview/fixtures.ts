import { parseLrc } from "../src/sources/lrc";
import type { Lyrics, Syllable, SyllableLine, VocalGroup } from "../src/sources/types";

// Original demo text (not a real song) that exercises every feature:
// intro dots, letter-split long syllables, word groups, background vocals,
// an interlude, a duet line and Cyrillic.

type Word = [text: string, seconds: number, partOfWord?: boolean];

function group(start: number, words: Word[]): VocalGroup {
  let at = start;
  const syllables: Syllable[] = words.map(([text, seconds, partOfWord]) => {
    const syllable = { Text: text, StartTime: +at.toFixed(3), EndTime: +(at + seconds).toFixed(3), IsPartOfWord: Boolean(partOfWord) };
    at += seconds;
    return syllable;
  });
  return { StartTime: syllables[0].StartTime, EndTime: syllables[syllables.length - 1].EndTime, Syllables: syllables };
}

function line(start: number, words: Word[], opts: { opposite?: boolean; bg?: [number, Word[]] } = {}): SyllableLine {
  return {
    Type: "Vocal",
    OppositeAligned: Boolean(opts.opposite),
    Lead: group(start, words),
    ...(opts.bg ? { Background: [group(opts.bg[0], opts.bg[1])] } : {}),
  };
}

export const syllableDemo: Lyrics = {
  Type: "Syllable",
  source: "spicy_lyrics",
  StartTime: 4,
  SongWriters: ["Demo Writer", "Второй Автор"],
  UploadAttribution: {
    Uploader: { id: "1", username: "spikerko", url: "https://spicylyrics.org/uid/1" },
    Maker: { id: "2", username: "demo-maker", url: "https://spicylyrics.org/uid/2" },
  },
  Content: [
    line(4, [["Midnight", 0.55], ["lights", 0.35], ["are", 0.25], ["calling", 0.45], ["out", 0.3], ["my", 0.3], ["name", 1.3]]),
    line(8.2, [["Город", 0.5], ["спит,", 0.45], ["но", 0.3], ["мы", 0.3], ["не", 0.3], ["спим", 1.4]]),
    line(12.2, [["Hold", 0.4], ["on,", 0.45], ["hold", 0.4], ["on", 0.35], ["to", 0.25], ["the", 0.25], ["sound", 1.1]], {
      bg: [14.2, [["the", 0.35], ["sound", 0.9]]],
    }),
    line(16.6, [["Oooooh,", 2.1], ["we're", 0.35], ["a", 0.2, true], ["li", 0.3, true], ["ve", 0.9]]),
    line(24.5, [["Я", 0.3], ["слышу", 0.55], ["этот", 0.45], ["ритм", 0.45], ["внутри", 1.3]], { opposite: true }),
    line(28.4, [["Let", 0.3], ["it", 0.25], ["burn,", 0.6], ["let", 0.3], ["it", 0.25], ["shi", 0.45, true], ["ine", 1.2]], {
      bg: [30.6, [["(shine)", 1.0]]],
    }),
    line(32.6, [["Wo", 0.35, true], ["o", 0.35, true], ["oah", 1.6], ["ты", 0.3], ["со", 0.3], ["мной", 1.1]]),
    line(37.4, [["Till", 0.35], ["the", 0.25], ["morning", 0.7], ["comes", 1.4]]),
  ],
};

export const lineDemo: Lyrics = parseLrc(
  [
    "[00:04.00]Midnight lights are calling out my name",
    "[00:08.20]Город спит, но мы не спим",
    "[00:12.20]Hold on, hold on to the sound",
    "[00:16.60]Ooooh, we're alive",
    "[00:20.50]",
    "[00:24.50]Я слышу этот ритм внутри",
    "[00:28.40]Let it burn, let it shine",
    "[00:32.60]Woah, ты со мной",
    "[00:37.40]Till the morning comes",
  ].join("\n"),
  { source: "yandex", durationSec: 44 },
)!;

export const staticDemo: Lyrics = {
  Type: "Static",
  source: "lrclib",
  Lines: [
    { Text: "Midnight lights are calling out my name" },
    { Text: "Город спит, но мы не спим" },
    { Text: "Hold on, hold on to the sound" },
    { Text: "Я слышу этот ритм внутри" },
    { Text: "Till the morning comes" },
  ],
};

export const DEMO_DURATION_MS = 44_000;
