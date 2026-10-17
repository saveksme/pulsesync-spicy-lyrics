# Поиск Spotify для Spicy Lyrics (Cloudflare Worker)

Библиотека Spicy Lyrics ищет тексты по **Spotify ID** трека, а Яндекс Музыка его не знает. Бесплатный справочник ListenBrainz, которым аддон пользуется без ключей, не знает большинства новых и русских релизов, и пословные тексты для них не находятся.

Этот маленький сервер ищет трек в каталоге Spotify от имени **вашего** Spotify-приложения. Ключ приложения хранится в секретах Cloudflare, в коде аддона его нет, и пользователям аддона ничего настраивать не нужно.

```
GET /search?track=<название>&artist=<исполнитель>
→ { "items": [{ "id", "name", "duration_ms", "artists": [{ "name" }], "album": { "name" } }] }
```

Ответы кэшируются на краю Cloudflare на 7 дней (промахи на сутки), так что к Spotify уходят только новые запросы. Бесплатного тарифа Cloudflare Workers (100 000 запросов в сутки) хватает с запасом.

## 1. Spotify-приложение

1. Откройте [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) и войдите своим аккаунтом Spotify.
2. **Create app**: любое имя (например, «Spicy Lyrics YM») и описание. В **Redirect URIs** впишите `http://127.0.0.1:8888/callback` (поле обязательное, сервер его не использует). В «Which API/SDKs are you planning to use?» отметьте **Web API**. Согласитесь с условиями и сохраните.
3. В **Settings** приложения скопируйте **Client ID** и **Client secret** (кнопка «View client secret»).

## 2. Cloudflare Worker

Нужен бесплатный аккаунт [Cloudflare](https://dash.cloudflare.com/sign-up) и Node.js. Все команды выполняются из этой папки (`server/spotify-search`):

```bash
npx wrangler login
```

Откроется браузер: разрешите доступ своему аккаунту Cloudflare.

```bash
npx wrangler deploy
```

При первом деплое Wrangler предложит выбрать поддомен `workers.dev`. В конце он напечатает адрес сервера вида `https://spicy-lyrics-spotify.<поддомен>.workers.dev`.

Теперь секреты. Каждая команда попросит вставить значение:

```bash
npx wrangler secret put SPOTIFY_CLIENT_ID
```

```bash
npx wrangler secret put SPOTIFY_CLIENT_SECRET
```

Проверка — откройте в браузере (подставьте свой адрес):

```
https://spicy-lyrics-spotify.<поддомен>.workers.dev/search?track=STORM%20II&artist=GENER8ION
```

В ответе должен быть список `items` с треками.

## 3. Подключение к аддону

Адрес сервера прописывается в двух местах, затем аддон пересобирается:

- `src/sources/spotifyId.ts` → `SPOTIFY_SEARCH_SERVER`;
- `addon.config.mjs` → `allowedUrls` (PulseSync пускает аддон только на перечисленные адреса).

## Если что-то пошло не так

- `{"error":"not_configured"}` — не заданы секреты `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`.
- `{"error":"upstream_error","status":400}` или `401` — неверные Client ID или Client secret.
- `429` — Spotify просит подождать. Аддон в это время ищет через ListenBrainz и попробует снова позже.
