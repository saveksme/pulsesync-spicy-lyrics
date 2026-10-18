export interface TrackInfo {
  id: string;
  albumId?: string;
  title: string;
  version?: string;
  artists: string[];
  // Yandex Music artist ids in the order of `artists`, null for one without a page there
  // (Various artists); absent when none has one.
  artistIds?: (string | null)[];
  album?: string;
  durationMs: number;
  coverUrl?: string;
  averageColor?: string;
  // User uploads and non-music content (podcasts, audiobooks): no catalogue lookups.
  isUgc: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const finite = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

// Yandex cover URIs look like "avatars.yandex.net/get-music-content/…/%%",
// where %% is replaced by the wanted size.
export function coverUrl(coverUri: string | undefined, size = "1000x1000"): string | undefined {
  if (!coverUri) return undefined;
  const sized = coverUri.replace("%%", size);
  return /^https?:\/\//.test(sized) ? sized : `https://${sized.replace(/^\/+/, "")}`;
}

function durationOf(meta: Record<string, unknown>): number {
  const ms = finite(meta.durationMs);
  if (ms !== undefined && ms > 0) return ms;
  const duration = finite(meta.duration);
  if (duration === undefined || duration <= 0) return 0;
  return duration > 10_000 ? duration : duration * 1000;
}

export function toTrackInfo(meta: unknown): TrackInfo | null {
  if (!isRecord(meta) || (typeof meta.id !== "string" && typeof meta.id !== "number")) return null;
  const id = String(meta.id);
  const albums = Array.isArray(meta.albums) ? meta.albums.filter(isRecord) : [];
  const album = albums[0];
  const credits = (Array.isArray(meta.artists) ? meta.artists.filter(isRecord) : []).flatMap((artist) => {
    const name = text(artist.name);
    const id = typeof artist.id === "string" || typeof artist.id === "number" ? String(artist.id) : null;
    return name ? [{ name, id: artist.various === true ? null : id }] : [];
  });
  const artists = credits.map((credit) => credit.name);
  const artistIds = credits.map((credit) => credit.id);
  const version = text(meta.version);
  const albumTitle = album ? (text(album.title) ?? text(album.name)) : undefined;
  const cover = coverUrl(text(meta.coverUri) ?? (album ? text(album.coverUri) : undefined));
  const averageColor = isRecord(meta.derivedColors) ? text(meta.derivedColors.average) : undefined;
  return {
    id,
    ...(album && (typeof album.id === "string" || typeof album.id === "number") ? { albumId: String(album.id) } : {}),
    title: text(meta.title) ?? text(meta.name) ?? "",
    ...(version && !/^https?:\/\//.test(version) ? { version } : {}),
    artists,
    ...(artistIds.some(Boolean) ? { artistIds } : {}),
    ...(albumTitle ? { album: albumTitle } : {}),
    durationMs: durationOf(meta),
    ...(cover ? { coverUrl: cover } : {}),
    ...(averageColor ? { averageColor } : {}),
    isUgc:
      !/^\d+(:\d+)?$/.test(id) ||
      meta.trackSource === "UGC" ||
      meta.isUGC === true ||
      (typeof meta.type === "string" && meta.type !== "music"),
  };
}
