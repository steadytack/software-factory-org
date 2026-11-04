import { expectAccessible, test } from "./fixtures";
import { ADMIN, haveAdmin, login } from "./helpers";

// Every main page, checked by axe once it has drawn. A new page goes here too.
const PAGES = ["/", "/sites", "/surveys", "/map", "/admin", "/profile"];

test.beforeEach(() => {
  test.skip(!haveAdmin, "Set ADMIN_EMAIL / ADMIN_PASSWORD to run the e2e journeys");
});

test("the login page is accessible", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").waitFor();
  await expectAccessible(page);
});

for (const path of PAGES) {
  test(`${path} is accessible`, async ({ page }) => {
    await login(page, ADMIN);
    await page.goto(path);
    await page.getByRole("heading").first().waitFor();
    await page.waitForLoadState("networkidle");
    await expectAccessible(page);
  });
}
