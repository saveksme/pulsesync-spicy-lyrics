// Ported from Spicy Lyrics (AGPL-3.0, github.com/Spikerko/spicy-lyrics):
// src/utils/Lyrics/Applyer/Synced/Syllable.ts, Synced/Line.ts, Static.ts,
// src/utils/Lyrics/Applyer/Utils/Emphasize.ts
import type { LineLyrics, Lyrics, StaticLyrics, Syllable, SyllableLyrics } from "../sources/types";
import { buildCredits } from "./credits";
import type { LetterItem, LineItem, RenderedLyrics, WordItem } from "./model";
import { hasLyricsText, isLetterCapable, isRtl, minLetterCapableDuration, splitLetters, stripZeroWidth } from "./text";

export interface BuildOptions {
  simple: boolean;
}

// A gap of at least this many seconds between lines gets an interlude "•••".
export const LYRICS_BETWEEN_SHOW = 3;
export const PRE_HIDDEN_DOT_LINE_MS = 500;
export const INTERLUDE_PADDING_MS = -(PRE_HIDDEN_DOT_LINE_MS + 50);
const IDLE_SCALE = 0.95;
const IDLE_EMPHASIS_SCALE = 0.95;

const ms = (seconds: number) => seconds * 1000;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, ...classes: string[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (classes.length) node.classList.add(...classes);
  return node;
}

export function buildDotLine(startMs: number, endMs: number, opposite: boolean): LineItem {
  const line = element("div", "line", "musical-line");
  if (opposite) line.classList.add("OppositeAligned");
  const group = element("div", "dotGroup");
  const total = endMs - startMs;
  const base = total / 3;
  const pad = INTERLUDE_PADDING_MS / 3;
  const ends = [startMs + base + pad, startMs + base * 2 + pad * 2, startMs + total + INTERLUDE_PADDING_MS];
  const lead: WordItem[] = [];
  let previous = startMs;
  for (const rawEnd of ends) {
    const end = Math.max(previous, rawEnd);
    const dot = element("span", "word", "dot");
    dot.textContent = "•";
    group.appendChild(dot);
    lead.push({ HTMLElement: dot, StartTime: previous, EndTime: end, TotalTime: end - previous, Dot: true });
    previous = end;
  }
  line.appendChild(group);
  return { HTMLElement: line, StartTime: startMs, EndTime: endMs, TotalTime: total, DotLine: true, Syllables: { Lead: lead } };
}

function emphasize(letters: string[], word: HTMLElement, syllable: Syllable, isBackground: boolean, simple: boolean): WordItem {
  const start = ms(syllable.StartTime) - (simple ? -21 : 0);
  const end = ms(syllable.EndTime) - (simple ? -40 : 250);
  const total = end - start;
  const letterDuration = total / letters.length;
  const items: LetterItem[] = letters.map((letter, index) => {
    const span = element("span", "letter", "Emphasis");
    span.textContent = letter;
    if (letter.trim().length === 0) span.classList.add("SpaceLetter");
    if (index === letters.length - 1) span.classList.add("LastLetterInWord");
    if (!simple) span.style.setProperty("--gradient-position", "-20%");
    span.style.setProperty("--text-shadow-opacity", "0%");
    span.style.setProperty("--text-shadow-blur-radius", "4px");
    span.style.scale = String(IDLE_EMPHASIS_SCALE);
    span.style.transform = "translateY(calc(var(--DefaultLyricsSize) * 0.02))";
    word.appendChild(span);
    const letterStart = start + index * letterDuration;
    return {
      HTMLElement: span,
      StartTime: letterStart,
      EndTime: letterStart + letterDuration,
      TotalTime: letterDuration,
      Emphasis: true,
      ...(isBackground ? { BGLetter: true } : {}),
    };
  });
  word.classList.add("letterGroup");
  return { HTMLElement: word, StartTime: start, EndTime: end, TotalTime: total, LetterGroup: true, Letters: items, ...(isBackground ? { BGWord: true } : {}) };
}

