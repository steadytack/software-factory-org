import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { isNetworkError } from "./outbox";

/** Offline answers from what's already on the device. The background sync
 *  (lib/backgroundSync.ts) keeps the complete site and
 *  action lists cached; when a request can't reach the server (and the
 *  service worker has no copy of that exact URL), a record or a scoped list
 *  is answered from those lists instead of failing. */

type Row = { id: string };
type List<T> = { total: number; items: T[] };

/** Runs `request`; on a network error, answers with `fallback()` if that
 *  finds something. Server errors (404, 403…) are never masked. */
export async function withOfflineFallback<T>(
  request: () => Promise<T>,
  fallback: () => T | undefined,
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (isNetworkError(error)) {
      const cached = fallback();
      if (cached !== undefined) return cached;
    }
    throw error;
  }
}

/** A record found in any cached list (or page) of `root`. */
export function findCachedRecord<T extends Row>(
  client: QueryClient,
  root: string,
  id: string,
): T | undefined {
  for (const [, data] of client.getQueriesData<List<T>>({ queryKey: [root] })) {
    const hit = Array.isArray(data?.items)
      ? data.items.find((row) => row?.id === id)
      : undefined;
    if (hit) return hit;
  }
  return undefined;
}

/** Rows of the cached complete list `fullKey` that match `keep`. */
export function filterCachedList<T>(
  client: QueryClient,
  fullKey: QueryKey,
  keep: (row: T) => boolean,
): List<T> | undefined {
  const full = client.getQueryData<List<T>>(fullKey);
  if (!full) return undefined;
  const items = full.items.filter(keep);
  return { total: items.length, items };
}
