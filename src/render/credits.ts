// Ported from Spicy Lyrics (AGPL-3.0, github.com/Spikerko/spicy-lyrics):
// src/utils/Lyrics/Applyer/Credits/ApplyLyricsCredits.ts, ApplyProvider.ts, ApplyIsByCommunity.tsx
import type { Contributor, Lyrics, LyricsSource } from "../sources/types";

const PROVIDERS: Record<LyricsSource, string> = {
  spicy_lyrics: "Spicy Lyrics",
  apple_music: "Apple Music",
  spotify: "Spotify",
  yandex: "Яндекс Музыка",
  lrclib: "LRCLIB",
  unknown: "Spicy Lyrics",
};

export function providerName(source: LyricsSource): string {
  return PROVIDERS[source] ?? "Spicy Lyrics";
}

function profile(kind: "Maker" | "Uploader", label: string, person: Contributor): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.classList.add(kind);
  const inner = document.createElement("span");
  const labelSpan = document.createElement("span");
  labelSpan.style.opacity = "0.5";
  labelSpan.textContent = `${label} `;
  const link = document.createElement("a");
  link.classList.add("song-info-profile-section");
  link.href = person.url;
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  link.textContent = `@${person.username}`;
  if (person.avatar) {
    const avatar = document.createElement("img");
    avatar.src = person.avatar;
    avatar.alt = "";
    avatar.addEventListener("error", () => (avatar.style.display = "none"), { once: true });
    link.appendChild(avatar);
  }
  inner.append(labelSpan, link);
  wrapper.appendChild(inner);
  return wrapper;
}

export function buildCredits(data: Lyrics): HTMLElement[] {
  const nodes: HTMLElement[] = [];

  if (data.SongWriters?.length) {
    const credits = document.createElement("div");
    credits.classList.add("Credits");
    credits.textContent = `Авторы: ${data.SongWriters.join(", ")}`;
    nodes.push(credits);
  }

  const provider = document.createElement("div");
  provider.classList.add("LyricsProvider");
  provider.textContent = `Текст: ${providerName(data.source)}`;
  nodes.push(provider);

  const attribution = data.source === "spicy_lyrics" ? data.UploadAttribution : undefined;
  if (attribution) {
    const info = document.createElement("div");
    info.classList.add("SongInfo");
    const note = document.createElement("span");
    note.style.opacity = "0.5";
    note.textContent = "Синхронизацию сделало сообщество Spicy Lyrics";
    info.appendChild(note);
    if (attribution.Maker) info.appendChild(profile("Maker", "Синхронизировал", attribution.Maker));
    info.appendChild(profile("Uploader", attribution.Maker ? "Загрузил" : "Синхронизировал", attribution.Uploader));
    nodes.push(info);
  }

  return nodes;
}
