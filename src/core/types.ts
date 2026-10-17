export type SourceOrder = "best" | "yandexFirst";
export type BackgroundStyle = "dynamic" | "cover" | "color" | "none";

export interface Settings {
  spicyApiKey: string;
  spotifyClientId: string;
  spotifyClientSecret: string;
  sourceOrder: SourceOrder;
  useSpicy: boolean;
  useYandex: boolean;
  useLrclib: boolean;
  simpleLyricsMode: boolean;
  lineBlur: boolean;
  lineHoverBackground: boolean;
  backgroundStyle: BackgroundStyle;
  useSpicyFont: boolean;
  timingOffsetMs: number;
  replaceNativeLyricsButton: boolean;
}
