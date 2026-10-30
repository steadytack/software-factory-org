import { readFileSync } from "node:fs";
import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// Build identity, shown in bug reports (lib/diagnostics.ts).
const APP_VERSION = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version as string;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_BUILT__: JSON.stringify(new Date().toISOString()),
  },
  // Module workers (the map's data-file reader lazy-loads the shapefile
  // parser, which the default single-file format can't split out).
  worker: { format: "es" },
  plugins: [
    react(),
    tailwindcss(),
    // Installable app + offline shell. The service worker precaches the
    // built app and keeps recent API reads (network first, cache when
    // there's no signal), so pages still open on site. Writes made offline
    // go through the outbox (src/lib/outbox.ts), not the service worker.
    VitePWA({
      // "prompt": a new version waits until the user reloads (see main.tsx),
      // so files never change under a page that is in use.
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "theme-init.js"],
      manifest: {
        name: "Web App Template",
        short_name: "Web App",
        description: "Sites, surveys, findings and actions — in the office and on site.",
        theme_color: "#0c64df",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        // The map chunk is large; precache it too so the map opens offline.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Photo thumbnails rarely change: serve from cache first.
            urlPattern: ({ url }) => /^\/api\/attachments\/[^/]+\/thumbnail$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "thumbnails",
              expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 3600 },
            },
          },
          {
            // Basemap tiles already seen keep working offline, on the map
            // and the site pages' mini maps. Cached as viewed only: the
            // providers' terms don't allow bulk-downloading areas ahead.
            // (Inlined: this function is copied into the service worker.)
            urlPattern: ({ url }) =>
              /(^|\.)(basemaps\.cartocdn\.com|tile\.openstreetmap\.org|arcgisonline\.com|api\.os\.uk|api\.maptiler\.com)$/.test(
                url.hostname,
              ) && /\/\d+\/\d+\/\d+(@2x)?\.(png|jpe?g|webp)$|\/tile\/\d+\/\d+\/\d+$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles",
              expiration: { maxEntries: 3000, maxAgeSeconds: 30 * 24 * 3600, purgeOnQuotaError: true },
              // Tiles load with CORS, so a good one is a 200. (Opaque
              // responses would each count several MB against the quota.)
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Other reads: fresh when online, last copy when not. Never
            // auth/session calls or file downloads.
            urlPattern: ({ url, request }) =>
              request.method === "GET" &&
              url.pathname.startsWith("/api/") &&
              !url.pathname.startsWith("/api/auth/") &&
              !url.pathname.endsWith("/download") &&
              !url.pathname.startsWith("/api/admin/export"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-reads",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 300, maxAgeSeconds: 3 * 24 * 3600 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Libraries change far less often than app code: in their own
        // chunks they stay cached across deploys. (maplibre and friends are
        // already split out by the lazily-loaded map routes.)
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return "vendor-react";
          }
          if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return "vendor-tanstack";
          if (/[\\/]node_modules[\\/](radix-ui|@radix-ui)[\\/]/.test(id)) return "vendor-radix";
          return undefined;
        },
      },
    },
  },
  server: {
    // Dev server proxies /api to the backend so cookies are first-party here too.
    // Backend is published on 127.0.0.1:8001 (see docker-compose.yml).
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8001",
        changeOrigin: false,
      },
    },
  },
});