// One lead or background group: words, letter groups and IsPartOfWord chains.
function fillWords(lineElement: HTMLElement, syllables: Syllable[], isBackground: boolean, simple: boolean): WordItem[] {
  const words: WordItem[] = [];
  const renderable = syllables.filter((syllable) => hasLyricsText(syllable.Text));
  let group: HTMLElement | null = null;
  renderable.forEach((syllable, index, all) => {
    if (isRtl(syllable.Text)) lineElement.classList.add("rtl");
    const text = stripZeroWidth(syllable.Text);
    const duration = ms(syllable.EndTime) - ms(syllable.StartTime);
    const letters = duration >= minLetterCapableDuration(simple) ? splitLetters(text) : [];
    const isLast = index === all.length - 1;
    let node: HTMLElement;

    if (letters.length > 0 && isLetterCapable(letters.length, duration, simple) && !isRtl(text)) {
      node = element("div");
      words.push(emphasize(letters, node, syllable, isBackground, simple));
      if (!simple) {
        node.style.setProperty("--text-shadow-opacity", "0%");
        node.style.setProperty("--text-shadow-blur-radius", "4px");
        node.style.scale = String(IDLE_EMPHASIS_SCALE);
        node.style.transform = `translateY(calc(var(${isBackground ? "--font-size" : "--DefaultLyricsSize"}) * 0.02))`;
      }
    } else {
      node = element("span", "word");
      if (isBackground) node.classList.add("bg-word");
      node.textContent = text;
      if (!simple) {
        node.style.setProperty("--gradient-position", isBackground ? "0%" : "-20%");
        node.style.setProperty("--text-shadow-opacity", "0%");
        node.style.setProperty("--text-shadow-blur-radius", "4px");
        node.style.scale = String(IDLE_SCALE);
        node.style.transform = `translateY(calc(var(${isBackground ? "--font-size" : "--DefaultLyricsSize"}) * 0.01))`;
      }
      words.push({
        HTMLElement: node,
        StartTime: ms(syllable.StartTime),
        EndTime: ms(syllable.EndTime),
        TotalTime: duration,
        ...(isBackground ? { BGWord: true } : {}),
      });
    }

    if (isLast) node.classList.add("LastWordInLine");
    else if (syllable.IsPartOfWord) node.classList.add("PartOfWord");

    const previous = all[index - 1];
    if (syllable.IsPartOfWord || (previous?.IsPartOfWord && group)) {
      if (!group) {
        group = element("span", "word-group");
        lineElement.appendChild(group);
      }
      group.appendChild(node);
      if (!syllable.IsPartOfWord && previous?.IsPartOfWord) group = null;
    } else {
      group = null;
      lineElement.appendChild(node);
    }
  });
  return words;
}

function createRoot(type: RenderedLyrics["type"]): HTMLElement {
  const root = element("div", "SpicyLyricsScrollContainer");
  root.setAttribute("data-lyrics-type", type);
  return root;
}

function markLastLineSide(root: HTMLElement, opposite: boolean, rtl: boolean) {
  root.classList.toggle("EndsOnOppositeLine", opposite && !rtl);
}

function buildSyllable(data: SyllableLyrics, opts: BuildOptions): RenderedLyrics {
  const root = createRoot("Syllable");
  const content = data.Content.filter(
    (line) => line.Lead.Syllables.some((syllable) => hasLyricsText(syllable.Text)) || line.Background?.some((group) => group.Syllables.some((s) => hasLyricsText(s.Text))),
  );
  root.classList.toggle("HasDuetLines", content.some((line) => line.OppositeAligned));
  root.classList.toggle(
    "HasRtlLines",
    content.some((line) => line.Lead.Syllables.some((s) => isRtl(s.Text)) || Boolean(line.Background?.some((group) => group.Syllables.some((s) => isRtl(s.Text))))),
  );
  const last = content[content.length - 1];
  markLastLineSide(root, Boolean(last?.OppositeAligned), Boolean(last?.Lead.Syllables.some((s) => isRtl(s.Text))));

  const lines: LineItem[] = [];
  if (data.StartTime >= LYRICS_BETWEEN_SHOW) lines.push(buildDotLine(0, ms(data.StartTime), Boolean(content[0]?.OppositeAligned)));

  content.forEach((line, index, all) => {
    const lineElement = element("div", "line");
    if (line.OppositeAligned) lineElement.classList.add("OppositeAligned");
    const item: LineItem = {
      HTMLElement: lineElement,
      StartTime: ms(line.Lead.StartTime),
      EndTime: ms(line.Lead.EndTime),
      TotalTime: ms(line.Lead.EndTime) - ms(line.Lead.StartTime),
    };
    lines.push(item);
    item.Syllables = { Lead: fillWords(lineElement, line.Lead.Syllables, false, opts.simple) };

    for (const background of line.Background ?? []) {
      if (!background.Syllables.some((s) => hasLyricsText(s.Text))) continue;
      const bgElement = element("div", "line", "bg-line");
      if (line.OppositeAligned) bgElement.classList.add("OppositeAligned");
      const bgItem: LineItem = {
        HTMLElement: bgElement,
        StartTime: ms(background.StartTime),
        EndTime: ms(background.EndTime),
        TotalTime: ms(background.EndTime) - ms(background.StartTime),
        BGLine: true,
      };
      lines.push(bgItem);
      bgItem.Syllables = { Lead: fillWords(bgElement, background.Syllables, true, opts.simple) };
    }

    const next = all[index + 1];
    if (next && next.Lead.StartTime - line.Lead.EndTime >= LYRICS_BETWEEN_SHOW) {
      lines.push(buildDotLine(ms(line.Lead.EndTime), ms(next.Lead.StartTime), next.OppositeAligned));
    }
  });

  for (const line of lines) root.appendChild(line.HTMLElement);
  return { type: "Syllable", root, lines, data };
}

