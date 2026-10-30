import { dehydrate, type Query, type QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import { createStore, del, get, set } from "idb-keyval";

/** The app's data kept on the device (IndexedDB), so it opens with no
 *  signal showing what was last loaded or synced (lib/backgroundSync.ts).
 *  Cleared on logout and when the session ends; kept at most a week. */

export const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const KEY = "query-cache";

const store = typeof indexedDB !== "undefined" ? createStore("webapp-cache", "queries") : null;

export const persister = createAsyncStoragePersister({
  storage: store
    ? {
        getItem: async (key: string) => (await get<string>(key, store)) ?? null,
        setItem: (key: string, value: string) => set(key, value, store),
        removeItem: (key: string) => del(key, store),
      }
    : undefined,
  key: KEY,
  throttleTime: 2000,
});

// Session state lives in lib/session.ts; searches and admin screens aren't
// worth keeping.
const SKIP = new Set(["me", "record-search", "users", "recycle-bin", "admin-stats", "admin-health"]);

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister,
  maxAge: CACHE_MAX_AGE,
  // Bump when cached shapes change so an old cache isn't restored.
  buster: "1",
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Query) =>
      query.state.status === "success" && !SKIP.has(String(query.queryKey[0])),
  },
};

/** Writes the cache to the device now. The persister's own saves are
 *  throttled, and a call made while one is pending returns at once without
 *  writing, so a signal lost straight after would lose the data. Same
 *  format as the persister's. */
export async function saveCacheNow(queryClient: QueryClient): Promise<void> {
  if (!store) return;
  const persisted = {
    buster: persistOptions.buster ?? "",
    timestamp: Date.now(),
    clientState: dehydrate(queryClient, persistOptions.dehydrateOptions),
  };
  await set(KEY, JSON.stringify(persisted), store);
}

export function clearPersistedCache(): void {
  if (!store) return;
  // Not silent: if this fails, the last user's records stay on the device.
  void del(KEY, store).catch((error) =>
    console.error("Clearing the offline copy failed — it may still be on this device:", error),
  );
}
