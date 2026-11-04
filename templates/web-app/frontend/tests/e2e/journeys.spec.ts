import { expect, test } from "./fixtures";

import {
  ADMIN,
  EDITOR,
  TINY_JPEG,
  VIEWER,
  apiAs,
  ensureUser,
  goOffline,
  goOnline,
  haveAdmin,
  login,
  waitingIds,
} from "./helpers";

// Journeys run in order and share one site: the editor's survey is what the
// later tests edit, archive and work offline on.
test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const siteName = `E2E Site ${stamp}`;
const surveyorName = `E2E Surveyor ${stamp}`;
let siteId = "";
let surveyPath = "";

test.beforeAll(async ({ baseURL }) => {
  test.skip(!haveAdmin, "Set ADMIN_EMAIL / ADMIN_PASSWORD to run the e2e journeys");
  const admin = await apiAs(baseURL!, ADMIN);
  await ensureUser(admin, VIEWER, "viewer");
  await ensureUser(admin, EDITOR, "editor");
  const site = await admin.post("/api/sites", {
    data: { name: siteName, site_type: "bridge", latitude: 51.5, longitude: -0.12 },
  });
  expect(site.status()).toBe(201);
  siteId = (await site.json()).id;
  await admin.dispose();
});

test("a viewer can look but not change anything", async ({ page }) => {
  await login(page, VIEWER);
  await page.goto("/sites");
  await expect(page.getByRole("heading", { name: "Sites" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add site" })).toHaveCount(0);

  await page.goto(`/sites/${siteId}`);
  await expect(page.getByRole("heading", { name: siteName })).toBeVisible();
  await expect(page.getByLabel(/^Name/)).toBeDisabled();
  await expect(page.getByRole("button", { name: /save changes/i })).toHaveCount(0);
});

test("an editor records a survey, then adds a photo and a comment", async ({ page }) => {
  await login(page, EDITOR);
  await page.goto(`/sites/${siteId}`);

  await page.getByRole("button", { name: "Add survey" }).first().click();
  const surveyDialog = page.getByRole("dialog");
  await surveyDialog.getByLabel(/^Surveyor/).fill(surveyorName);
  await surveyDialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Survey added.")).toBeVisible();

  await page.getByRole("link", { name: /^Survey / }).first().click();
  await expect(page.getByRole("heading", { name: /^Survey · / })).toBeVisible();
  surveyPath = new URL(page.url()).pathname;

  // Photo: stripped and thumbnailed by the server, shown in the grid.
  await page.getByRole("tab", { name: /attachments/i }).click();
  await page.locator('input[type="file"]:not([capture])').setInputFiles({
    name: "IMG_0001.jpg",
    mimeType: "image/jpeg",
    buffer: TINY_JPEG,
  });
  await expect(page.getByRole("button", { name: "Open IMG_0001.jpg" })).toBeVisible();

  await page.getByRole("tab", { name: /comments/i }).click();
  await page.getByRole("button", { name: "Add comment" }).click();
  await page.getByLabel("New comment").fill("Railings need repainting");
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByText("Railings need repainting")).toBeVisible();
});

test("inline edit and search on the Surveys table", async ({ page }) => {
  await login(page, EDITOR);
  await page.goto("/surveys");
  await page.getByPlaceholder(/search/i).first().fill(surveyorName);
  const row = page.getByRole("row").filter({ hasText: surveyorName });
  await expect(row).toHaveCount(1);

  await page.getByRole("button", { name: "Edit mode" }).click();
  await row.getByText("Draft").click();
  await page.getByRole("option", { name: "Completed" }).click();
  await expect(row.getByText("Completed")).toBeVisible();
});

test("an editor archives a site and restores it", async ({ page }) => {
  await login(page, EDITOR);
  await page.goto(`/sites/${siteId}`);
  // Archive and Restore live in the page's "⋯" menu.
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Archive site" }).click();
  await expect(page.getByText("Site archived.")).toBeVisible();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Restore site" }).click();
  await expect(page.getByText("Site restored.")).toBeVisible();
});

test("a comment written offline uploads when the connection returns", async ({ page, context }) => {
  await login(page, EDITOR);
  await page.goto(surveyPath);
  await page.getByRole("tab", { name: /comments/i }).click();

  await context.setOffline(true);
  await page.getByRole("button", { name: "Add comment" }).click();
  await page.getByLabel("New comment").fill("Written with no signal");
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await expect(page.getByRole("button", { name: /offline · 1 waiting/i })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText(/uploaded 1 change made offline/i)).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await page.getByRole("tab", { name: /comments/i }).click();
  await expect(page.getByText("Written with no signal")).toBeVisible();
});

test("the Surveys table opens a row's page", async ({ page }) => {
  await login(page, EDITOR);
  await page.goto("/surveys");
  await page.getByPlaceholder(/search/i).first().fill(surveyorName);
  const row = page.getByRole("row").filter({ hasText: surveyorName });
  await expect(row).toHaveCount(1);
  await row.getByRole("cell").nth(1).click();
  await expect(page).toHaveURL(new RegExp(`${surveyPath}$`));
  await expect(page.getByRole("heading", { name: /^Survey · / })).toBeVisible();
});

test("on a phone, + adds a survey to the site being viewed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, EDITOR);
  await page.goto(`/sites/${siteId}`);
  await expect(page.getByRole("heading", { name: siteName })).toBeVisible();

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: /New survey/ }).click();
  const dialog = page.getByRole("dialog");
  // Started on this site: it's named, and the site isn't asked for again.
  await expect(dialog.getByText(siteName)).toBeVisible();
  await expect(dialog.getByLabel(/^Site/)).toHaveCount(0);
  await dialog.getByLabel(/^Surveyor/).fill(`E2E phone surveyor ${stamp}`);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Survey added.")).toBeVisible();
});

