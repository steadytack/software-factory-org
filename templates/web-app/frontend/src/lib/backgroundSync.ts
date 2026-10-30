import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { allSitesQuery, siteLocationsQuery } from "../hooks/useSites";
import { allSurveysQuery } from "../hooks/useSurveys";
import { saveCacheNow } from "./persistence";

/** Keeps every site and survey on the device while
 *  there's a signal: at sign-in, every ~10 minutes, and when the
 *  connection comes back. Offline, any record page then opens from these
 *  lists (lib/offlineData.ts), not only the ones visited. Comments, files
 *  and history are fetched per record, so only those opened are kept. */

const EVERY = 10 * 60 * 1000;
const LAST_SYNC = "webapp-last-sync";

export function lastSynced(): string | null {
  try {
    return localStorage.getItem(LAST_SYNC);
  } catch {
    return null;
  }
}

export function useBackgroundSync(enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let running = false;
    async function sync() {
      if (running || !navigator.onLine) return;
      running = true;
      // Fresh-enough lists (a page just loaded them) aren't fetched twice.
      const fresh = { staleTime: EVERY / 2 };
      const results = await Promise.allSettled([
        queryClient.fetchQuery({ ...allSitesQuery(), ...fresh }),
        queryClient.fetchQuery({ ...siteLocationsQuery(), ...fresh }),
        queryClient.fetchQuery({ ...allSurveysQuery(), ...fresh }),
      ]);
      running = false;
      if (results.every((r) => r.status === "fulfilled")) {
        // Written now rather than on the persister's next throttled save,
        // so the lists survive losing the signal straight after.
        await saveCacheNow(queryClient).catch((error) =>
          console.error("Saving the offline copy failed:", error),
        );
        try {
          localStorage.setItem(LAST_SYNC, new Date().toISOString());
        } catch {
          // not recorded; the sync itself still happened
        }
      }
    }
    // Let the page's own requests go first.
    const first = window.setTimeout(sync, 2000);
    const timer = window.setInterval(sync, EVERY);
    window.addEventListener("online", sync);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("online", sync);
    };
  }, [enabled, queryClient]);
}
