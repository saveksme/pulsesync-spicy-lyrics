import type { Settings } from "./core/types.ts";

export type { Settings } from "./core/types.ts";

// Plain schema (no SDK import), so tests and the preview can use it; the SDK
// definition is built from it in settingsDefinition.ts.
export const SETTINGS_SCHEMA = {
  spicyApiKey: {
    type: "text",
    name: "Ключ Spicy Lyrics API",
    description:
      "Бесплатный ключ с developers.spicylyrics.org (Secret key). Даёт пословную синхронизацию из библиотеки Spicy Lyrics. Без ключа используются тексты Яндекс Музыки и LRCLIB.",
    default: "",
  },
  spotifyClientId: {
    type: "text",
    name: "Spotify Client ID (необязательно)",
    description: "Улучшает поиск трека в библиотеке Spicy Lyrics. Создаётся на developer.spotify.com.",
    default: "",
  },
  spotifyClientSecret: {
    type: "text",
    name: "Spotify Client Secret (необязательно)",
    default: "",
  },
  sourceOrder: {
    type: "select",
    name: "Порядок источников",
    default: "best",
    options: [
      { label: "Лучшее доступное", value: "best" },
      { label: "Сначала Яндекс Музыка", value: "yandexFirst" },
    ],
  },
  useSpicy: { type: "boolean", name: "Использовать Spicy Lyrics", default: true },
  useYandex: { type: "boolean", name: "Использовать тексты Яндекс Музыки", default: true },
  useLrclib: { type: "boolean", name: "Использовать LRCLIB", default: true },
  simpleLyricsMode: {
    type: "boolean",
    name: "Простой режим (Simple Lyrics)",
    description: "Спокойная анимация без подпрыгивания слов, как Simple Lyrics Mode в Spicy.",
    default: false,
  },
  lineBlur: { type: "boolean", name: "Размытие соседних строк", default: true },
  lineHoverBackground: { type: "boolean", name: "Подсветка строки при наведении", default: true },
  backgroundStyle: {
    type: "select",
    name: "Фон",
    default: "dynamic",
    options: [
      { label: "Динамический (как в Spicy)", value: "dynamic" },
      { label: "Обложка", value: "cover" },
      { label: "Цвет обложки", value: "color" },
      { label: "Без фона", value: "none" },
    ],
  },
  useSpicyFont: { type: "boolean", name: "Шрифт Spicy Lyrics", default: true },
  timingOffsetMs: {
    type: "number",
    name: "Сдвиг тайминга, мс",
    description: "Положительное значение — текст раньше, отрицательное — позже.",
    default: 0,
    min: -2000,
    max: 2000,
    step: 10,
  },
  replaceNativeLyricsButton: {
    type: "boolean",
    name: "Открывать Spicy Lyrics вместо родного текста",
    description: "Кнопка текста в плеере Яндекс Музыки будет открывать Spicy Lyrics.",
    default: true,
  },
} as const;

type Schema = typeof SETTINGS_SCHEMA;

export const DEFAULT_SETTINGS: Settings = Object.freeze(
  Object.fromEntries(Object.entries(SETTINGS_SCHEMA).map(([key, setting]) => [key, setting.default])),
) as unknown as Settings;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// PulseSync delivers either raw values or { value, default } entries.
function unwrap(entry: unknown): unknown {
  if (isRecord(entry) && ("value" in entry || "default" in entry)) {
    return entry.value !== undefined ? entry.value : entry.default;
  }
  return entry;
}

function coerce(setting: Schema[keyof Schema], value: unknown): unknown {
  switch (setting.type) {
    case "boolean":
      if (typeof value === "boolean") return value;
      if (value === "true") return true;
      if (value === "false") return false;
      return undefined;
    case "number": {
      const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
      if (typeof number !== "number" || !Number.isFinite(number)) return undefined;
      return Math.min(setting.max, Math.max(setting.min, number));
    }
    case "select":
      return setting.options.some((option) => option.value === value) ? value : undefined;
    case "text":
      return typeof value === "string" ? value.trim() : undefined;
  }
}

export function normalizeSettings(raw: unknown): Settings {
  const source = isRecord(raw) ? raw : {};
  const result: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const [key, setting] of Object.entries(SETTINGS_SCHEMA) as [keyof Schema, Schema[keyof Schema]][]) {
    const value = coerce(setting, unwrap(source[key]));
    if (value !== undefined) result[key] = value;
  }
  return result as unknown as Settings;
}
