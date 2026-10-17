import { defineAddonSettings } from "@pulsesync/addon-sdk";
import { SETTINGS_SCHEMA } from "./settings.ts";

export const settingsDefinition = defineAddonSettings(SETTINGS_SCHEMA, { title: "Spicy Lyrics" });
