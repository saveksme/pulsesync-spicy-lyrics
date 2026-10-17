import type { Host } from "../core/host";
import { hasLyricsText } from "../core/text";
import type {
  Contributor,
  LineLine,
  Lyrics,
  LyricsSource,
  Syllable,
  SyllableLine,
  UploadAttribution,
  VocalGroup,
} from "./types";

// Spicy Lyrics public API: https://developers.spicylyrics.org (GET /v1/lyrics/{spotifyTrackId}).
export const SPICY_API = "https://api.spicylyrics.org/v1/lyrics/";

// This add-on's publishable ("client access") key from developers.spicylyrics.org.
// It is public by design: Spicy Lyrics issues sl_pk_ keys for code shipped to users and
// limits them per viewer. Yandex Music sends Origin: music-application://desktop, which
// Spicy cannot allowlist, so requests go out from a data: worker with Origin: null, the
// origin this key allows (host/opaqueFetch.ts). A key in the settings takes its place.
export const BUILT_IN_SPICY_KEY = "sl_pk_32klmKAfIgnlV31Fwj5L0YFM0JzMIEi_RQCEhtGIcMA";

export function spicyKeyFor(settings: { spicyApiKey: string }): { key: string; builtIn: boolean } {
  const own = settings.spicyApiKey.trim();
  return own ? { key: own, builtIn: false } : { key: BUILT_IN_SPICY_KEY, builtIn: true };
}

export type SpicyResult =
  | { ok: true; lyrics: Lyrics }
  | { ok: false; reason: "no-key" | "not-found" | "unauthorized" | "rate-limited" | "error"; retryAfterSec?: number };

const API_SOURCES: readonly LyricsSource[] = ["spicy_lyrics", "apple_music", "spotify"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isTime = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

// Links end up in href/src, which PulseSync's isolated world refuses for anything but http(s).
const webUrl = (value: unknown): string | undefined =>
  typeof value === "string" && /^https?:\/\//i.test(value.trim()) ? value.trim() : undefined;

function readContributor(value: unknown): Contributor | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.username !== "string") return undefined;
  const avatar = webUrl(value.avatar);
  return {
    id: value.id,
    username: value.username,
    url: webUrl(value.url) ?? `https://spicylyrics.org/uid/${encodeURIComponent(value.id)}`,
    ...(avatar ? { avatar } : {}),
  };
}

function readAttribution(value: unknown): UploadAttribution | undefined {
  if (!isRecord(value)) return undefined;
  const uploader = readContributor(value.Uploader);
  if (!uploader) return undefined;
  const maker = readContributor(value.Maker);
  return maker ? { Uploader: uploader, Maker: maker } : { Uploader: uploader };
}

function readGroup(value: unknown): VocalGroup | null {
  if (!isRecord(value) || !Array.isArray(value.Syllables)) return null;
  const syllables: Syllable[] = value.Syllables.filter(
    (syllable): syllable is Record<string, unknown> =>
      isRecord(syllable) && hasLyricsText(syllable.Text) && isTime(syllable.StartTime) && isTime(syllable.EndTime),
  ).map((syllable) => ({
    Text: syllable.Text as string,
    StartTime: syllable.StartTime as number,
    EndTime: Math.max(syllable.EndTime as number, syllable.StartTime as number),
    IsPartOfWord: syllable.IsPartOfWord === true,
  }));
  if (syllables.length === 0) return null;
  return {
    StartTime: isTime(value.StartTime) ? value.StartTime : syllables[0].StartTime,
    EndTime: isTime(value.EndTime) ? value.EndTime : syllables[syllables.length - 1].EndTime,
    Syllables: syllables,
  };
}

function readSyllableLines(content: unknown[]): SyllableLine[] {
  const lines: SyllableLine[] = [];
  for (const item of content) {
    if (!isRecord(item)) continue;
    const lead = readGroup(item.Lead);
    if (!lead) continue;
    const background = Array.isArray(item.Background)
      ? item.Background.map(readGroup).filter((group): group is VocalGroup => group !== null)
      : [];
    lines.push({
      Type: "Vocal",
      OppositeAligned: item.OppositeAligned === true,
      Lead: lead,
      ...(background.length > 0 ? { Background: background } : {}),
    });
  }
  return lines;
}

function readLineLines(content: unknown[]): LineLine[] {
  return content
    .filter(
      (item): item is Record<string, unknown> =>
        isRecord(item) && hasLyricsText(item.Text) && isTime(item.StartTime) && isTime(item.EndTime),
    )
    .map((item) => ({
      Type: "Vocal",
      OppositeAligned: item.OppositeAligned === true,
      Text: item.Text as string,
      StartTime: item.StartTime as number,
      EndTime: Math.max(item.EndTime as number, item.StartTime as number),
    }));
}

export function normalizeSpicyBody(body: unknown): Lyrics | null {
  if (!isRecord(body)) return null;
  const source: LyricsSource = API_SOURCES.includes(body.source as LyricsSource) ? (body.source as LyricsSource) : "unknown";
  const songWriters = Array.isArray(body.SongWriters)
    ? body.SongWriters.filter((writer): writer is string => typeof writer === "string" && writer.trim() !== "")
    : [];
  const attribution = readAttribution(body.UploadAttribution);
  const meta = {
    source,
    ...(songWriters.length > 0 ? { SongWriters: songWriters } : {}),
    ...(attribution ? { UploadAttribution: attribution } : {}),
  };

  if (body.Type === "Syllable" && Array.isArray(body.Content)) {
    const content = readSyllableLines(body.Content);
    if (content.length === 0) return null;
    return { Type: "Syllable", ...meta, StartTime: isTime(body.StartTime) ? body.StartTime : content[0].Lead.StartTime, Content: content };
  }
  if (body.Type === "Line" && Array.isArray(body.Content)) {
    const content = readLineLines(body.Content);
    if (content.length === 0) return null;
    return { Type: "Line", ...meta, StartTime: isTime(body.StartTime) ? body.StartTime : content[0].StartTime, Content: content };
  }
  if (body.Type === "Static" && Array.isArray(body.Lines)) {
    const lines = body.Lines.filter((line): line is Record<string, unknown> => isRecord(line) && hasLyricsText(line.Text)).map(
      (line) => ({ Text: line.Text as string }),
    );
    if (lines.length === 0) return null;
    return { Type: "Static", ...meta, Lines: lines };
  }
  return null;
}

export async function fetchSpicyLyrics(
  host: Pick<Host, "fetch" | "fetchOpaque">,
  key: string,
  spotifyId: string,
  signal?: AbortSignal,
): Promise<SpicyResult> {
  const token = key.trim();
  if (!token) return { ok: false, reason: "no-key" };

  const url = `${SPICY_API}${encodeURIComponent(spotifyId)}`;
  const init = { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 10_000, signal };
  let response: Response;
  try {
    // Spicy allowlists Origin: null for this add-on's key; the page's own origin is refused.
    response = await (host.fetchOpaque ? host.fetchOpaque(url, init) : host.fetch(url, init));
  } catch {
    return { ok: false, reason: "error" };
  }

  if (response.status === 404) return { ok: false, reason: "not-found" };
  if (response.status === 401 || response.status === 403) return { ok: false, reason: "unauthorized" };
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    return { ok: false, reason: "rate-limited", ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSec: retryAfter } : {}) };
  }
  if (!response.ok) return { ok: false, reason: "error" };

  const payload: unknown = await response.json().catch(() => null);
  const lyrics = normalizeSpicyBody(isRecord(payload) ? payload.Body : null);
  return lyrics ? { ok: true, lyrics } : { ok: false, reason: "not-found" };
}
