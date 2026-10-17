# Spicy Lyrics для Яндекс Музыки — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** аддон PulseSync `web-addon` «Spicy Lyrics», который показывает тексты из Spicy Lyrics API
(с запасными источниками ЯМ и LRCLIB) в интерфейсе, перенесённом из Spicy Lyrics.

**Architecture:** ядро (`sources/`, `render/`, `ui/`, `app/`) работает через интерфейс `Host` и не
знает о PulseSync. `src/host/sdkHost.ts` реализует `Host` через `@pulsesync/addon-sdk`,
`preview/` — через мок. Рендер — это перенос Spicy Lyrics (коммит `56b5e07`). Модули Spicy с
глобальным состоянием превращаются в классы, Spotify-специфика выкидывается.

**Tech Stack:**
- TypeScript 7.0.2, Vite 8.3.4, `@pulsesync/addon-sdk` 0.16.0;
- Vitest 5.0.5 + happy-dom 21.0.3;
- `@kawarp/core` 1.3.1, `cubic-spline` 3.0.3, `d3-ease` 3.0.1.

**Spec:** `docs/superpowers/specs/2026-10-17-spicy-lyrics-ym-design.md`

**Исходники для переноса:** `refs/spicy-lyrics/src/...` (AGPL-3.0). Пути вида `spicy:<путь>:<строки>`
ниже означают `refs/spicy-lyrics/src/<путь>`.

## Global Constraints

- Node ≥ 22.12, пакетный менеджер npm, зависимости фиксированы точными версиями из Tech Stack;
  `react@19.3.1` и `@types/react@19.3.0` нужны только как devDependencies для типов SDK.
- Манифест:
  - `id` и `directoryName` — `"spicy-lyrics"`, `name` — `"Spicy Lyrics"`, `version` — `"1.0.0"`;
  - `type` — `"web-addon"` (ставит SDK), `cssScope` — `"global"`.
- `allowedUrls` — ровно этот список:
  - `https://api.spicylyrics.org`
  - `https://labs.api.listenbrainz.org`
  - `https://lrclib.net`
  - `https://accounts.spotify.com`
  - `https://api.spotify.com`
  - `https://fonts.spikerko.org`
  - `https://avatars.yandex.net`
- Запрещено в коде аддона:
  - создавать `<script>`;
  - писать атрибуты `on*` и `javascript:`-URL;
  - пользоваться `document.write`, `eval` и `new Function`.
- Весь CSS живёт под `#SpicyLyricsPage`, кроме `@font-face`, `@property`, `@keyframes`.
- Время: в модели текста — секунды, в рендере и `PlayerClock` — миллисекунды.
- Колбэки кадров и событий хоста обёрнуты в `try/catch`. Три необработанные ошибки за 10 с выключают аддон.
- Вся сеть идёт через `host.fetch(url, { timeoutMs: 10000, signal })`, без кастомных заголовков,
  кроме `Authorization` (Spicy, Spotify).
- Видимые пользователю строки — на русском.
- Перенесённые файлы начинаются с комментария
  `// Ported from Spicy Lyrics (AGPL-3.0, github.com/Spikerko/spicy-lyrics): <исходный путь>`.
- Константы Spicy:
  - `getLyricsBetweenShow = 3` с;
  - `preHiddenDotLineMs = 500`, `interludePadding = -550` мс;
  - `BlurMultiplier = 1.25`;
  - скролл-пауза `USER_SCROLL_COOLDOWN = 750` мс;
  - упреждение перемотки по клику — 300 мс.
- Git-коммиты делаются только по просьбе пользователя. Вместо шага «Commit» — контрольная точка:
  `npm test` зелёный.

## Review Focus

1. **Быстрое переключение треков**, пока текст загружается: ответ для старого трека не
   рендерится, и на экране не мигает чужой текст. Тест — в Task 7 и Task 15.
2. **Перемотка и пауза при открытом виде.** Перемотка больше 1 с скроллит без анимации; на паузе
   позиция не «уползает»; слова не застревают в Active после отката назад. Тест — в Task 8 и Task 12.
3. **UGC-треки, подкасты и треки без артиста или альбома** (нечисловой id). Нет исключений,
   показывается «Текст не найден». Тест — в Task 7 и Task 8.
4. **Ключ Spicy вставлен с пробелами или переводом строки либо недействителен (401).** Ключ
   обрезается; при 401 уведомление показывается один раз, затем работают запасные источники.
   Тест — в Task 1 и Task 7.
5. **Смена настроек при открытом виде** (Simple-режим, стиль фона, шрифт). Перерисовка без
   дублирования цикла кадров и без утечки слоёв фона. Тест — в Task 15.

---

### Task 1: Каркас проекта, настройки, сборка и доставка

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `addon.config.mjs`, `.gitignore`
- Create: `src/main.ts` (временная заглушка: регистрирует аддон с кнопкой, `start` пишет в лог)
- Create: `src/settings.ts`, `src/core/types.ts` (тип `Settings`), `scripts/deliver.mjs`
- Create: `addon/README.md`, `addon/Assets/logo.svg`, `LICENSE` (полный текст AGPL-3.0 из `refs/spicy-lyrics/LICENSE`)
- Test: `tests/settings.test.ts`

**Interfaces:**
- Produces: `interface Settings`:
  - `spicyApiKey`, `spotifyClientId`, `spotifyClientSecret`: `string`;
  - `sourceOrder`: `"best" | "yandexFirst"`;
  - `useSpicy`, `useYandex`, `useLrclib`: `boolean`;
  - `simpleLyricsMode`, `lineBlur`, `lineHoverBackground`: `boolean`;
  - `backgroundStyle`: `"dynamic" | "cover" | "color" | "none"`;
  - `useSpicyFont`: `boolean`; `timingOffsetMs`: `number`; `replaceNativeLyricsButton`: `boolean`.
- Produces: `DEFAULT_SETTINGS: Settings` — значения по умолчанию из таблицы §8 спецификации.
- Produces: `normalizeSettings(raw: unknown): Settings`.
- Produces: `settingsDefinition` — `defineAddonSettings(...)`. Подписи полей — на русском, по §8.
- Produces: `npm run build`, `npm run deliver`, `npm test`.

- [ ] **Step 1: Write the failing test** `tests/settings.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings";

describe("normalizeSettings", () => {
  it("returns defaults for garbage", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ backgroundStyle: "rainbow", timingOffsetMs: "x" })).toEqual(DEFAULT_SETTINGS);
  });
  it("reads raw and {value, default} shapes", () => {
    const s = normalizeSettings({ simpleLyricsMode: { value: true, default: false }, useLrclib: false });
    expect(s.simpleLyricsMode).toBe(true);
    expect(s.useLrclib).toBe(false);
    expect(normalizeSettings({ lineBlur: { default: false } }).lineBlur).toBe(false);
  });
  it("trims secrets and clamps numbers", () => {
    const s = normalizeSettings({ spicyApiKey: "  sl_sk_abc\n", timingOffsetMs: 99999 });
    expect(s.spicyApiKey).toBe("sl_sk_abc");
    expect(s.timingOffsetMs).toBe(2000);
    expect(normalizeSettings({ timingOffsetMs: "-150" }).timingOffsetMs).toBe(-150);
    expect(normalizeSettings({ useSpicy: "false" }).useSpicy).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/settings.test.ts`. Expected: FAIL (модуль не найден).

- [ ] **Step 3: Implement** `src/settings.ts` и конфигурацию.
  - `vite.config.ts`: `addonPlugin({ manifest: defineAddonManifest(addonConfig), settings: settingsDefinition, entry: "src/main.ts", minify: mode === "development" ? false : "oxc" })`.
  - `vitest.config.ts`: `environment: "node"`. Тестам DOM нужен docblock `/** @vitest-environment happy-dom */`.
    `environmentOptions.happyDOM.settings` — `disableCSSFileLoading: true`,
    `disableJavaScriptFileLoading: true`, `disableIframePageLoading: true`, чтобы тесты не ходили в сеть.
  - `scripts/deliver.mjs`:
    1. копирует `dist/spicy-lyrics` в `%APPDATA%\PulseSync\addons\spicy-lyrics` через staging-папку,
       сохраняя существующий `pulsesync.settings.json`;
    2. отказывается писать, если у цели `installSource === "store"`;
    3. делает `POST http://127.0.0.1:2007/dev/addons/reload?directory=spicy-lyrics` с заголовком
       `X-PulseSync-Addon-Dev: 1` и печатает `{ok, recipients}` либо причину отказа.
  - Скрипты: `build` = `vite build`, `deliver` = `node scripts/deliver.mjs`,
    `dev` = `vite build --watch --mode development` + deliver после каждой сборки (плагин `closeBundle`
    в `vite.config.ts` запускает deliver при `--watch`), `test` = `vitest run`,
    `typecheck` = `tsc --noEmit`.

- [ ] **Step 4: Run** `npm test`. Expected: PASS. Затем `npm run build`. Expected: в
  `dist/spicy-lyrics/` есть `metadata.json` (`type: "web-addon"`, `cssScope: "global"`,
  `allowedUrls` из Global Constraints, объект `settings`), `script.js`, `script.css`.

- [ ] **Step 5: Checkpoint** — `npm test` и `npm run typecheck` зелёные.

---

### Task 2: Модель текста и LRC-парсер

