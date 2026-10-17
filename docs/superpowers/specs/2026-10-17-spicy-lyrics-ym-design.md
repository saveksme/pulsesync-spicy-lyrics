# Spicy Lyrics для Яндекс Музыки — спецификация

Дата: 2026-10-17. Статус: дизайн утверждён в чате, спецификация на ревью.

## 1. Цель

Аддон для PulseSync (мод настольной Яндекс Музыки), который показывает текст песни так же, как
[Spicy Lyrics](https://github.com/Spikerko/spicy-lyrics) в Spotify: тот же источник текстов и тот же вид.

Критерии готовности:

- Аддон ставится в `%APPDATA%\PulseSync\addons\spicy-lyrics`, включается в PulseSync и работает в ЯМ 5.122+.
- Для трека с пословной синхронизацией из Spicy Lyrics видна анимация Spicy: заливка слов,
  пружины, свечение букв, точки-паузы, бэк-вокал, дуэты.
- Без ключа Spicy аддон всё равно показывает построчный текст из ЯМ или LRCLIB в стиле Spicy.
- Синхронизация не отстаёт и не убегает больше чем на ~50 мс; перемотка, пауза и смена трека
  отрабатываются сразу.
- Визуально макет повторяет превью Spicy: динамический фон, NowBar слева, текст справа.

## 2. Ограничения среды

Формат аддона — `web-addon` на `@pulsesync/addon-sdk` 0.16. Старый `type: "script"` выводят из
публикации в магазине.

- Код выполняется в изолированном мире Electron. DOM общий со страницей ЯМ, глобальные объекты
  страницы недоступны.
- Нельзя:
  - создавать `<script>`;
  - писать `on*`-атрибуты и `javascript:`-URL;
  - пользоваться `document.write`.
- API хоста (`api.client.*`) работает через RPC с лимитом 300 вызовов за 10 с. Подписки
  (`player.onChange`, `onTrackChange`) приходят событиями и в лимит не входят.
- Три необработанные ошибки за 10 с выключают аддон. Поэтому кадр анимации и колбэки
  обёрнуты в `try/catch`.
- Сеть: per-addon allow-list из `allowedUrls`. Совпадение проверяется по точному origin и
  префиксу пути. CORS для разрешённых адресов мод проставляет сам. Нужны:
  - `https://api.spicylyrics.org`;
  - `https://labs.api.listenbrainz.org`;
  - `https://lrclib.net`;
  - `https://accounts.spotify.com`, `https://api.spotify.com`;
  - `https://fonts.spikerko.org`;
  - `https://avatars.yandex.net` (обложки).
- CSS собирается с `cssScope: "global"`, потому что нужны `@keyframes`, `@property` и
  `@font-face`. Все селекторы живут под `#SpicyLyricsPage`.
- Позиция плеера в ЯМ обновляется по `timeupdate`, примерно 4 раза в секунду. Между
  обновлениями её интерполируем по `performance.now()`.

## 3. Архитектура

```
src/
  main.tsx            defineAddon: id, settings, кнопка в плеер-баре, start(api) → App
  settings.ts         defineAddonSettings (схема из §8)
  app/
    App.ts            оркестратор: трек → загрузка текста → рендер; открыть/закрыть вид
    PlayerClock.ts    интерполяция позиции, статус, скорость; seek/play/pause через api.client
    TrackInfo.ts      нормализация метаданных ЯМ (id, title, version, artists, album, duration, cover)
    NativeLyricsHook.ts  перехват родной кнопки текста ЯМ (capture-listener)
  sources/
    types.ts          модель данных Spicy (Syllable/Line/Static, секунды)
    resolve.ts        цепочка источников, кэш, отмена устаревших запросов
    spicyApi.ts       GET /v1/lyrics/{spotifyId}, разбор ошибок
    spotifyId.ts      ЯМ-трек → Spotify ID (ListenBrainz → Spotify Search, опционально)
    yandex.ts         api.resources.getLyrics(id, 'LRC'|'TEXT')
    lrclib.ts         /api/get, /api/search, выбор кандидата
    lrc.ts            LRC и enhanced LRC (<mm:ss.xx> слова) → Line/Syllable
    lyricsfile.ts     LRCLIB lyricsfile v1.0 (YAML) → Line/Syllable
  render/             перенос из Spicy Lyrics (AGPL-3.0)
    Spring.ts, Spline.ts
    model.ts          LyricsObject: строки, слова, буквы, точки
    applySyllable.ts, applyLine.ts, applyStatic.ts
    utils/            Emphasize, SplitLetters, IsLetterCapable, StripZeroWidth, PickDisplayText, isRtl, EmptyLines
    Animator.ts       LyricsAnimator (обычный и Simple-режим)
    Scroll.ts         ScrollToActiveLine + ScrollIntoCenterView
    Credits.ts        авторы, провайдер, атрибуция Spicy (Uploader/Maker)
  ui/
    Page.ts           оверлей #SpicyLyricsPage: открытие, закрытие, режимы, ViewControls
    NowBar.ts         обложка, название, артисты, таймлайн, кнопки управления, громкость
    Background.ts     Kawarp (dynamic), cover, color, none
    Icons.ts          SVG-иконки из Spicy
    Notice.ts         загрузка и «текст не найден»
  styles/             CSS из Spicy (Mixed, main, ContentBox, DynamicBG, Loaders) + адаптация под ЯМ
preview/              страница-превью с мок-плеером для подгонки визуала
tests/                vitest
scripts/deliver.mjs   копирование в %APPDATA%\PulseSync\addons\spicy-lyrics + POST /dev/addons/reload
```

Ядро (`sources`, `render`, `ui`) не знает о PulseSync: оно получает интерфейс `Host`
(позиция, трек, команды плеера, сеть, хранилище, настройки). `main.tsx` реализует `Host` через SDK.
Превью реализует его моком. Так рендер можно гонять в браузере без ЯМ.

## 4. Источники текста

### 4.1 Модель

Модель повторяет ответ Spicy Lyrics API. Время в секундах, рендер переводит его в мс.

- `Syllable`: `Content[].{Type:"Vocal", OppositeAligned, Lead{StartTime, EndTime, Syllables[]}, Background[]?}`.
  У слога есть `Text`, `StartTime`, `EndTime`, `IsPartOfWord`.
- `Line`: `Content[].{Type:"Vocal", Text, StartTime, EndTime, OppositeAligned}`.
- `Static`: `Lines[].{Text}`.
- Общие поля: `StartTime`, `SongWriters?`, `source` (`spicy_lyrics` | `apple_music` | `spotify` |
  `yandex` | `lrclib`), `UploadAttribution?`.

### 4.2 Spicy Lyrics API (основной)

- Запрос: `GET https://api.spicylyrics.org/v1/lyrics/{spotifyTrackId}`, заголовок
  `Authorization: Bearer <ключ из настроек>`.
- 200: `Body` — готовая модель, `Body.source` — провайдер.
- Ошибки:
  - 404 `lyrics_not_found`: следующий источник.
  - 401/403: ключ недействителен. Одно уведомление, Spicy пропускается до смены ключа.
  - 429: уважаем `Retry-After`, пока используем запасные источники.
  - 5xx и сеть: следующий источник.
- Атрибуция обязательна по условиям API. Всегда показываем провайдера. Для
  `spicy_lyrics` дополнительно показываем Uploader и Maker со ссылками.

### 4.3 Spotify ID по треку ЯМ

1. Кэш по id трека ЯМ: найденное хранится 30 дней, «не найдено» — 1 день.
2. ListenBrainz: `GET https://labs.api.listenbrainz.org/spotify-id-from-metadata/json`
   с `artist_name`, `release_name`, `track_name`. Сначала с альбомом, потом без него.
   Берём первый id.
3. Если заданы Spotify client id и secret:
   - токен через `POST https://accounts.spotify.com/api/token` (client_credentials), кэш до истечения;
   - поиск `GET https://api.spotify.com/v1/search?type=track&limit=5&q=track:"…" artist:"…"`;
   - выбираем по нормализованному названию, артисту и разнице длительности не больше 3 с.
4. Из названия ЯМ используем `title`. Если первая попытка ничего не дала, пробуем ещё
   `title + version` (например «(Remix)»).

### 4.4 Запасные источники

- **ЯМ:** `api.resources.getLyrics(trackId, 'LRC')` разбирается LRC-парсером в `Line`. Если
  синхронного текста нигде нет, берём `getLyrics(trackId, 'TEXT')` как `Static`. Работает
  только для числовых id; UGC-треки пропускаются.
- **LRCLIB:**
  - сначала `GET /api/get` с `track_name`, `artist_name`, `album_name` и `duration`;
  - при 404 — `GET /api/search` с `track_name` и `artist_name`;
  - кандидат должен совпасть по длительности (±2 с, ±10 с для пословных) и быть не `instrumental`;
  - при равных условиях предпочитаем `hasWordSync`.
  - Порядок полей результата: `lyricsfile` со словами даёт `Syllable`, `syncedLyrics` — `Line`,
    `plainLyrics` — `Static`.
- **Без кастомных заголовков**, чтобы запросы оставались «простыми» и обходились без
  CORS-preflight.

### 4.5 Порядок и кэш

- Порядок «Лучшее доступное», по умолчанию:
  1. Spicy (если есть ключ и Spotify ID);
  2. LRCLIB с пословной синхронизацией;
  3. ЯМ (синхронный);
  4. LRCLIB (синхронный);
  5. ЯМ (простой текст);
  6. LRCLIB (простой текст).
- Настройка «Сначала Яндекс Музыка» ставит ЯМ (синхронный) первым.
- Источники можно отключать по одному.
- Кэш результата по id трека ЯМ:
  - в памяти — Map;
  - на диске — `api.storage`, 3 дня, не больше 40 записей, вытесняется самая старая.
- Повторные запросы того же трека склеиваются.
- Результат, пришедший после смены трека, отбрасывается: сверяем токен запроса.
- Следующий трек в очереди заранее не грузим (YAGNI).

## 5. Часы плеера

- Источник — `player.onChange(snapshot)`. Из снимка берём:
  - `progress.position` (секунды);
  - `status` (`playing`, `paused` и т. д.);
  - `track`.
- Каждый снимок задаёт базу `{posMs, at: performance.now(), playing}`.
- `getPosition() = playing ? posMs + (now − at) : posMs`, затем прибавляется сдвиг тайминга из настроек.
- Защита от дрожи: если новая база меньше показанной позиции не больше чем на 80 мс и это не
  перемотка, показанная позиция не откатывается назад, а ждёт.
- Скачок больше 1 с считаем перемоткой: позиция переставляется мгновенно, скролл без анимации.
- Команды:
  - `api.client.setProgress(sec)` — перемотка по клику на строку, с упреждением 300 мс, как в Spicy;
  - `togglePlayPause`, `next`, `previous`, `setVolume`.

## 6. Рендер (перенос Spicy Lyrics)

Переносится по `src/utils/Lyrics/*` и `src/css/Lyrics/*` коммита `56b5e07`.

- Применение: `ApplySyllableLyrics`, `ApplyLineLyrics`, `ApplyStaticLyrics`.
  - Строки, слова (`.word`, `.word-group`, `PartOfWord`, `LastWordInLine`), буквы
    (`.letterGroup` и `.letter.Emphasis`, если слог ≥ 1000 мс), бэк-вокал `.bg-line`,
    дуэты `.OppositeAligned`, RTL.
  - Точки `.musical-line`: в начале, если первая строка начинается позже 3 с, и в паузах ≥ 3 с.
    Тайминги точек — с отступом −550 мс.
- Аниматор: `LyricsAnimator.Animate` в обычном и Simple-режиме.
  - Пружины Spring (порт spr), кубические сплайны для Scale, YOffset и Glow.
  - Градиент `--gradient-position`, свечение `--text-shadow-*`, размытие `--BlurAmount` по
    расстоянию от активной строки.
  - Батч записи стилей с кэшем значений.
  - Экспериментальный «Refreshed Simple Lyrics» не переносим.
- Скролл: `ScrollToActiveLine`.
  - Центрирование активной строки; при ручной прокрутке колесом — пауза 750 мс и класс `HideLineBlur`.
  - Нативный smooth scroll, как в Spicy по умолчанию.
  - Без виртуализатора: обычный список строк; если понадобится, добавим
    `content-visibility: auto` для строк вне экрана.
- Клик по строке или слову перематывает трек. Наведение подсвечивает фон строки.
- Титры: «Written by: …», провайдер («Lyrics provided by Spicy Lyrics / Apple Music /
  Spotify / Яндекс Музыка / LRCLIB»), для `spicy_lyrics` — Uploader и Maker с аватарками
  и ссылками.
- Шрифт: `SpicyLyrics` с `https://fonts.spikerko.org/spicy-lyrics/source.css`, как в оригинале.
  Если в шрифте нет кириллицы, проверяем в превью и откатываемся на «YS Text» / системный.
- Цикл кадров: один `requestAnimationFrame`, пока вид открыт. При закрытии и `visibilitychange`
  он ставится на паузу.

## 7. Интерфейс

- Оверлей `#SpicyLyricsPage` в `document.body`, `position: fixed`. Режимы:
  - **Страница:** покрывает область контента ЯМ. Прямоугольник берётся из
    `[class*="CommonLayout_content"]` через ResizeObserver; навбар и плеер-бар ЯМ остаются видны.
  - **Кинорежим / полный экран:** всё окно плюс `requestFullscreen()`. NowBar показывает
    кнопки управления, таймлайн и громкость.
- Разметка по Spicy (`PageView.ts`): `.ContentBox` → `.NowBar` (MediaBox с обложкой,
  Metadata, Timeline) + `.LyricsContainer > .LyricsContent > .SpicyLyricsScrollContainer`
  + `.ViewControls`.
- ViewControls: кинорежим/полный экран, NowBar вкл/выкл, смена стороны NowBar, закрыть.
  `Esc` закрывает вид.
- Фон: Kawarp (`@kawarp/core` 1.3.1, MIT) с параметрами Spicy:
  - `warpIntensity 1`, `blurPasses 8`, `animationSpeed 0.1→1`, `saturation 1.5`,
    `dithering 0.008`, `transitionDuration 500/1000`;
  - на паузе скорость 0.1;
  - смена обложки — кроссфейдом слоёв `transition_In`/`transition_Out`.
  - Альтернативы: обложка, цвет обложки (усреднённый, затемнённый), без фона.
- Вход:
  - кнопка `Spicy Lyrics` в плеер-баре через `playerBarButtons` SDK;
  - опция «Заменить родную кнопку текста»: capture-listener на
    `[data-test-id="PLAYERBAR_DESKTOP_SYNC_LYRICS_BUTTON"]` и
    `[data-test-id*="SYNC_LYRICS_BUTTON"]` открывает наш вид вместо родного.
- Состояния: загрузка (точечный лоадер Spicy), «Текст не найден», «Нет ключа Spicy —
  показаны тексты Яндекс Музыки» (однократная подсказка).

## 8. Настройки (SDK typed settings)

| Ключ | Тип | По умолчанию |
|---|---|---|
| `spicyApiKey` | text | `""` |
| `spotifyClientId`, `spotifyClientSecret` | text | `""` |
| `sourceOrder` | select: `best`, `yandexFirst` | `best` |
| `useSpicy`, `useYandex`, `useLrclib` | boolean | `true` |
| `simpleLyricsMode` | boolean | `false` |
| `lineBlur` | boolean | `true` |
| `lineHoverBackground` | boolean | `true` |
| `backgroundStyle` | select: `dynamic`, `cover`, `color`, `none` | `dynamic` |
| `useSpicyFont` | boolean | `true` |
| `timingOffsetMs` | number −2000…2000, шаг 10 | `0` |
| `replaceNativeLyricsButton` | boolean | `true` |

Состояние вида (NowBar открыт, сторона, последний режим) хранится в `api.storage`.

## 9. Обработка ошибок

- Каждый источник возвращает `{ok, data}` или `{ok: false, reason}`. Цепочка идёт дальше,
  итоговая причина пишется в лог (`api.logger`).
- Сетевые таймауты 10 с, внешний `AbortController` на смену трека.
- Кадр анимации в `try/catch`. После 5 ошибок подряд цикл останавливается, остаётся
  статичный текст и запись в лог; аддон при этом не падает.
- Пустой или битый ответ считается «не найдено».

## 10. Тестирование

- **vitest (юнит):**
  - LRC и enhanced LRC;
  - lyricsfile YAML;
  - разбор ответов Spicy и обработка ошибок;
  - выбор кандидата LRCLIB и Spotify;
  - PlayerClock (интерполяция, анти-дрожь, перемотка);
  - вставка точек-пауз и тайминги точек;
  - структура DOM после apply (happy-dom).
- **Превью** (`preview/`, Vite dev server):
  - мок `Host` с часами, обложкой и примерами Syllable, Line и Static;
  - сравнение со скриншотами Spicy в браузерной панели.
- **Живая проверка:**
  - сборка, затем доставка в `%APPDATA%\PulseSync\addons\spicy-lyrics` и `POST /dev/addons/reload`;
  - проверка в ЯМ через DevTools мода (devMode) или удалённую отладку;
  - перезапуск ЯМ — только с согласия пользователя.

## 11. Сборка и доставка

- `package.json` (Node 22+):
  - `build` — Vite + `addonPlugin`;
  - `deliver` — копирование с сохранением `pulsesync.settings.json`, POST на reload;
  - `dev` — build --watch + deliver;
  - `test` — vitest;
  - `preview` — Vite dev server.
- Манифест: `id: "spicy-lyrics"`, `directoryName: "spicy-lyrics"`, `name: "Spicy Lyrics"`,
  `version: "1.0.0"`, `cssScope: "global"`, `allowedUrls` из §2.

## 12. Лицензии

- Проект — AGPL-3.0: рендер, CSS и иконки перенесены из Spicy Lyrics. В README указаны
  авторство и ссылка на исходник.
- Зависимости:
  - `@kawarp/core` (MIT);
  - `cubic-spline` (MIT);
  - `d3-ease` (BSD-3-Clause);
  - порт spr (MIT, Fraktality);
  - `@pulsesync/addon-sdk` (GPL-3.0-or-later; совместима с AGPL-3.0).
- Код шаблона PulseSync-ExampleAddon (своя лицензия) не копируем, конфигурацию пишем сами.

## 13. Вне рамок v1

- Романизация (kuroshiro, pinyin и т. п.), переводы.
- Lyrics Manager / импорт TTML.
- PiP-окно, карточка в сайдбаре, Compact- и Minimal-режимы.
- Refreshed Simple Lyrics, фон из шапки артиста, Canvas-видео, скорость фона по аудиоанализу.
