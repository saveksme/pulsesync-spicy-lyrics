import { spawn } from "node:child_process";
import { addonPlugin, defineAddonManifest } from "@pulsesync/addon-sdk/vite";
import { defineConfig, type Plugin } from "vite";
import addonConfig from "./addon.config.mjs";
import { settingsDefinition } from "./src/settingsDefinition.ts";

// In watch mode every finished build is delivered to PulseSync and hot-reloaded.
function deliverOnWatch(): Plugin {
  let watching = false;
  return {
    name: "spicy-lyrics-deliver",
    apply: "build",
    configResolved(config) {
      watching = Boolean(config.build.watch);
    },
    closeBundle: {
      order: "post",
      sequential: true,
      handler() {
        if (!watching) return;
        return new Promise<void>((resolve) => {
          const child = spawn(process.execPath, ["scripts/deliver.mjs"], { stdio: "inherit" });
          child.on("exit", () => resolve());
        });
      },
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    addonPlugin({
      manifest: defineAddonManifest(addonConfig),
      settings: settingsDefinition,
      entry: "src/main.ts",
      minify: mode === "development" ? false : "oxc",
    }),
    deliverOnWatch(),
  ],
}));
