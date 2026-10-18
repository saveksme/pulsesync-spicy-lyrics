import type { Settings } from "./core/types.ts";

export type { Settings } from "./core/types.ts";

// Plain schema (no SDK import), so tests and the preview can use it; the SDK
// definition is built from it in settingsDefinition.ts.
export const SETTINGS_SCHEMA = {
  spicyApiKey: {
    type: "text",
    name: "Свой ключ Spicy Lyrics API (необязательно)",
    description:
      "Пословная синхронизация из Spicy Lyrics работает сразу: у аддона есть свой ключ. Свой нужен, только если встроенный упрётся в лимиты: создайте на developers.spicylyrics.org публичный ключ (sl_pk_…) и добавьте в его Allowed origins значение null.",
    default: "",
  },
  spotifyClientId: {
    type: "text",
    name: "Spotify Client ID (необязательно)",
    description:
      "Не обязателен: аддон и так находит трек в Spotify. С ключом приложения с developer.spotify.com поиск идёт через официальный Spotify Web API.",
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
    description: "Родная кнопка текста в плеер-баре открывает Spicy Lyrics (для любой музыки), и отдельная кнопка аддона не нужна. Если выключить, у Spicy Lyrics будет своя кнопка.",
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
