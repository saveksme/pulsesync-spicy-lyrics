# PulseSync · SP Lyrics

> **English:** an add-on for [PulseSync](https://github.com/PulseSync-LLC/PulseSync-client), a Yandex Music
> desktop mod, that brings [Spicy Lyrics](https://github.com/Spikerko/spicy-lyrics) to Yandex Music: lyrics from
> the Spicy Lyrics API (with Yandex Music and LRCLIB as fallbacks) and its look — word-synced animation,
> NowBar, cinema view and the Kawarp dynamic background. The provider of every response is always shown,
> and community syncs credit their uploader and maker. Licensed under AGPL-3.0, like Spicy Lyrics.

Аддон для [PulseSync](https://github.com/PulseSync-LLC/PulseSync-client) (мод Яндекс Музыки), который переносит
[Spicy Lyrics](https://github.com/Spikerko/spicy-lyrics) в Яндекс Музыку: источник текстов (Spicy Lyrics API)
и его вид — пословную анимацию, NowBar, кинорежим и динамический фон Kawarp.

Описание для пользователей — в [addon/README.md](addon/README.md) (его же показывает карточка аддона в PulseSync).

## Сборка и установка

Нужны Node.js 22.12+ и запущенный клиент PulseSync с Яндекс Музыкой.

```bash
npm install
npm run build      # dist/spicy-lyrics: metadata.json, script.js, script.css, Assets
npm run deliver    # копирует в %APPDATA%\PulseSync\addons\spicy-lyrics и перезагружает аддон
```

`deliver` сохраняет `pulsesync.settings.json` (настройки пользователя) и отказывается перезаписывать
аддон, установленный из магазина. Перезагрузка идёт через dev-эндпоинт клиента
`POST http://127.0.0.1:2007/dev/addons/reload`; если клиент не запущен, файлы всё равно копируются.

## Разработка

```bash
npm run dev        # сборка в режиме watch, после каждой сборки — deliver
npm test           # vitest (node + happy-dom)
npm run typecheck  # tsc --noEmit
npm run preview    # превью страницы с фиктивным плеером: http://127.0.0.1:5199
```

В превью: `Space` — пауза, `←`/`→` — перемотка, `1`/`2`/`3` — слоги/строки/статичный текст,
`s` — простой режим, `b` — стиль фона, `t` — смена обложки, `o` — открыть/закрыть.
Параметры адреса: `?lyrics=line|static`, `simple=1`, `bg=cover|color|none`, `at=12.5`, `paused=1`, `mode=page` (вид в области контента вместо всего окна).

## Устройство

- `src/main.ts` — точка входа web-addon (`defineAddon`): кнопка в плеер-баре, запуск и остановка.
- `src/host/sdkHost.ts` — адаптер PulseSync SDK к интерфейсу `Host` (`src/core/host.ts`).
- `src/app/` — оркестратор (трек → загрузка текста → страница), перехват родной кнопки текста и навигация Яндекс Музыки (ссылки на исполнителей, сворачивание при переходах).
- `src/sources/` — Spicy Lyrics API, подбор Spotify ID, Яндекс Музыка, LRCLIB, LRC и lyricsfile, цепочка источников с кэшем.
- `src/render/` — порт рендера Spicy: построение DOM, аниматор (пружины, сплайны), автоскролл.
- `src/ui/` — страница-оверлей, NowBar, фон Kawarp, иконки.
- `src/styles/` — CSS Spicy Lyrics (перенесён скриптом) и `ym.css` с правками под Яндекс Музыку.
- `preview/` — превью для браузера; `tests/` — тесты.

## Ключ Spicy Lyrics

Аддон использует публичный клиентский ключ (`sl_pk_…`, константа `BUILT_IN_SPICY_KEY` в
`src/sources/spicyApi.ts`). По правилам Spicy такие ключи предназначены для кода, который раздают
пользователям: он открыт и ограничен по каждому пользователю. Секретный ключ `sl_sk_…` в код класть нельзя.

Яндекс Музыка отправляет запросы со страницы с `Origin: music-application://desktop`, а такой Origin в
кабинете Spicy разрешить нельзя. Поэтому запросы к Spicy идут из Web Worker, запущенного с `data:`-адреса
(`src/host/opaqueFetch.ts`): у него «непрозрачное» происхождение, и запрос уходит с `Origin: null`, который
разрешён в списке ключа. Воркер выполняет только фиксированный код запроса, не видит страницу и данные
Яндекс Музыки, а его запросы проходят через сетевые правила PulseSync. Если воркер не запустится, аддон
обращается к Spicy обычным способом.

Если вы делаете форк или свою сборку, создайте своё приложение на
[developers.spicylyrics.org](https://developers.spicylyrics.org), включите в нём Client access, добавьте
в Allowed origins значение `null` и замените ключ на свой, чтобы не расходовать общий лимит. Тексты Spicy показываются по их правилам:
источник виден всегда, для текстов сообщества указаны загрузивший и синхронизировавший, кэш не дольше 30 дней
(у аддона — 3 дня).

## Поиск трека в Spotify

Spicy находит тексты только по Spotify ID, а Яндекс Музыка его не знает. Справочник ListenBrainz не знает
большинства новых и русских релизов, поэтому аддон ищет трек в каталоге Spotify без ключей
(`src/sources/spotifyWebSearch.ts`), так же как официальное приложение
[Spicy Lyrics Mobile](https://github.com/spicylyrics/mobile). Embed-страница плеера Spotify выдаёт каждому
посетителю анонимную сессию веб-плеера, а поиск веб-плеера (`api-partner.spotify.com/pathfinder`,
операция `searchDesktop`) её принимает. Это недокументированный путь: если Spotify сменит хеш сохранённого
запроса (ответ `PersistedQueryNotFound`), поиск отключится до обновления аддона, а подбор продолжит работать
через ListenBrainz и, если указаны, свои ключи Spotify. Новый хеш берётся из веб-плеера Spotify или из Spicy
Lyrics Mobile (`AnonymousSpotifyCatalogSearch.kt`).

## Лицензии

Код аддона распространяется по AGPL-3.0-only (см. [LICENSE](LICENSE)), потому что рендер, стили и
иконки перенесены из Spicy Lyrics (© Spikerko, AGPL-3.0). Kawarp — MIT, PulseSync Addon SDK —
GPL-3.0-or-later. Шрифт SpicyLyrics в сборку не входит: он загружается с `fonts.spikerko.org`.
