const addonConfig = {
    id: 'spicy-lyrics',
    directoryName: 'spicy-lyrics',
    name: 'SP Lyrics',
    description:
        'Тексты песен в стиле Spicy Lyrics: пословная синхронизация, пружинная анимация, динамический фон и NowBar. Источник — библиотека Spicy Lyrics (Apple Music, сообщество) с запасными источниками Яндекс Музыки и LRCLIB.',
    version: '1.0.0',
    author: 'saveksme',
    image: 'Assets/avatar.png',
    banner: 'Assets/banner.png',
    libraryLogo: 'Assets/avatar.png',
    tags: ['lyrics', 'spicy lyrics', 'karaoke', 'player'],
    dependencies: [],
    allowedUrls: [
        'https://api.spicylyrics.org',
        'https://labs.api.listenbrainz.org',
        'https://lrclib.net',
        'https://open.spotify.com',
        'https://api-partner.spotify.com',
        'https://accounts.spotify.com',
        'https://api.spotify.com',
        'https://fonts.spikerko.org',
        'https://avatars.yandex.net',
        'https://cdn.discordapp.com',
    ],
    supportedVersions: [],
    cssScope: 'global',
    requirements: { minHostApi: 1, capabilities: ['lifecycle-v1', 'async-start-v1', 'net-per-addon-v1', 'resource-read-v1'] },
}

export default addonConfig
