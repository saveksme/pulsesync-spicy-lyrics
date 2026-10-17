import { defineAddon } from "@pulsesync/addon-sdk";
import { type AppController, startApp } from "./app/App";
import { createSdkHost } from "./host/sdkHost";
import { settingsDefinition } from "./settingsDefinition";
import "./styles";

let app: AppController | null = null;

export default defineAddon({
  id: "spicy-lyrics",
  name: "Spicy Lyrics",
  settings: settingsDefinition,
  playerBarButtons: [
    {
      id: "open-spicy-lyrics",
      label: "Spicy Lyrics",
      description: "Текст песни в стиле Spicy Lyrics",
      // The player bar draws icons at size xs; Yandex Music's sprite has syncLyrics_xs but only lyrics_xxs.
      icon: "syncLyrics",
      onClick: () => app?.toggle(),
    },
  ],
  start(api) {
    const current = startApp(createSdkHost(api));
    app = current;
    return () => {
      current.dispose();
      if (app === current) app = null;
    };
  },
});
