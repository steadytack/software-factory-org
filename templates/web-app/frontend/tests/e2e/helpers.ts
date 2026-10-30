import { expect, request, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

/** E2E runs against a running stack (see playwright.config.ts). The admin
 *  comes from the environment; the viewer and editor are created (or
 *  reset) here with throwaway passwords, so a run never depends on hand-
 *  made accounts. Requires MULTI_USER_ENABLED=true. */
export const ADMIN = {
  email: process.env.ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.ADMIN_PASSWORD ?? "",
};
export const VIEWER = { email: "e2e-viewer@example.com", password: "E2E#Viewer#Pass1" };
export const EDITOR = { email: "e2e-editor@example.com", password: "E2E#Editor#Pass1" };

export const haveAdmin = Boolean(ADMIN.password);

export async function apiAs(baseURL: string, who: { email: string; password: string }) {
  const ctx = await request.newContext({ baseURL });
  const res = await ctx.post("/api/auth/login", { data: who });
  expect(res.status(), `login as ${who.email}`).toBe(200);
  return ctx;
}

export async function ensureUser(
  admin: APIRequestContext,
  who: { email: string; password: string },
  role: "viewer" | "editor",
) {
  const created = await admin.post("/api/users", {
    data: { email: who.email, password: who.password, role, display_name: `E2E ${role}` },
  });
  if (created.status() === 201) return;
  expect(created.status()).toBe(409);
  const users = (await (await admin.get("/api/users")).json()) as { id: string; email: string }[];
  const user = users.find((u) => u.email === who.email);
  if (!user) throw new Error(`user ${who.email} not found`);
  await admin.patch(`/api/users/${user.id}`, { data: { role, is_active: true } });
  await admin.post(`/api/users/${user.id}/password`, { data: { password: who.password } });
}

export async function login(page: Page, who: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

/** A small valid JPEG, so uploads exercise the real photo pipeline. */
export const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDIooor64+dP/Z",
  "base64",
);

/** No signal. `setOffline` alone doesn't stop the service worker's own
 *  requests (it would still answer reads from the network), so every
 *  request is refused as well. */
export async function goOffline(context: BrowserContext) {
  await context.setOffline(true);
  await context.route("**/*", (route) => route.abort("internetdisconnected"));
}

export async function goOnline(context: BrowserContext) {
  await context.unroute("**/*");
  await context.setOffline(false);
}

/** Ids of the records waiting in the offline outbox (lib/outbox.ts), by
 *  API path, oldest first — to open a record made offline by its URL. */
export async function waitingIds(page: Page): Promise<Record<string, string[]>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, string[]>>((resolve, reject) => {
        const open = indexedDB.open("webapp-outbox");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction("entries").objectStore("entries").getAll();
          all.onsuccess = () => {
            const ids: Record<string, string[]> = {};
            const entries = (all.result as { method: string; url: string; body?: string; createdAt: string }[])
              .filter((e) => e.method === "POST" && e.body)
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            for (const e of entries) {
              const id = (JSON.parse(e.body!) as { id?: string }).id;
              if (id) (ids[e.url] ??= []).push(id);
            }
            resolve(ids);
          };
        };
      }),
  );
}
