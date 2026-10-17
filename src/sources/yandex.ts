import type { Host } from "../core/host";
import type { TrackInfo } from "../core/track";
import { parseLrc } from "./lrc";
import { plainToStatic } from "./shared";
import type { LineLyrics, StaticLyrics, SyllableLyrics } from "./types";

// Yandex Music's own lyrics through PulseSync (resources.getLyrics). The host
// only accepts numeric ids ("123" or "123:456"); UGC tracks have other ids.
export const isYandexLyricsId = (id: string) => /^\d{1,16}(?::\d{1,16})?$/.test(id);

const usable = (track: TrackInfo) => !track.isUgc && isYandexLyricsId(track.id);

export async function fetchYandexSynced(
  host: Pick<Host, "getYandexLyrics">,
  track: TrackInfo,
): Promise<LineLyrics | SyllableLyrics | null> {
  if (!usable(track)) return null;
  const text = await host.getYandexLyrics(track.id, "LRC");
  if (!text) return null;
  return parseLrc(text, { source: "yandex", durationSec: track.durationMs > 0 ? track.durationMs / 1000 : undefined });
}

export async function fetchYandexPlain(host: Pick<Host, "getYandexLyrics">, track: TrackInfo): Promise<StaticLyrics | null> {
  if (!usable(track)) return null;
  return plainToStatic(await host.getYandexLyrics(track.id, "TEXT"), "yandex");
}