**Files:**
- Create: `src/sources/types.ts`, `src/sources/lrc.ts`
- Test: `tests/lrc.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `type LyricsSource = "spicy_lyrics" | "apple_music" | "spotify" | "unknown" | "yandex" | "lrclib"`;
  - `Contributor {id; username; url; avatar?}`, `UploadAttribution {Uploader: Contributor; Maker?: Contributor}`;
  - `Syllable {Text; StartTime; EndTime; IsPartOfWord: boolean}`;
  - `VocalGroup {StartTime; EndTime; Syllables: Syllable[]}`;
  - `SyllableLine {Type: "Vocal"; OppositeAligned: boolean; Lead: VocalGroup; Background?: VocalGroup[]}`;
  - `LineLine {Type: "Vocal"; OppositeAligned: boolean; Text; StartTime; EndTime}`;
  - `StaticLine {Text}`;
  - `SyllableLyrics {Type: "Syllable"; StartTime; Content: SyllableLine[]}`,
    `LineLyrics {Type: "Line"; StartTime; Content: LineLine[]}`,
    `StaticLyrics {Type: "Static"; Lines: StaticLine[]}`. У всех трёх ещё
    `source: LyricsSource; SongWriters?: string[]; UploadAttribution?`;
  - `type Lyrics = SyllableLyrics | LineLyrics | StaticLyrics`.
  - Все времена — в секундах.
- Produces (`lrc.ts`): `parseLrc(text: string, opts: { source: LyricsSource; durationSec?: number }): LineLyrics | SyllableLyrics | null`.

- [ ] **Step 1: Write the failing test** `tests/lrc.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { parseLrc } from "../src/sources/lrc";

