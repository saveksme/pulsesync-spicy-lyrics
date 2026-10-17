// Ported from Spicy Lyrics (AGPL-3.0, github.com/Spikerko/spicy-lyrics):
// src/utils/Lyrics/Applyer/Utils/StripZeroWidth.ts, src/utils/Lyrics/EmptyLines.ts

// Zero-width characters that carry no visual meaning (ZWSP, LRM/RLM, word
// joiner, BOM). ZWNJ/ZWJ are kept: they matter in Arabic/Indic scripts and emoji.
const ZERO_WIDTH = /[\u200B\u200E\u200F\u2060\uFEFF]/g;

export function stripZeroWidth(text: string): string {
  return text.replace(ZERO_WIDTH, "");
}

export function hasLyricsText(text: unknown): text is string {
  return typeof text === "string" && stripZeroWidth(text).trim() !== "";
}