test.describe("with no signal", () => {
  // Requests made while offline fail, and the browser says so.
  test.use({ allowedErrors: /TypeError: Failed to fetch/ });

  test("with no signal: signed in, every record opens, and new work uploads in order", async ({
    page,
    context,
    baseURL,
  }) => {
    await login(page, EDITOR);
    // Needs the built app's service worker (the composed stack), not the dev server.
    // A worker only controls pages loaded after it activates, so reload once, as
    // a returning visitor would.
    await page.waitForTimeout(1_000);
    await page.reload();
    const hasWorker = await page
      .waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasWorker, "Offline needs the production build's service worker (PLAYWRIGHT_BASE_URL)");
    // The background sync has put every record on the device.
    await page.waitForFunction(() => localStorage.getItem("webapp-last-sync"), null, { timeout: 20_000 });

    await goOffline(context);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Records never opened in this browser still open.
    await page.goto(`/sites/${siteId}`);
    await expect(page.getByRole("heading", { name: siteName })).toBeVisible();
    await page.goto(surveyPath);
    await expect(page.getByRole("heading", { name: /^Survey · / })).toBeVisible();

    // A new site, a survey on it, and a comment on that survey.
    const offlineSite = `E2E offline site ${stamp}`;
    await page.goto("/sites?new=1");
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Name/).fill(offlineSite);
    await dialog.getByPlaceholder(/easting, northing/i).fill("530000, 180000");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved on this device").first()).toBeVisible();
    const newSite = (await waitingIds(page))["/api/sites"][0];
    await page.goto(`/sites/${newSite}`);
    await expect(page.getByRole("heading", { name: offlineSite })).toBeVisible();
    await expect(page.getByText("Waiting to upload")).toBeVisible();

    await page.goto(`/surveys?new=1&site=${newSite}`);
    dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Surveyor/).fill("E2E offline surveyor");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    const newSurvey = (await waitingIds(page))["/api/surveys"][0];
    await page.goto(`/surveys/${newSurvey}`);
    await expect(page.getByRole("heading", { name: /^Survey · / })).toBeVisible();
    await expect(page.getByText("Waiting to upload")).toBeVisible();

    await page.getByRole("tab", { name: /comments/i }).click();
    await page.getByRole("button", { name: "Add comment" }).click();
    await page.getByLabel("New comment").fill("E2E offline comment");
    await page.getByRole("button", { name: "Post" }).click();
    await expect(page.getByText("E2E offline comment")).toBeVisible();

    // Still there after a reload with no signal.
    await page.reload();
    await expect(page.getByRole("heading", { name: /^Survey · / })).toBeVisible();

    // Back online: everything uploads, parents first.
    await goOnline(context);
    await expect(page.getByText(/uploaded 3 changes made offline/i)).toBeVisible({ timeout: 20_000 });
    const api = await apiAs(baseURL!, EDITOR);
    for (const path of [`/api/sites/${newSite}`, `/api/surveys/${newSurvey}`]) {
      expect((await api.get(path)).status(), path).toBe(200);
    }
    const comments = await (await api.get(`/api/comments?entity=survey&entity_id=${newSurvey}`)).json();
    expect(comments.items.map((c: { text: string }) => c.text)).toEqual(["E2E offline comment"]);
    await api.dispose();
    await expect(page.getByText("Waiting to upload")).toHaveCount(0);
  });
});

