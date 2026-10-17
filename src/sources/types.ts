// Lyrics model, mirroring the Spicy Lyrics API response. All times are in seconds.

export type LyricsSource = "spicy_lyrics" | "apple_music" | "spotify" | "unknown" | "yandex" | "lrclib";

export interface Contributor {
  id: string;
  username: string;
  url: string;
  avatar?: string;
}

export interface UploadAttribution {
  Uploader: Contributor;
  Maker?: Contributor;
}

export interface Syllable {
  Text: string;
  StartTime: number;
  EndTime: number;
  IsPartOfWord: boolean;
}

export interface VocalGroup {
  StartTime: number;
  EndTime: number;
  Syllables: Syllable[];
}

export interface SyllableLine {
  Type: "Vocal";
  OppositeAligned: boolean;
  Lead: VocalGroup;
  Background?: VocalGroup[];
}

export interface LineLine {
  Type: "Vocal";
  OppositeAligned: boolean;
  Text: string;
  StartTime: number;
  EndTime: number;
}

export interface StaticLine {
  Text: string;
}

interface LyricsBase {
  source: LyricsSource;
  SongWriters?: string[];
  UploadAttribution?: UploadAttribution;
}

export interface SyllableLyrics extends LyricsBase {
  Type: "Syllable";
  StartTime: number;
  Content: SyllableLine[];
}

export interface LineLyrics extends LyricsBase {
  Type: "Line";
  StartTime: number;
  Content: LineLine[];
}

export interface StaticLyrics extends LyricsBase {
  Type: "Static";
  Lines: StaticLine[];
}

export type Lyrics = SyllableLyrics | LineLyrics | StaticLyrics;
