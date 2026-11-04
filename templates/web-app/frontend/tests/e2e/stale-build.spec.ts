import { expect, test } from "./fixtures";

import { ADMIN, haveAdmin, login } from "./helpers";

// Without a service worker, so the page's own requests can be answered the
// way a server that has moved on to a newer build answers them.
test.use({ serviceWorkers: "block" });
// These tests take a page file away on purpose, so the browser's errors for
// it are expected.
test.use({ allowedErrors: /Failed to load module script|Failed to fetch dynamically imported module/ });

test.beforeEach(() => {
  test.skip(!haveAdmin, "Set ADMIN_EMAIL / ADMIN_PASSWORD to run the e2e journeys");
});

const MAP_CHUNK = /\/assets\/MapPage-[^/]+\.js/;

test("a tab on an old build reloads itself once when a page file has gone", async ({ page }) => {
  await login(page, ADMIN);
  let hits = 0;
  await page.route(MAP_CHUNK, (route) => {
    hits++;
    // First ask: the old SPA fallback (the app page, as "text/html").
    if (hits === 1) return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html>" });
    return route.continue();
  });
  await page.getByRole("link", { name: "Map" }).first().click();
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 20_000 });
  expect(hits).toBe(2);
});

test("if the file is still missing after a reload, it says so and stops", async ({ page }) => {
  await login(page, ADMIN);
  let hits = 0;
  await page.route(MAP_CHUNK, (route) => {
    hits++;
    return route.fulfill({ status: 404, body: "not found" });
  });
  await page.getByRole("link", { name: "Map" }).first().click();
  await expect(page.getByRole("heading", { name: "The app has been updated" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
  // One try, one reload, one more try: not a loop.
  await page.waitForTimeout(2000);
  expect(hits).toBe(2);
});