// A plain white tile, so the only coloured pixels on the map are its overlays.
const WHITE_TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
  "base64",
);

test("site circles show on first load even while base-map tiles are slow", async ({ page, context }) => {
  // Real networks deliver tiles slowly; the overlays must not wait for a
  // base-map swap to appear (audit 2026-09-27, SPEC-35).
  await context.route(/tile\.openstreetmap\.org|arcgisonline|tile\.opentopomap/, async (route) => {
    await new Promise((done) => setTimeout(done, 600));
    await route.fulfill({ status: 200, body: WHITE_TILE, contentType: "image/png" });
  });
  await login(page, ADMIN);
  // The journey site is at 51.5, -0.12 → BNG ≈ 530 591 / 179 571.
  await page.goto("/map?e=530591&n=179571&z=13");
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const gl = document.querySelector<HTMLCanvasElement>("canvas.maplibregl-canvas");
          if (!gl) return 0;
          const c = document.createElement("canvas");
          c.width = gl.width;
          c.height = gl.height;
          const ctx = c.getContext("2d")!;
          ctx.drawImage(gl, 0, 0);
          const px = ctx.getImageData(0, 0, c.width, c.height).data;
          let coloured = 0;
          for (let i = 0; i < px.length; i += 4) {
            if (Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]) > 60) coloured++;
          }
          return coloured;
        }),
      { timeout: 10_000, message: "coloured site circles on the map canvas" },
    )
    .toBeGreaterThan(20);
});

test("on a small phone, every map panel fits the screen and its tabs stay in reach", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await login(page, ADMIN);
  await page.goto("/map");
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  const sheet = page.getByRole("dialog");
  // Open the longest bits: every record layer's style and filter.
  for (const name of ["Sites", "Surveys"]) {
    await sheet.getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
  }
  const fits = () =>
    page.evaluate(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const wide = [...document.querySelectorAll('[role="dialog"] *')].filter((el) => {
        const r = el.getBoundingClientRect();
        // (sr-only text is 1 px and positioned just off-edge — not seen.)
        return r.width > 1 && (r.right > vw + 0.5 || r.left < -0.5);
      });
      const tabs = document.querySelector('[role="dialog"] [role="tablist"]')!.getBoundingClientRect();
      return { wide: wide.length, tabsOnScreen: tabs.top >= 0 && tabs.bottom <= vh };
    });
  for (const tab of ["Layers", "Draw", "Export"]) {
    await sheet.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
    expect(await fits(), tab).toEqual({ wide: 0, tabsOnScreen: true });
  }
});