function buildLine(data: LineLyrics, opts: BuildOptions): RenderedLyrics {
  const root = createRoot("Line");
  const content = data.Content.filter((line) => hasLyricsText(line.Text));
  root.classList.toggle("HasDuetLines", content.some((line) => line.OppositeAligned));
  root.classList.toggle("HasRtlLines", content.some((line) => isRtl(line.Text)));
  const last = content[content.length - 1];
  markLastLineSide(root, Boolean(last?.OppositeAligned), Boolean(last && isRtl(last.Text)));

  const lines: LineItem[] = [];
  if (data.StartTime >= LYRICS_BETWEEN_SHOW) lines.push(buildDotLine(0, ms(data.StartTime), Boolean(content[0]?.OppositeAligned)));

  content.forEach((line, index, all) => {
    const lineElement = element("div", "line");
    lineElement.textContent = stripZeroWidth(line.Text);
    if (isRtl(line.Text)) lineElement.classList.add("rtl");
    if (line.OppositeAligned) lineElement.classList.add("OppositeAligned");
    const next = all[index + 1];
    // Simple mode holds a line until the next one when the gap is short.
    const end =
      opts.simple && next && next.StartTime - line.EndTime < LYRICS_BETWEEN_SHOW && next.StartTime > line.EndTime ? next.StartTime : line.EndTime;
    lines.push({ HTMLElement: lineElement, StartTime: ms(line.StartTime), EndTime: ms(end), TotalTime: ms(end) - ms(line.StartTime) });
    if (next && next.StartTime - line.EndTime >= LYRICS_BETWEEN_SHOW) {
      lines.push(buildDotLine(ms(line.EndTime), ms(next.StartTime), next.OppositeAligned));
    }
  });

  for (const line of lines) root.appendChild(line.HTMLElement);
  return { type: "Line", root, lines, data };
}

function buildStatic(data: StaticLyrics): RenderedLyrics {
  const root = createRoot("Static");
  const lines = data.Lines.filter((line) => hasLyricsText(line.Text));
  root.classList.toggle("HasRtlLines", lines.some((line) => isRtl(line.Text)));
  const items: LineItem[] = lines.map((line) => {
    const lineElement = element("div", "line", "static");
    lineElement.textContent = stripZeroWidth(line.Text);
    if (isRtl(line.Text)) lineElement.classList.add("rtl");
    root.appendChild(lineElement);
    return { HTMLElement: lineElement, StartTime: 0, EndTime: 0, TotalTime: 0 };
  });
  return { type: "Static", root, lines: items, data };
}

export function buildLyrics(data: Lyrics, opts: BuildOptions): RenderedLyrics {
  const rendered = data.Type === "Syllable" ? buildSyllable(data, opts) : data.Type === "Line" ? buildLine(data, opts) : buildStatic(data);
  for (const credit of buildCredits(data)) rendered.root.appendChild(credit);
  return rendered;
}
