import { defineConfig } from "vite";

// Browser preview of the lyrics page with a mock player (npm run preview).
// fonts.spikerko.org sends no CORS headers (inside Yandex Music the mod adds
// them), so the preview reaches the Spicy font through this proxy.
export default defineConfig({
  root: "preview",
  server: {
    host: "127.0.0.1",
    port: 5199,
    strictPort: true,
    proxy: { "/spicy-font": { target: "https://fonts.spikerko.org", changeOrigin: true, rewrite: (path) => path.replace(/^\/spicy-font/, "") } },
  },
  build: { target: "esnext" },
});
