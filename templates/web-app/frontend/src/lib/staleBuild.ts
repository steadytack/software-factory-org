/**
 * After a deploy, a tab can still be running the old app shell (the service
 * worker keeps it for offline use) whose script and page chunks no longer
 * exist on the server. The first time that happens we drop the old caches and
 * reload once, which fetches the current build; if it happens again we stop
 * and let the error page say so, rather than reloading forever.
 */
const FLAG = "webapp.stale-reload";

/** Vite's and the browser's messages for a script chunk that won't load. */
const CHUNK_ERROR =
  /dynamically imported module|importing a module script failed|failed to load module script|unable to preload/i;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return CHUNK_ERROR.test(message);
}

export interface RecoverDeps {
  storage?: Pick<Storage, "getItem" | "setItem">;
  reload?: () => void;
  /** Forget the old shell: service workers and their caches. */
  forget?: () => Promise<void>;
}

async function forgetOldShell(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await globalThis.caches?.keys?.()) ?? [];
    // Keep the data caches (offline reads, tiles); drop the app shell.
    await Promise.all(keys.filter((k) => /precache/i.test(k)).map((k) => caches.delete(k)));
  } catch {
    // Best effort: the reload below is what matters.
  }
}

/** Reload once to pick up the current build. Returns whether it did. */
export async function recoverFromStaleBuild({
  storage = sessionStorage,
  reload = () => window.location.reload(),
  forget = forgetOldShell,
}: RecoverDeps = {}): Promise<boolean> {
  try {
    if (storage.getItem(FLAG)) return false;
    storage.setItem(FLAG, "1");
  } catch {
    // No storage: we can't tell if we already tried, so don't risk a loop.
    return false;
  }
  await forget();
  reload();
  return true;
}

/** A page that loaded cleanly is on the current build: allow another reload
 *  next time. */
export function markBuildFresh(storage: Pick<Storage, "removeItem"> = sessionStorage) {
  try {
    storage.removeItem(FLAG);
  } catch {
    // ignore
  }
}

/** Wire it up: Vite fires `vite:preloadError` when a chunk can't load.
 *  (No preventDefault: that would make Vite swallow the error and hand the
 *  page `undefined`, hiding what went wrong; the error page explains it.) */
export function startStaleBuildRecovery() {
  window.addEventListener("vite:preloadError", () => {
    void recoverFromStaleBuild();
  });
  // Clear the flag once the app has been up for a while without trouble.
  window.setTimeout(() => markBuildFresh(), 10_000);
}
