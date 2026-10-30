import { defineConfig, devices } from "@playwright/test";

// Target the Vite dev server by default (auto-started below). To run the
// critical journey against the composed stack instead, set
// PLAYWRIGHT_BASE_URL=http://localhost:5174 — the dev server is then not
// started (the stack already serves the SPA on 5174 via nginx).
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const useDevServer = !process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: useDevServer
    ? {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
      }
    : undefined,
});