describe("parseLrc", () => {
  it("parses timed lines; end = next stamp; empty lines are gap markers", () => {
    const l = parseLrc("[ar:x]\n[00:01.50]Hello\n[00:04.00]World\n[00:10.00]\n[00:20.25]Again", { source: "yandex", durationSec: 30 })!;
    expect(l.Type).toBe("Line");
    expect(l.StartTime).toBe(1.5);
    expect(l.Content.map((c) => [c.Text, c.StartTime, c.EndTime])).toEqual([
      ["Hello", 1.5, 4], ["World", 4, 10], ["Again", 20.25, 26.25],
    ]);
    expect(l.source).toBe("yandex");
  });
  it("last line ends at min(start + 6, duration)", () => {
    const l = parseLrc("[00:10.00]A", { source: "lrclib", durationSec: 12 })!;
    expect(l.Content[0].EndTime).toBe(12);
  });
  it("handles repeated stamps, [mm:ss:xx], offset and CRLF", () => {
    const l = parseLrc("[offset:+500]\r\n[00:02:00][00:08.00]Chorus\r\n[00:05.00]Verse", { source: "lrclib" })!;
    expect(l.Content.map((c) => [c.Text, c.StartTime])).toEqual([["Chorus", 1.5], ["Verse", 4.5], ["Chorus", 7.5]]);
  });
  it("enhanced LRC word stamps produce Syllable lyrics", () => {
    const s = parseLrc("[00:01.00]<00:01.00>Hel<00:01.40>lo <00:02.00>world<00:03.00>", { source: "lrclib" })!;
    expect(s.Type).toBe("Syllable");
    const syl = (s as any).Content[0].Lead.Syllables;
    expect(syl.map((x: any) => [x.Text, x.StartTime, x.EndTime, x.IsPartOfWord])).toEqual([
      ["Hel", 1, 1.4, true], ["lo", 1.4, 2, false], ["world", 2, 3, false],
    ]);
  });
  it("returns null without timed lines", () => {
    expect(parseLrc("just text", { source: "yandex" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/lrc.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `parseLrc`.
  - Метки:
    - строк — `\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]`; дробь `xx` — сотые, `xxx` — тысячные;
    - слов — `<mm:ss.xx>`.
  - `[offset:±N]` в мс: время строки = метка − N/1000 (по спецификации LRC). Ниже 0 не опускаем.
  - Строки сортируются по времени. Пустые строки служат только концом предыдущей и в вывод не попадают.
  - Слово — это текст между метками `<…>`. `IsPartOfWord` равен `true`, если текст слова не
    кончается пробелом и это не последний слог. `Text` берётся через `trimEnd()`.
  - Если хоть одна строка содержит словесные метки, весь текст становится `Syllable`. Строка без
    меток превращается в один слог.

- [ ] **Step 4: Run** `npx vitest run tests/lrc.test.ts`. Expected: PASS.

---

### Task 3: Парсер LRCLIB lyricsfile

**Files:**
- Create: `src/sources/lyricsfile.ts`
- Test: `tests/lyricsfile.test.ts`

**Interfaces:**
- Consumes: типы из Task 2.
- Produces: `parseLyricsfile(yaml: string, source: LyricsSource): SyllableLyrics | LineLyrics | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseLyricsfile } from "../src/sources/lyricsfile";

const LINES = `version: '1.0'
metadata:
  title: Song
  duration_ms: 202000
lines:
- text: Yeah
  start_ms: 13420
  end_ms: 14810
- text: ''
  start_ms: 14810
  end_ms: 26950
- text: "I've been"
  start_ms: 26950
  end_ms: 28560
`;

const WORDS = `version: '1.0'
lines:
- text: Hello world
  start_ms: 1000
  end_ms: 3000
  words:
  - text: 'Hello '
    start_ms: 1000
    end_ms: 1800
  - text: world
    start_ms: 1800
    end_ms: 3000
`;

describe("parseLyricsfile", () => {
  it("parses line-synced lyricsfile, drops empty lines", () => {
    const l = parseLyricsfile(LINES, "lrclib")!;
    expect(l.Type).toBe("Line");
    expect(l.Content.map((c: any) => [c.Text, c.StartTime, c.EndTime])).toEqual([["Yeah", 13.42, 14.81], ["I've been", 26.95, 28.56]]);
  });
  it("parses word-synced lyricsfile to Syllable", () => {
    const s = parseLyricsfile(WORDS, "lrclib")! as any;
    expect(s.Type).toBe("Syllable");
    expect(s.Content[0].Lead.Syllables.map((x: any) => [x.Text, x.IsPartOfWord])).toEqual([["Hello", false], ["world", false]]);
    expect(s.Content[0].Lead.StartTime).toBe(1);
  });
  it("returns null for unsupported version or garbage", () => {
    expect(parseLyricsfile("version: '2.0'\nlines: []", "lrclib")).toBeNull();
    expect(parseLyricsfile("::::", "lrclib")).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/lyricsfile.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**.
  - Минимальный YAML по отступам: словари, списки `- `, скаляры. Поддерживаются `'…'`
    (экранирование `''`), `"…"` (`\"`, `\\`, `\n`), числа и голые строки. Версия должна быть `1.0`.
  - Слова используются, только если склеенные `words[].text` равны `text`. Иначе строка становится `Line`.

- [ ] **Step 4: Run** `npx vitest run tests/lyricsfile.test.ts`. Expected: PASS.

---

### Task 4: Клиент Spicy Lyrics API

**Files:**
- Create: `src/core/host.ts` (интерфейс `Host`), `src/sources/spicyApi.ts`
- Test: `tests/spicyApi.test.ts`, `tests/helpers/fakeHost.ts`

**Interfaces:**
- Produces (`host.ts`):

```ts
export interface PlayerState { status: string; progressSec: number | null; track: TrackInfo | null; volume: number | null }
export interface Host {
  fetch(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<Response>;
  storage: { get<T>(key: string): Promise<T | undefined>; set(key: string, value: unknown): Promise<void>; remove(key: string): Promise<void> };
  getYandexLyrics(trackId: string, format: "LRC" | "TEXT"): Promise<string | null>;
  onPlayer(listener: (s: PlayerState) => void): () => void;
  seek(sec: number): void; togglePlay(): void; next(): void; previous(): void; setVolume(v: number): void;
  getSettings(): Settings; onSettings(listener: (s: Settings) => void): () => void;
  notify(message: string): void;
  log: { info(...a: unknown[]): void; warn(...a: unknown[]): void; error(...a: unknown[]): void };
}
```

  `TrackInfo` описан в Task 8. В этой задаче он импортируется как тип: создаётся
  `src/core/track.ts` только с интерфейсом, без функций.
- Produces: `type SpicyResult = { ok: true; lyrics: Lyrics } | { ok: false; reason: "no-key" | "not-found" | "unauthorized" | "rate-limited" | "error"; retryAfterSec?: number }`.
- Produces: `fetchSpicyLyrics(host: Pick<Host, "fetch">, key: string, spotifyId: string, signal?: AbortSignal): Promise<SpicyResult>`.
- Produces: `normalizeSpicyBody(body: unknown): Lyrics | null`.
- Produces (`tests/helpers/fakeHost.ts`): `fakeFetch(routes: Record<string, (url: URL, init?: RequestInit) => Response | Promise<Response>>)`
  (ключ — префикс URL; без совпадения отвечает 404), `memoryStorage()`, `fakeHost(overrides?: Partial<Host>): Host`.
  Умолчания `fakeHost`:
  - `fetch` — `fakeFetch({})`;
  - `storage` — `memoryStorage()`;
  - `getYandexLyrics` — `null`;
  - `onPlayer` и `onSettings` возвращают пустую отписку;
  - `getSettings` — `DEFAULT_SETTINGS`;
  - команды плеера, `notify` и `log` ничего не делают.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { fetchSpicyLyrics, normalizeSpicyBody } from "../src/sources/spicyApi";
import { fakeFetch } from "./helpers/fakeHost";

const syllableBody = { Type: "Syllable", StartTime: 7.3, source: "spicy_lyrics", SongWriters: ["A"],
  UploadAttribution: { Uploader: { id: "1", username: "up", url: "https://spicylyrics.org/uid/1" } },
  Content: [{ Type: "Vocal", OppositeAligned: false, Lead: { StartTime: 7.3, EndTime: 9, Syllables: [
    { Text: "Hi", StartTime: 7.3, EndTime: 8, IsPartOfWord: false }, { Text: "  ", StartTime: 8, EndTime: 9, IsPartOfWord: false }] } }] };

describe("spicy api", () => {
  it("sends bearer key to /v1/lyrics/{id}", async () => {
    let seen = "";
    const host = { fetch: fakeFetch({ "https://api.spicylyrics.org/v1/lyrics/": (u, init) => {
      seen = `${u.pathname} ${(init?.headers as any).Authorization}`;
      return Response.json({ Body: syllableBody, Status: 200, Type: "object" });
    } }) };
    const r = await fetchSpicyLyrics(host, "sl_sk_k", "1QV6tiMFM6fSOKOGLMHYYg");
    expect(seen).toBe("/v1/lyrics/1QV6tiMFM6fSOKOGLMHYYg Bearer sl_sk_k");
    expect(r.ok && r.lyrics.Type).toBe("Syllable");
  });
  it("maps errors", async () => {
    const mk = (status: number, headers = {}) => ({ fetch: fakeFetch({ "https://api.spicylyrics.org/": () => new Response("{}", { status, headers }) }) });
    expect(await fetchSpicyLyrics(mk(404), "k", "x")).toEqual({ ok: false, reason: "not-found" });
    expect(await fetchSpicyLyrics(mk(401), "k", "x")).toEqual({ ok: false, reason: "unauthorized" });
    expect(await fetchSpicyLyrics(mk(403), "k", "x")).toEqual({ ok: false, reason: "unauthorized" });
    expect(await fetchSpicyLyrics(mk(429, { "Retry-After": "30" }), "k", "x")).toEqual({ ok: false, reason: "rate-limited", retryAfterSec: 30 });
    expect(await fetchSpicyLyrics(mk(502), "k", "x")).toEqual({ ok: false, reason: "error" });
    expect(await fetchSpicyLyrics(mk(200), "", "x")).toEqual({ ok: false, reason: "no-key" });
  });
  it("normalizes body: drops empty syllables, keeps attribution, unknown source -> unknown", () => {
    const l = normalizeSpicyBody({ ...syllableBody, source: "weird" }) as any;
    expect(l.Content[0].Lead.Syllables).toHaveLength(1);
    expect(l.source).toBe("unknown");
    expect(l.UploadAttribution.Uploader.username).toBe("up");
    expect(normalizeSpicyBody({ Type: "Line", Content: [] })).toBeNull();
    expect(normalizeSpicyBody({ Type: "Static", Lines: [{ Text: "a" }], source: "spotify" })!.Type).toBe("Static");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/spicyApi.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**.
  - `normalizeSpicyBody`:
    - пустые записи отсекаются по правилам `spicy:utils/Lyrics/EmptyLines.ts` (нет текста после
      удаления zero-width символов и `trim`);
    - текст без строк — `null`;
    - `StartTime` по умолчанию — старт первой строки.
  - Таймаут запроса — 10 000 мс.

- [ ] **Step 4: Run** `npx vitest run tests/spicyApi.test.ts`. Expected: PASS.

---

### Task 5: Spotify ID по треку ЯМ

**Files:**
- Create: `src/sources/spotifyId.ts`
- Test: `tests/spotifyId.test.ts`

**Interfaces:**
- Consumes: `Host` (Task 4), `TrackInfo` (Task 8; поля `id`, `title`, `version?`, `artists`,
  `album?`, `durationMs`, `isUgc`).
- Produces: `normalizeTitle(s: string): string`. Переводит в нижний регистр, `ё`→`е`, убирает
  `(feat…)`/`[…]`/` - Remaster…`, оставляет только `\p{L}\p{N}`.
- Produces: `pickSpotifyCandidate(track: TrackInfo, items: SpotifyItem[]): string | null`, где
  `SpotifyItem = { id: string; name: string; duration_ms: number; artists: { name: string }[] }`.
- Produces: `type SpotifyIdResolver = { resolve(track: TrackInfo, signal?: AbortSignal): Promise<string | null> }`.
- Produces: `createSpotifyIdResolver(host: Pick<Host, "fetch" | "storage">, creds: () => { clientId: string; clientSecret: string }): SpotifyIdResolver`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { createSpotifyIdResolver, normalizeTitle, pickSpotifyCandidate } from "../src/sources/spotifyId";
import { fakeFetch, memoryStorage } from "./helpers/fakeHost";

const track = { id: "123", title: "Хочешь?", artists: ["Земфира"], album: "Прости меня моя любовь", durationMs: 220000, isUgc: false } as any;

describe("spotify id", () => {
  it("normalizes titles", () => {
    expect(normalizeTitle("Ёлка (feat. X) - Remastered 2011")).toBe("елка");
  });
  it("picks by title, artist and duration", () => {
    const items = [
      { id: "a", name: "Хочешь? (Live)", duration_ms: 300000, artists: [{ name: "Земфира" }] },
      { id: "b", name: "Хочешь?", duration_ms: 221500, artists: [{ name: "Zemfira" }, { name: "Земфира" }] },
    ];
    expect(pickSpotifyCandidate(track, items)).toBe("b");
    expect(pickSpotifyCandidate(track, [items[0]])).toBeNull();
  });
  it("uses ListenBrainz first and caches", async () => {
    let calls = 0;
    const host = { storage: memoryStorage(), fetch: fakeFetch({
      "https://labs.api.listenbrainz.org/": () => { calls++; return Response.json([{ spotify_track_ids: ["4wwqUoX7OweabhkpP2kaTS"] }]); } }) };
    const r = createSpotifyIdResolver(host, () => ({ clientId: "", clientSecret: "" }));
    expect(await r.resolve(track)).toBe("4wwqUoX7OweabhkpP2kaTS");
    expect(await r.resolve(track)).toBe("4wwqUoX7OweabhkpP2kaTS");
    expect(calls).toBe(1);
  });
  it("falls back to Spotify search with client credentials", async () => {
    const host = { storage: memoryStorage(), fetch: fakeFetch({
      "https://labs.api.listenbrainz.org/": () => Response.json([{ spotify_track_ids: [] }]),
      "https://accounts.spotify.com/api/token": () => Response.json({ access_token: "T", expires_in: 3600 }),
      "https://api.spotify.com/v1/search": () => Response.json({ tracks: { items: [
        { id: "sp1", name: "Хочешь?", duration_ms: 219000, artists: [{ name: "Земфира" }] }] } }) }) };
    const r = createSpotifyIdResolver(host, () => ({ clientId: "id", clientSecret: "sec" }));
    expect(await r.resolve(track)).toBe("sp1");
  });
  it("returns null for UGC without network", async () => {
    const r = createSpotifyIdResolver({ storage: memoryStorage(), fetch: fakeFetch({}) }, () => ({ clientId: "", clientSecret: "" }));
    expect(await r.resolve({ ...track, isUgc: true })).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/spotifyId.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**.
  - Порядок попыток:
    1. кэш `spotifyId:<ymId>` в `storage`: `{id, at}`; найденное живёт 30 дней, `null` — 1 день;
    2. ListenBrainz с параметрами `artist_name=artists[0]`, `release_name=album`, `track_name=title`;
    3. ListenBrainz без `release_name`;
    4. если есть ключи — Spotify Search, `q=track:"<title>" artist:"<artists[0]>"`, `type=track`, `limit=5`;
    5. повтор шагов 2–4 с `title + " " + version`, если `version` есть.
  - Токен Spotify кэшируется в памяти до `expires_in − 60` с. Запрос `POST` с телом
    `grant_type=client_credentials` и заголовком `Authorization: Basic base64(id:secret)`.
  - `pickSpotifyCandidate`:
    - отбрасывает кандидатов с разницей длительности больше 3000 мс;
    - очки: название (равно — 3, содержит — 2) плюс артист (равен — 2, содержит — 1);
    - нужно минимум 4 очка, при равенстве выигрывает меньшая разница длительности.
  - Сетевые ошибки дают `null` и не кэшируются.

- [ ] **Step 4: Run** `npx vitest run tests/spotifyId.test.ts`. Expected: PASS.

---

### Task 6: Источники ЯМ и LRCLIB

**Files:**
- Create: `src/sources/yandex.ts`, `src/sources/lrclib.ts`
- Test: `tests/yandex.test.ts`, `tests/lrclib.test.ts`

**Interfaces:**
- Consumes: `parseLrc` (Task 2), `parseLyricsfile` (Task 3), `Host`, `TrackInfo`.
- Produces: `isYandexLyricsId(id: string): boolean` (`/^\d{1,16}(?::\d{1,16})?$/`).
- Produces: `fetchYandexSynced(host, track): Promise<LineLyrics | SyllableLyrics | null>` и
  `fetchYandexPlain(host, track): Promise<StaticLyrics | null>`.
- Produces: `interface LrclibRecord { id: number; trackName: string; artistName: string; albumName?: string; duration: number; instrumental: boolean; plainLyrics?: string | null; syncedLyrics?: string | null; lyricsfile?: string | null; hasWordSync?: boolean }`.
- Produces: `fetchLrclib(host, track, signal?): Promise<LrclibRecord | null>`.
- Produces: `pickLrclibCandidate(track, items: LrclibRecord[]): LrclibRecord | null`.
- Produces: `lrclibToLyrics(rec, durationSec): { word: SyllableLyrics | null; synced: LineLyrics | SyllableLyrics | null; plain: StaticLyrics | null }`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/yandex.test.ts
import { describe, expect, it } from "vitest";
import { fetchYandexPlain, fetchYandexSynced, isYandexLyricsId } from "../src/sources/yandex";
const t = { id: "123", title: "T", artists: ["A"], durationMs: 60000, isUgc: false } as any;
describe("yandex", () => {
  it("validates ids", () => {
    expect(isYandexLyricsId("123")).toBe(true);
    expect(isYandexLyricsId("123:456")).toBe(true);
    expect(isYandexLyricsId("f1e2-uuid")).toBe(false);
  });
  it("parses native LRC and plain text", async () => {
    const host = { getYandexLyrics: async (_id: string, f: string) => (f === "LRC" ? "[00:01.00]a\n[00:02.00]b" : "a\n\nb\n") };
    expect((await fetchYandexSynced(host as any, t))!.source).toBe("yandex");
    expect((await fetchYandexPlain(host as any, t))!.Lines.map((l) => l.Text)).toEqual(["a", "b"]);
  });
  it("skips UGC ids without calling host", async () => {
    const host = { getYandexLyrics: async () => { throw new Error("must not be called"); } };
    expect(await fetchYandexSynced(host as any, { ...t, id: "uuid-x", isUgc: true })).toBeNull();
  });
});
```

```ts
// tests/lrclib.test.ts
import { describe, expect, it } from "vitest";
import { fetchLrclib, lrclibToLyrics, pickLrclibCandidate } from "../src/sources/lrclib";
import { fakeFetch } from "./helpers/fakeHost";
const t = { id: "1", title: "Song", artists: ["Art"], album: "Alb", durationMs: 200400, isUgc: false } as any;
const rec = (o: any) => ({ id: 1, trackName: "Song", artistName: "Art", duration: 200, instrumental: false, ...o });
describe("lrclib", () => {
  it("get with duration, falls back to search on 404", async () => {
    const urls: string[] = [];
    const host = { fetch: fakeFetch({
      "https://lrclib.net/api/get": (u) => { urls.push(u.search); return new Response("{}", { status: 404 }); },
      "https://lrclib.net/api/search": () => Response.json([rec({ duration: 260, syncedLyrics: "[00:01.00]x" }), rec({ syncedLyrics: "[00:01.00]y" })]) }) };
    const r = await fetchLrclib(host as any, t);
    expect(urls[0]).toContain("duration=200");
    expect(r!.syncedLyrics).toBe("[00:01.00]y");
  });
  it("prefers word sync within 10s, rejects instrumental", () => {
    const pick = pickLrclibCandidate(t, [rec({ instrumental: true, syncedLyrics: "x" }), rec({ syncedLyrics: "s" }), rec({ duration: 207, hasWordSync: true, lyricsfile: "version: '1.0'\nlines: []" })]);
    expect(pick!.hasWordSync).toBe(true);
  });
  it("converts record to lyrics", () => {
    const out = lrclibToLyrics(rec({ syncedLyrics: "[00:01.00]a\n[00:02.00]b", plainLyrics: "a\nb" }), 200);
    expect(out.word).toBeNull();
    expect(out.synced!.Type).toBe("Line");
    expect(out.plain!.Lines).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/yandex.test.ts tests/lrclib.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**.
  - LRCLIB:
    - `get` с параметрами `track_name`, `artist_name=artists[0]`, `album_name` (если есть) и
      `duration=round(durationMs/1000)`;
    - при 404 — `search` с `track_name` и `artist_name`;
    - без кастомных заголовков.
  - Отбор кандидатов:
    - выбрасываем `instrumental` и записи без lyrics;
    - допуск по длительности: ±10 с при `hasWordSync`, иначе ±2 с;
    - порядок: сначала `hasWordSync`, потом наличие `syncedLyrics`, потом меньшая разница длительности.
  - `lrclibToLyrics.word` — это `parseLyricsfile`, если получился `Syllable`. `synced` — это
    `parseLrc(syncedLyrics)` либо `Line`-вариант lyricsfile. `plain` — непустые строки `plainLyrics`.
  - Источник у всех — `"lrclib"`.

- [ ] **Step 4: Run** `npx vitest run tests/yandex.test.ts tests/lrclib.test.ts`. Expected: PASS.

---

### Task 7: Цепочка источников и кэш

**Files:**
- Create: `src/sources/resolve.ts`
- Test: `tests/resolve.test.ts`

**Interfaces:**
- Consumes: задачи 4–6.
- Produces: `type StepId = "spicy" | "lrclibWord" | "yandexSynced" | "lrclibSynced" | "yandexPlain" | "lrclibPlain"`.
- Produces: `sourceSteps(s: Settings): StepId[]`:
  - `best` — порядок §4.5;
  - `yandexFirst` переставляет `yandexSynced` на первое место;
  - отключённые источники убираются; `spicy` исключается, если пуст `spicyApiKey`.
- Produces: `createLyricsResolver(host: Host, deps?: { spotify?: SpotifyIdResolver }): LyricsResolver`, где
  `LyricsResolver = { get(track: TrackInfo, signal: AbortSignal): Promise<Lyrics | null>; clear(): void }`.
  - Кэш:
    - в памяти — `Map`;
    - в `storage` — ключ `lyrics:<id>` со значением `{v: 1, at, lyrics}` и индекс `lyrics:index`
      (≤ 40 id, вытесняется самый старый);
    - TTL 3 дня; промахи держатся в памяти 10 минут.
  - Параллельные `get` одного трека склеиваются.
  - `unauthorized` от Spicy вызывает `host.notify("Ключ Spicy Lyrics недействителен — использую другие источники")`
    один раз до смены ключа, после чего `spicy` пропускается.
  - `rate-limited` пропускает `spicy` до `now + retryAfterSec`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { createLyricsResolver, sourceSteps } from "../src/sources/resolve";
import { DEFAULT_SETTINGS } from "../src/settings";
import { fakeFetch, fakeHost } from "./helpers/fakeHost";

const track = { id: "42", title: "T", artists: ["A"], durationMs: 100000, isUgc: false } as any;
const lrc = "[00:01.00]a\n[00:02.00]b";

describe("resolver", () => {
  it("orders steps", () => {
    expect(sourceSteps(DEFAULT_SETTINGS)).toEqual(["lrclibWord", "yandexSynced", "lrclibSynced", "yandexPlain", "lrclibPlain"]);
    expect(sourceSteps({ ...DEFAULT_SETTINGS, spicyApiKey: "k" })[0]).toBe("spicy");
    expect(sourceSteps({ ...DEFAULT_SETTINGS, spicyApiKey: "k", sourceOrder: "yandexFirst" })[0]).toBe("yandexSynced");
    expect(sourceSteps({ ...DEFAULT_SETTINGS, useLrclib: false })).toEqual(["yandexSynced", "yandexPlain"]);
  });
  it("falls through to yandex and caches; dedupes concurrent calls", async () => {
    const getYandexLyrics = vi.fn(async () => lrc);
    const host = fakeHost({ getYandexLyrics, fetch: fakeFetch({ "https://lrclib.net/": () => new Response("{}", { status: 404 }) }) });
    const r = createLyricsResolver(host);
    const [a, b] = await Promise.all([r.get(track, new AbortController().signal), r.get(track, new AbortController().signal)]);
    expect(a!.source).toBe("yandex");
    expect(b).toBe(a);
    await r.get(track, new AbortController().signal);
    expect(getYandexLyrics).toHaveBeenCalledTimes(1);
  });
  it("notifies once on invalid key and falls back", async () => {
    const notify = vi.fn();
    const host = fakeHost({ notify, getSettings: () => ({ ...DEFAULT_SETTINGS, spicyApiKey: "bad", useLrclib: false }),
      getYandexLyrics: async () => lrc,
      fetch: fakeFetch({ "https://labs.api.listenbrainz.org/": () => Response.json([{ spotify_track_ids: ["x".repeat(22)] }]),
        "https://api.spicylyrics.org/": () => new Response("{}", { status: 401 }) }) });
    const r = createLyricsResolver(host);
    expect((await r.get(track, new AbortController().signal))!.source).toBe("yandex");
    r.clear();
    await r.get({ ...track, id: "43" }, new AbortController().signal);
    expect(notify).toHaveBeenCalledTimes(1);
  });
  it("aborted request resolves null and caches nothing", async () => {
    const ac = new AbortController();
    const host = fakeHost({ getYandexLyrics: () => new Promise((res) => setTimeout(() => res(lrc), 20)) });
    const r = createLyricsResolver(host);
    const p = r.get(track, ac.signal);
    ac.abort();
    expect(await p).toBeNull();
  });
  it("UGC track resolves null without throwing", async () => {
    const r = createLyricsResolver(fakeHost({ fetch: fakeFetch({ "https://lrclib.net/": () => new Response("{}", { status: 404 }) }) }));
    expect(await r.get({ ...track, id: "u-u-i-d", isUgc: true, artists: [] }, new AbortController().signal)).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/resolve.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**.
  - В пределах одного вызова `get` запись LRCLIB и LRC от ЯМ загружаются один раз (мемоизация).
  - Каждый шаг проверяет `signal.aborted` до и после `await`.
  - Ошибки шагов логируются через `host.log.warn` и не всплывают наружу.

- [ ] **Step 4: Run** `npx vitest run tests/resolve.test.ts`. Expected: PASS.

---

### Task 8: TrackInfo и PlayerClock

**Files:**
- Modify: `src/core/track.ts` (добавить функции)
- Create: `src/core/PlayerClock.ts`
- Test: `tests/track.test.ts`, `tests/clock.test.ts`

**Interfaces:**
- Produces: `interface TrackInfo { id: string; albumId?: string; title: string; version?: string; artists: string[]; album?: string; durationMs: number; coverUrl?: string; averageColor?: string; isUgc: boolean }`.
- Produces: `toTrackInfo(meta: unknown): TrackInfo | null`.
- Produces: `coverUrl(coverUri: string | undefined, size?: string): string | undefined`; размер по умолчанию `"1000x1000"`.
- Produces: `class PlayerClock`:
  - `constructor(now?: () => number)`;
  - `offsetMs: number`;
  - `update(s: { progressSec: number | null; status: string }): { seeked: boolean }`;
  - `getPositionMs(): number`;
  - `get isPlaying(): boolean`;
  - `reset(): void`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/track.test.ts
import { describe, expect, it } from "vitest";
import { coverUrl, toTrackInfo } from "../src/core/track";
describe("track", () => {
  it("maps YM meta", () => {
    const t = toTrackInfo({ id: "123", title: "Song", version: "Remix", durationMs: 200000,
      artists: [{ name: "A" }, { name: "B" }], albums: [{ id: 9, title: "Alb" }],
      coverUri: "avatars.yandex.net/get-music-content/1/ab/%%", derivedColors: { average: "#112233" } })!;
    expect(t).toMatchObject({ id: "123", albumId: "9", title: "Song", version: "Remix", artists: ["A", "B"], album: "Alb",
      durationMs: 200000, averageColor: "#112233", isUgc: false });
    expect(t.coverUrl).toBe("https://avatars.yandex.net/get-music-content/1/ab/1000x1000");
  });
  it("handles UGC/podcasts and missing fields", () => {
    expect(toTrackInfo({ id: "a1b2-uuid", title: "x" })!.isUgc).toBe(true);
    expect(toTrackInfo({ id: "1", title: "x", duration: 180 })!.durationMs).toBe(180000);
    expect(toTrackInfo(null)).toBeNull();
    expect(coverUrl(undefined)).toBeUndefined();
  });
});
```

```ts
// tests/clock.test.ts
import { describe, expect, it } from "vitest";
import { PlayerClock } from "../src/core/PlayerClock";
describe("PlayerClock", () => {
  it("interpolates while playing, freezes when paused", () => {
    let t = 1000; const c = new PlayerClock(() => t);
    c.update({ progressSec: 10, status: "playing" });
    t += 250; expect(c.getPositionMs()).toBe(10250);
    c.update({ progressSec: 10.25, status: "paused" });
    t += 5000; expect(c.getPositionMs()).toBe(10250);
  });
  it("does not step back by small corrections, detects seeks, applies offset", () => {
    let t = 0; const c = new PlayerClock(() => t);
    c.update({ progressSec: 5, status: "playing" });
    t = 300; expect(c.getPositionMs()).toBe(5300);
    expect(c.update({ progressSec: 5.25, status: "playing" }).seeked).toBe(false);
    expect(c.getPositionMs()).toBe(5300);
    expect(c.update({ progressSec: 60, status: "playing" }).seeked).toBe(true);
    expect(c.getPositionMs()).toBe(60000);
    expect(c.update({ progressSec: 2, status: "playing" }).seeked).toBe(true);
    expect(c.getPositionMs()).toBe(2000);
    c.offsetMs = 200; expect(c.getPositionMs()).toBe(2200);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/track.test.ts tests/clock.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**.
  - `durationMs`: если есть `durationMs`, берём его; иначе `duration`: значение > 10000 трактуем
    как мс, остальное как секунды.
  - `isUgc`: `!/^\d+(:\d+)?$/.test(id) || meta.trackSource === "UGC"`.
  - `PlayerClock`:
    - прогноз = `base + (now − at)`, если играет;
    - перемотка = расхождение с прогнозом больше 1000 мс;
    - удержание: если новое значение меньше показанного не больше чем на 80 мс и это не перемотка,
      возвращается показанное.

- [ ] **Step 4: Run** `npx vitest run tests/track.test.ts tests/clock.test.ts`. Expected: PASS.

---

### Task 9: Примитивы рендера (порт)

**Files:**
- Create: `src/render/Spring.ts` — порт `spicy:modules/Spring.ts` целиком; MIT-атрибуция spr.
- Create: `src/render/Spline.ts` — `getSpline(points: {Time: number; Value: number}[])` через `cubic-spline`.
- Create: `src/render/text.ts` — функции из `spicy:utils/Lyrics/Applyer/Utils/{SplitLetters,StripZeroWidth,IsLetterCapable}.ts`,
  `spicy:utils/Lyrics/isRtl.ts`, `spicy:utils/Lyrics/EmptyLines.ts` (`HasLyricsText`, `HasRenderableText`, `IsEmptySyllableGroup`).
- Test: `tests/renderPrimitives.test.ts`

**Interfaces:**
- Produces:
  - `class Spring { constructor(start: number, frequency: number, damping: number); Step(dt: number): number; SetGoal(goal: number, replace?: boolean): void; CanSleep(): boolean }`;
  - `getSpline(points): { at(x: number): number }`;
  - `splitLetters(s: string): string[]`; `stripZeroWidth(s: string): string`; `isRtl(s: string): boolean`;
  - `isLetterCapable(letters: number, durationMs: number, simple: boolean): boolean`;
  - `minLetterCapableDuration(simple: boolean): number`;
  - `hasLyricsText(s: unknown): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { Spring } from "../src/render/Spring";
import { getSpline } from "../src/render/Spline";
import { isLetterCapable, isRtl, minLetterCapableDuration, splitLetters, stripZeroWidth } from "../src/render/text";

describe("render primitives", () => {
  it("spring settles on goal", () => {
    const s = new Spring(0, 0.88, 0.64); s.SetGoal(1);
    for (let i = 0; i < 600; i++) s.Step(1 / 60);
    expect(s.Step(1 / 60)).toBeCloseTo(1, 4); expect(s.CanSleep()).toBe(true);
  });
  it("spline passes through points", () => {
    const sp = getSpline([{ Time: 0, Value: 0.95 }, { Time: 0.7, Value: 1.0505 }, { Time: 1, Value: 1 }]);
    expect(sp.at(0)).toBeCloseTo(0.95); expect(sp.at(0.7)).toBeCloseTo(1.0505); expect(sp.at(1)).toBeCloseTo(1);
  });
  it("text utils", () => {
    expect(splitLetters("Привет")).toHaveLength(6);
    expect(splitLetters("👍🏽a")).toEqual(["👍🏽", "a"]);
    expect(stripZeroWidth("a​b")).toBe("ab");
    expect(isRtl("שלום")).toBe(true); expect(isRtl("Hello")).toBe(false);
    expect(isLetterCapable(5, 1000, false)).toBe(true); expect(isLetterCapable(5, 999, false)).toBe(false);
    expect(isLetterCapable(13, 2000, true)).toBe(false); expect(minLetterCapableDuration(true)).toBe(1050);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/renderPrimitives.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** — перенос без изменений логики. Режим передаётся параметром вместо
  стора `$simpleLyricsMode`.
- [ ] **Step 4: Run** `npx vitest run tests/renderPrimitives.test.ts`. Expected: PASS.

---

### Task 10: Построение DOM текста и титры (порт applyers)

**Files:**
- Create: `src/render/model.ts`:
  - `interface TimedItem { HTMLElement: HTMLElement; StartTime: number; EndTime: number; TotalTime: number }`;
  - `LetterItem`, `WordItem` (поля `LetterGroup?`, `Letters?`, `BGWord?`, `Dot?`, `AnimatorStore?`);
  - `LineItem` (поля `Syllables?: {Lead: WordItem[]}`, `DotLine?`, `BGLine?`, `AnimatorStore?`, `AnimatedState?`, `Settling?`, `Status?`);
  - `interface RenderedLyrics { type: "Syllable" | "Line" | "Static"; root: HTMLElement; lines: LineItem[] }`.
- Create: `src/render/build.ts`: `buildLyrics(data: Lyrics, opts: { simple: boolean }): RenderedLyrics`.
  Источники порта:
  - `spicy:utils/Lyrics/Applyer/Synced/Syllable.ts:73-578`;
  - `spicy:utils/Lyrics/Applyer/Synced/Line.ts:51-342`;
  - `spicy:utils/Lyrics/Applyer/Static.ts:47-148`;
  - `Emphasize` — `spicy:utils/Lyrics/Applyer/Utils/Emphasize.ts`.

  Убрать при переносе: `PageContainer`, SimpleBar, виртуализатор, сторы, романизацию, `classes`/`styles`.
  Корень — `div.SpicyLyricsScrollContainer[data-lyrics-type]`, строки — прямые дети.
  Три копии кода точек свести в одну `buildDotLine(startMs, endMs, opposite): LineItem`.
- Create: `src/render/credits.ts`: `buildCredits(data: Lyrics): HTMLElement[]` (порт `spicy:utils/Lyrics/Applyer/Credits/*`).
  - `.Credits`: «Авторы: a, b».
  - `.LyricsProvider`: «Текст: <провайдер>», где провайдер — Spicy Lyrics, Apple Music, Spotify,
    Яндекс Музыка или LRCLIB.
  - `.SongInfo` только для `spicy_lyrics`: «Загрузил» и «Синхронизировал» с аватаром.
    Ссылки — `<a target="_blank" rel="noreferrer">` на `url`.
- Test: `tests/build.test.ts` (happy-dom)

**Interfaces:**
- Consumes: Task 2 (типы), Task 9 (text utils).
- Produces: `buildLyrics`, `buildDotLine`, `buildCredits`, типы из `model.ts`. Times в `LineItem` и `WordItem` — мс.

- [ ] **Step 1: Write the failing test**

```ts
/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { buildLyrics } from "../src/render/build";
import { buildCredits } from "../src/render/credits";

const syl = (Text: string, s: number, e: number, IsPartOfWord = false) => ({ Text, StartTime: s, EndTime: e, IsPartOfWord });
const data: any = { Type: "Syllable", source: "spicy_lyrics", StartTime: 4, SongWriters: ["A", "B"],
  UploadAttribution: { Uploader: { id: "1", username: "up", url: "https://spicylyrics.org/uid/1" }, Maker: { id: "2", username: "mk", url: "https://spicylyrics.org/uid/2" } },
  Content: [
    { Type: "Vocal", OppositeAligned: false, Lead: { StartTime: 4, EndTime: 6, Syllables: [syl("Hel", 4, 4.5, true), syl("lo", 4.5, 5), syl("woooorld", 5, 6.2)] },
      Background: [{ StartTime: 5, EndTime: 5.9, Syllables: [syl("yeah", 5, 5.9)] }] },
    { Type: "Vocal", OppositeAligned: true, Lead: { StartTime: 9.2, EndTime: 10, Syllables: [syl("Bye", 9.2, 10)] } },
  ] };

describe("buildLyrics", () => {
  it("builds syllable DOM with intro dots, word groups, letters, bg and interlude", () => {
    const r = buildLyrics(data, { simple: false });
    expect(r.root.getAttribute("data-lyrics-type")).toBe("Syllable");
    const kinds = r.lines.map((l) => (l.DotLine ? "dots" : l.BGLine ? "bg" : "line"));
    expect(kinds).toEqual(["dots", "line", "bg", "dots", "line"]);
    expect(r.root.querySelector(".word-group")!.children).toHaveLength(2);
    expect(r.root.querySelectorAll(".letterGroup .letter.Emphasis")).toHaveLength(8);
    expect(r.lines[4].HTMLElement.classList.contains("OppositeAligned")).toBe(true);
    const dots = r.lines[3].Syllables!.Lead;
    expect(dots.map((d) => [d.StartTime, d.EndTime].map(Math.round))).toEqual([[6000, 6883], [6883, 7767], [7767, 8650]]);
  });
  it("no intro dots when first line starts before 3s; Line and Static types", () => {
    const line = buildLyrics({ Type: "Line", source: "yandex", StartTime: 1, Content: [{ Type: "Vocal", OppositeAligned: false, Text: "a", StartTime: 1, EndTime: 2 }] } as any, { simple: false });
    expect(line.lines).toHaveLength(1);
    expect(buildLyrics({ Type: "Static", source: "yandex", Lines: [{ Text: "x" }, { Text: " " }] } as any, { simple: false }).root.querySelectorAll(".line.static")).toHaveLength(1);
  });
  it("credits: provider always, uploader/maker only for spicy_lyrics", () => {
    const text = buildCredits(data).map((e) => e.textContent).join("|");
    expect(text).toContain("A, B"); expect(text).toContain("Spicy Lyrics"); expect(text).toContain("up"); expect(text).toContain("mk");
    const apple = buildCredits({ ...data, source: "apple_music", UploadAttribution: undefined }).map((e) => e.textContent).join("|");
    expect(apple).toContain("Apple Music"); expect(apple).not.toContain("up");
  });
});
```

Ожидаемые тайминги точек считаются по формуле Spicy:
- пауза 6000→9200 мс, `total = 3200`, `base = total/3`, `pad = −550/3`;
- `dot1 = 6000 + base + pad`;
- `dot2 = 6000 + 2·base + 2·pad`;
- `dot3 = 6000 + total − 550`.

- [ ] **Step 2: Run** `npx vitest run tests/build.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** — перенос с изменениями, перечисленными в разделе Files.
- [ ] **Step 4: Run** `npx vitest run tests/build.test.ts`. Expected: PASS.

---

### Task 11: Аниматор (порт LyricsAnimator)

**Files:**
- Create: `src/render/Animator.ts` — порт `spicy:utils/Lyrics/Animator/Lyrics/LyricsAnimator.ts`.
  - Берутся:
    - константы и сплайны, строки 35-238;
    - батч стилей и `setStyleIfChanged`, 492-624;
    - фабрики пружин, 626-757;
    - `Animate`, 851-2162.
  - Без веток `refreshedSimple` и `animateRefreshedDot`.
  - Глобальные `Blurring_LastLine` и `lastFrameTime` переносятся в поля экземпляра.
  - Сплайны, зависящие от Simple-режима, создаются в конструкторе.
- Test: `tests/animator.test.ts` (happy-dom)

**Interfaces:**
- Consumes: `RenderedLyrics` (Task 10), `Spring`/`getSpline` (Task 9).
- Produces: `class Animator { constructor(opts: { simple: boolean; now?: () => number }); frame(r: RenderedLyrics, positionMs: number): void; reset(): void }`.
  Позиция `ProcessedPosition` равна `positionMs − (simple ? 33.5 : 0)`, как в Spicy.

- [ ] **Step 1: Write the failing test**

```ts
/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { Animator } from "../src/render/Animator";
import { buildLyrics } from "../src/render/build";

const mk = () => buildLyrics({ Type: "Syllable", source: "yandex", StartTime: 0.5, Content: [
  { Type: "Vocal", OppositeAligned: false, Lead: { StartTime: 0.5, EndTime: 1.5, Syllables: [{ Text: "one", StartTime: 0.5, EndTime: 1, IsPartOfWord: false }, { Text: "two", StartTime: 1, EndTime: 1.5, IsPartOfWord: false }] } },
  { Type: "Vocal", OppositeAligned: false, Lead: { StartTime: 1.5, EndTime: 2.5, Syllables: [{ Text: "three", StartTime: 1.5, EndTime: 2.5, IsPartOfWord: false }] } },
  { Type: "Vocal", OppositeAligned: false, Lead: { StartTime: 2.5, EndTime: 3.5, Syllables: [{ Text: "four", StartTime: 2.5, EndTime: 3.5, IsPartOfWord: false }] } },
] } as any, { simple: false });

describe("Animator", () => {
  it("sets line states, gradient and blur", () => {
    const r = mk(); document.body.append(r.root);
    let t = 0; const a = new Animator({ simple: false, now: () => t });
    t = 16; a.frame(r, 750);
    const [l1, l2, l3] = r.lines.map((l) => l.HTMLElement);
    expect(l1.classList.contains("Active")).toBe(true);
    expect(l2.classList.contains("NotSung")).toBe(true);
    const w1 = r.lines[0].Syllables!.Lead[0].HTMLElement;
    expect(parseFloat(w1.style.getPropertyValue("--gradient-position"))).toBeCloseTo(-20 + 120 * 0.5, 0);
    expect(l2.style.getPropertyValue("--BlurAmount")).toBe("1.25px");
    expect(l3.style.getPropertyValue("--BlurAmount")).toBe("2.5px");
  });
  it("seeking backwards returns words to NotSung", () => {
    const r = mk(); document.body.append(r.root);
    let t = 0; const a = new Animator({ simple: false, now: () => t });
    t = 16; a.frame(r, 3000); t = 32; a.frame(r, 600);
    expect(r.lines[1].HTMLElement.classList.contains("NotSung")).toBe(true);
    expect(r.lines[0].HTMLElement.classList.contains("Active")).toBe(true);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/animator.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** — перенос.
- [ ] **Step 4: Run** `npx vitest run tests/animator.test.ts`. Expected: PASS.

---

### Task 12: Автоскролл (порт ScrollToActiveLine)

**Files:**
- Create: `src/render/Scroller.ts` — порт `spicy:utils/Scrolling/ScrollToActiveLine.ts`:
  - логика выбора строки `GetScrollLine`, строки 123-217;
  - `ScrollToActiveLine`, 273-565, без ветки виртуализатора;
  - `ScrollIntoCenterViewCSS`, `spicy:utils/ScrollIntoView/Center.ts:66-94`.
  - Пауза при колесе или тачпаде — `USER_SCROLL_COOLDOWN = 750` мс, класс `HideLineBlur` на `.LyricsContent`.
- Test: `tests/scroller.test.ts` (happy-dom)

**Interfaces:**
- Consumes: `LineItem`, `RenderedLyrics` (Task 10).
- Produces: `getScrollLineIndex(lines: LineItem[], positionMs: number): number | null` — чистая функция.
- Produces: `class Scroller`:
  - `constructor(scrollEl: HTMLElement, contentEl: HTMLElement, now?: () => number)`;
  - `frame(r: RenderedLyrics, positionMs: number, isPlaying: boolean): void`;
  - `queueForceScroll(): void`; `reset(): void`; `destroy(): void`.

- [ ] **Step 1: Write the failing test**

```ts
/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { getScrollLineIndex, Scroller } from "../src/render/Scroller";

const L = (s: number, e: number, bg = false) => ({ HTMLElement: document.createElement("div"), StartTime: s, EndTime: e, TotalTime: e - s, BGLine: bg }) as any;

describe("scroller", () => {
  it("anchors to the top active lead line, ignores trailing bg lines", () => {
    const lines = [L(0, 1000), L(1000, 2000), L(1500, 3500, true), L(2000, 3000), L(3000, 4000)];
    expect(getScrollLineIndex(lines, 1200)).toBe(1);
    expect(getScrollLineIndex(lines, 2500)).toBe(3);
    expect(getScrollLineIndex(lines, 9999)).toBeNull();
  });
  it("wheel pauses auto-scroll and hides blur for 750ms", () => {
    let t = 0;
    const scrollEl = document.createElement("div"); const content = document.createElement("div");
    const s = new Scroller(scrollEl, content, () => t);
    scrollEl.dispatchEvent(new WheelEvent("wheel"));
    expect(content.classList.contains("HideLineBlur")).toBe(true);
    s.destroy();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/scroller.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** — перенос.
- [ ] **Step 4: Run** `npx vitest run tests/scroller.test.ts`. Expected: PASS.

---

### Task 13: Стили, оверлей страницы и превью

**Files:**
- Create: `src/styles/`:
  - `lyrics.css` — `spicy:css/Lyrics/main.css` + `spicy:css/Lyrics/Mixed.css`, без PiP/NPV/Compact/Refreshed/virtualizer;
  - `page.css` — `spicy:css/default.css:1-243` и нужные части `spicy:css/ContentBox.css` (ContentBox,
    NowBar, MediaBox, Metadata, Timeline, PlaybackControls, ViewControls, VolumeControl, MediaImageContainer);
  - `background.css` — `spicy:css/DynamicBG/spicy-dynamic-bg.css`;
  - `loader.css` — `spicy:css/Loaders/DotLoader.css` и `LoaderContainer.css`;
  - `ym.css` — позиционирование оверлея, z-index выше UI ЯМ, режимы `.Mode_Page` и `.Mode_Cinema`.
  - Селекторы `.Root__*`, `.main-*` и `--spice-*` убрать или заменить на собственные переменные.
- Create: `src/ui/Page.ts`, `src/ui/overlayRect.ts`, `src/ui/Notice.ts`, `src/ui/Icons.ts`
  (SVG из `spicy:components/Styling/Icons.ts`: Close, Fullscreen, CloseFullscreen, CinemaView, NowBar, NowBarSideSwap).
- Create: `preview/index.html`, `preview/main.ts`, `preview/mockHost.ts`, `preview/fixtures.ts`, `vite.preview.config.ts`
- Test: `tests/overlayRect.test.ts`

**Interfaces:**
- Consumes: задачи 8, 10–12.
- Produces: `computeOverlayRect(content: { getBoundingClientRect(): DOMRect } | null, viewport: { width: number; height: number }): { top: number; left: number; width: number; height: number }`.
  Без элемента контента возвращается весь вьюпорт.
- Produces: `class LyricsPage`:
  - `constructor(deps: { host: Host; clock: PlayerClock; doc?: Document })`;
  - `open(mode?: "page" | "cinema"): void`; `close(): void`; `toggle(): void`; `readonly isOpen: boolean`;
  - `setTrack(t: TrackInfo | null): void`;
  - `setLyrics(state: { status: "loading" } | { status: "none" } | { status: "ready"; lyrics: Lyrics }): void`;
  - `applySettings(s: Settings): void`; `forceScroll(): void`; `destroy(): void`.
- Поведение страницы:
  - Один `requestAnimationFrame`, пока вид открыт. В каждом кадре: `clock.getPositionMs()`, затем
    `animator.frame`, `scroller.frame`, `nowBar.update`, `background.render` (последние два — в Task 14).
  - Ошибки кадра считаются; после пяти подряд цикл останавливается.
  - Клик по `.line`, `.word` или `.letter` вызывает `host.seek(max(0, lineStart − 300) / 1000)`.
  - `Esc` закрывает вид.
  - Классы страницы: `SpicyRenderer`, `UseSpicyFont`, `SimpleLyricsMode`, `NoLineHoverBackground`,
    `Fullscreen`, `NowBarStatus__Open`, `NowBarSide__Right`. `HideLineBlur` ставится навсегда при `lineBlur === false`.
  - Шрифт: при первом открытии добавляется `<link rel="stylesheet" href="https://fonts.spikerko.org/spicy-lyrics/source.css">`.
- Превью:
  - `mockHost` реализует `Host`: часы на `setInterval` по 250 мс, play/pause/seek с клавиатуры,
    обложка рисуется на canvas в `blob:`-URL;
  - фикстуры: Syllable с дуэтом, бэк-вокалом, длинными слогами и паузой ≥ 3 с; Line из LRC; Static;
  - запуск `npx vite --config vite.preview.config.ts` на порту 5199.

- [ ] **Step 1: Write the failing test** `tests/overlayRect.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { computeOverlayRect } from "../src/ui/overlayRect";
describe("overlay rect", () => {
  it("covers content element or whole viewport", () => {
    const el = { getBoundingClientRect: () => ({ top: 0, left: 240, width: 1000, height: 640 }) as DOMRect };
    expect(computeOverlayRect(el, { width: 1240, height: 720 })).toEqual({ top: 0, left: 240, width: 1000, height: 640 });
    expect(computeOverlayRect(null, { width: 1240, height: 720 })).toEqual({ top: 0, left: 0, width: 1240, height: 720 });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/overlayRect.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** стили, `LyricsPage`, `overlayRect`, `Notice` и превью.
- [ ] **Step 4: Run** `npx vitest run tests/overlayRect.test.ts`. Expected: PASS.
- [ ] **Step 5: Визуальная проверка в превью.**
  1. Запустить превью в фоне и открыть `http://localhost:5199` во встроенном браузере.
  2. Сделать скриншоты для Syllable, Line и Static.
  3. Сравнить с `refs/spicy-lyrics/previews/wide_home.webp` и `V3latest_smallcard_preview.webp`.
     Должны совпадать:
     - активная строка белая со свечением, соседние размыты;
     - бэк-вокал меньше и бледнее;
     - точки «дышат»;
     - дуэт прижат вправо.
  4. Проверить, есть ли в шрифте `SpicyLyrics` кириллица: сравнить `measureText` для
     `"SpicyLyrics, serif"` и `"SpicyLyrics, monospace"` на строке «Привет». Если ширины
     различаются, кириллицы нет — тогда в `page.css` поставить fallback `"YS Text", "Inter", sans-serif`
     для `:lang(ru)` и для кириллических строк.

---

### Task 14: NowBar и динамический фон

**Files:**
- Create: `src/ui/NowBar.ts` — порт нужных частей `spicy:components/Utils/NowBar.ts` и
  `spicy:utils/Lyrics/SongProgressBar.ts`: MediaBox с кроссфейдом обложки, SongName, Artists,
  Timeline (время и SliderBar с перемоткой кликом и перетаскиванием), PlaybackControls (prev,
  play/pause, next), VolumeControl. Контролы видны только в режиме `cinema`.
- Create: `src/ui/Background.ts` — порт `spicy:components/DynamicBG/dynamicBackground.ts:21-498, 632-735`.
  - Kawarp:
    - опции `KawarpOptionsStatic`;
    - `start()` с отменой собственного rAF Kawarp, `renderFrame()` из нашего цикла;
    - кроссфейд слоёв `transition_In`/`transition_Out` с удалением через 1500 мс;
    - скорость 1 при игре и 0.1 на паузе.
  - Если `new Kawarp(...)` бросает исключение (нет WebGL), стиль `dynamic` молча заменяется на `cover`.
  - Другие стили:
    - `cover` — `StaticBackground` с `--BackgroundImage`;
    - `color` — `ColorBackground` с палитрой из `averageColor` трека (иначе усреднение обложки 8×8);
    - `none` — без слоёв.
- Create: `src/ui/time.ts`: `formatTime(ms: number): string` (`m:ss`, `h:mm:ss` от часа).
- Test: `tests/time.test.ts`, `tests/background.test.ts` (happy-dom, Kawarp замокан через `vi.mock("@kawarp/core")`)

**Interfaces:**
- Consumes: `Host`, `PlayerClock`, `TrackInfo`.
- Produces: `class NowBar { constructor(root: HTMLElement, deps: { host: Host; clock: PlayerClock }); setTrack(t: TrackInfo | null): void; setControlsVisible(v: boolean): void; update(positionMs: number): void; destroy(): void }`.
- Produces: `class Background { constructor(hostEl: HTMLElement); setStyle(s: Settings["backgroundStyle"]): void; setCover(url: string | undefined, averageColor?: string): Promise<void>; setPlaying(p: boolean): void; render(): void; destroy(): void }`.
- Produces: `formatTime`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/time.test.ts
import { expect, it } from "vitest";
import { formatTime } from "../src/ui/time";
it("formats", () => { expect(formatTime(0)).toBe("0:00"); expect(formatTime(61500)).toBe("1:01"); expect(formatTime(3723000)).toBe("1:02:03"); });
```

```ts
// tests/background.test.ts
/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";
vi.mock("@kawarp/core", () => ({ default: class { loadImage = vi.fn(async () => {}); loadBlob = vi.fn(async () => {}); start() {} stop() {} renderFrame() {} setOptions() {} dispose = vi.fn(); } }));
import { Background } from "../src/ui/Background";
describe("Background", () => {
  it("does not leak layers on style switches", async () => {
    vi.useFakeTimers();
    const el = document.createElement("div"); const bg = new Background(el);
    bg.setStyle("dynamic"); await bg.setCover("https://avatars.yandex.net/x/1000x1000");
    bg.setStyle("cover"); await bg.setCover("https://avatars.yandex.net/x/1000x1000");
    bg.setStyle("none");
    vi.advanceTimersByTime(2000);
    expect(el.querySelectorAll(".spicy-dynamic-bg")).toHaveLength(0);
    bg.destroy();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/time.test.ts tests/background.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** и подключить `NowBar` и `Background` в `LyricsPage` (Task 13).
  Кнопки `ViewControls` NowBar и Swap переключают `NowBarStatus__Open` и `NowBarSide__Right`
  и сохраняют состояние в `host.storage` под ключом `view`.
- [ ] **Step 4: Run** `npx vitest run tests/time.test.ts tests/background.test.ts`. Expected: PASS.
- [ ] **Step 5: Визуальная проверка в превью.**
  - динамический фон переливается, при смене обложки делает кроссфейд;
  - NowBar слева, как на `wide_home.webp`;
  - в кинорежиме видны кнопки управления;
  - перемотка кликом по таймлайну работает.

---

### Task 15: Сборка приложения, хост SDK, перехват кнопки ЯМ

**Files:**
- Create: `src/app/App.ts`: `startApp(host: Host): AppController`, где
  `AppController = { open(mode?: "page" | "cinema"): void; close(): void; toggle(): void; dispose(): void }`.
- Create: `src/app/NativeLyricsHook.ts`: `installNativeLyricsHook(doc: Document, onOpen: () => void, enabled: () => boolean): () => void`.
- Create: `src/host/sdkHost.ts`: `createSdkHost(api: AddonApi): Host`, `mapSnapshot(snapshot: unknown): PlayerState`.
- Modify: `src/main.ts` — финальная версия:
  - `defineAddon({ id: "spicy-lyrics", name: "Spicy Lyrics", settings: settingsDefinition, ... })`;
  - `playerBarButtons: [{ id: "open-spicy-lyrics", label: "Spicy Lyrics", icon: "lyrics", onClick: () => app?.toggle() }]`;
  - `start(api)` создаёт host и app и возвращает `() => app.dispose()`.
- Test: `tests/app.test.ts`, `tests/nativeHook.test.ts`, `tests/sdkHost.test.ts` (happy-dom)

**Interfaces:**
- Consumes: всё выше.
- Поведение `App`:
  - Подписывается на `host.onPlayer`.
  - При смене `track.id`:
    1. отменяет предыдущий `AbortController`;
    2. вызывает `page.setTrack(track)` и `page.setLyrics({status: "loading"})`;
    3. вызывает `resolver.get(track, signal)`;
    4. результат применяется, только если `track.id` не изменился, иначе отбрасывается.
  - `clock.update` вызывается на каждом снимке; если `seeked`, вызывается `page.forceScroll()`.
  - `host.onSettings`:
    - меняет `clock.offsetMs` и вызывает `page.applySettings`;
    - если изменились поля источников (ключи, `use*`, `sourceOrder`), вызывает `resolver.clear()`
      и перезагружает текст текущего трека;
    - смена `simpleLyricsMode` пересобирает текст, но не создаёт второй цикл кадров.
  - Если `useSpicy` включён, а `spicyApiKey` пуст, при первом открытии вида один раз показывается
    `host.notify("Добавьте ключ Spicy Lyrics в настройках аддона — будет пословная синхронизация")`.
    Флаг хранится в `host.storage` под ключом `hint:spicyKey`.
- `mapSnapshot`: `progressSec` — `progress`, если это число, иначе `progress?.position`;
  `status`; `track: toTrackInfo(snapshot.track)`; `volume`.
- `installNativeLyricsHook`: обработчик `click` в фазе capture на `doc` для
  `[data-test-id="PLAYERBAR_DESKTOP_SYNC_LYRICS_BUTTON"], [data-test-id="SYNC_LYRICS_BUTTON"]`.
  Когда `enabled()`, он вызывает `preventDefault()`, `stopImmediatePropagation()` и `onOpen()`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/app.test.ts
/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";
import { startApp } from "../src/app/App";
import { DEFAULT_SETTINGS } from "../src/settings";
import { fakeHost } from "./helpers/fakeHost";

describe("App", () => {
  it("drops stale lyrics when tracks switch quickly", async () => {
    let emit!: (s: any) => void;
    const slow = new Map<string, (v: string) => void>();
    const host = fakeHost({
      onPlayer: (l) => { emit = l; return () => {}; },
      getYandexLyrics: (id) => new Promise((res) => slow.set(id, res)),
      getSettings: () => ({ ...DEFAULT_SETTINGS, useLrclib: false }),
    });
    const app = startApp(host); app.open();
    const tr = (id: string) => ({ id, title: id, artists: ["A"], durationMs: 60000, isUgc: false });
    emit({ status: "playing", progressSec: 0, track: tr("1"), volume: 1 });
    emit({ status: "playing", progressSec: 0, track: tr("2"), volume: 1 });
    slow.get("2")!("[00:01.00]second");
    await vi.waitFor(() => expect(document.querySelector("#SpicyLyricsPage .line")?.textContent).toBe("second"));
    slow.get("1")?.("[00:01.00]first");
    await new Promise((r) => setTimeout(r, 10));
    expect(document.body.textContent).not.toContain("first");
    app.dispose();
    expect(document.querySelector("#SpicyLyricsPage")).toBeNull();
  });
  it("settings change while open keeps a single page and loop", () => {
    let push!: (s: any) => void;
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const host = fakeHost({ onSettings: (l) => { push = l; return () => {}; } });
    const app = startApp(host); app.open();
    const before = raf.mock.calls.length;
    push({ ...DEFAULT_SETTINGS, simpleLyricsMode: true, backgroundStyle: "cover" });
    expect(document.querySelectorAll("#SpicyLyricsPage")).toHaveLength(1);
    expect(raf.mock.calls.length - before).toBeLessThanOrEqual(1);
    app.dispose();
  });
});
```

```ts
// tests/nativeHook.test.ts
/** @vitest-environment happy-dom */
import { expect, it, vi } from "vitest";
import { installNativeLyricsHook } from "../src/app/NativeLyricsHook";
it("intercepts the native lyrics button only when enabled", () => {
  document.body.innerHTML = `<button data-test-id="PLAYERBAR_DESKTOP_SYNC_LYRICS_BUTTON"><span>i</span></button>`;
  const native = vi.fn(); document.body.addEventListener("click", native);
  let enabled = true; const onOpen = vi.fn();
  const off = installNativeLyricsHook(document, onOpen, () => enabled);
  document.querySelector("span")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(onOpen).toHaveBeenCalledTimes(1); expect(native).not.toHaveBeenCalled();
  enabled = false;
  document.querySelector("span")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(native).toHaveBeenCalledTimes(1);
  off();
});
```

```ts
// tests/sdkHost.test.ts
import { expect, it } from "vitest";
import { mapSnapshot } from "../src/host/sdkHost";
it("maps snapshots with numeric or object progress", () => {
  expect(mapSnapshot({ status: "playing", progress: { position: 12.5, duration: 200 }, track: { id: "1", title: "t" }, volume: 0.5 }).progressSec).toBe(12.5);
  expect(mapSnapshot({ status: "paused", progress: 3, track: null, volume: null })).toMatchObject({ progressSec: 3, track: null });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/app.test.ts tests/nativeHook.test.ts tests/sdkHost.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `App`, `NativeLyricsHook`, `sdkHost` и финальный `main.ts`.
- [ ] **Step 4: Run** `npm test`. Expected: все тесты PASS. Затем `npm run typecheck` и `npm run build` без ошибок.

---

### Task 16: Доставка в PulseSync и живая проверка

**Files:**
- Modify: `addon/README.md` (описание для карточки PulseSync, где взять ключ Spicy, атрибуция)
- Create: `README.md` (сборка, разработка, лицензии)

- [ ] **Step 1:** Попросить пользователя запустить PulseSync (с входом в аккаунт) и Яндекс Музыку.
  Перезапускать их без согласия нельзя.
- [ ] **Step 2: Run** `npm run build && npm run deliver`. Expected: `{ ok: true, recipients: 1 }`.
  `%APPDATA%\PulseSync\addons\spicy-lyrics\metadata.json` существует.
- [ ] **Step 3: Проверка в ЯМ** (скриншоты через computer-use; DevTools — если пользователь включит devMode):
  - кнопка «Spicy Lyrics» есть в плеер-баре;
  - вид открывается, фон и обложка грузятся (нет блокировки `allowedUrls`);
  - текст из ЯМ (`yandex`) синхронизирован;
  - перемотка, пауза и смена трека работают;
  - родная кнопка текста открывает Spicy (опция включена);
  - кинорежим и `Esc` работают.
- [ ] **Step 4: Проверка настроек:** выключить и включить «Простой режим», «Размытие», стиль
  фона, сдвиг тайминга. Изменения применяются без перезапуска.
- [ ] **Step 5:** Если пользователь дал ключ Spicy — проверить трек с пословной синхронизацией
  (например, The Weeknd — Blinding Lights) и атрибуцию в титрах. Без ключа это отметить как непроверенное.
- [ ] **Step 6: Run** `npm test && npm run typecheck`. Expected: всё зелёное.
