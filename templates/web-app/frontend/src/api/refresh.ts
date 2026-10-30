import { queryClient } from "./client";
import { clearSavedSession } from "../lib/session";
import { clearPersistedCache } from "../lib/persistence";

let refreshing: Promise<boolean> | null = null;

/** Renew the session via the refresh-token cookie. Returns true when new
 *  access/refresh cookies were set, false when the session is over.
 *  Deduplicates concurrent refresh attempts (many queries can 401 at once). */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        // Expected on genuine expiry (401); anything else is worth seeing.
        if (response.status !== 401 && response.status !== 403) {
          console.error(`Session refresh failed: HTTP ${response.status}`);
        }
        return false;
      }
      return true;
    } catch (error) {
      console.error("Session refresh request failed:", error);
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Drop local session state after a definitive logout/expiry. */
export function clearSessionState(): void {
  // This user's data doesn't stay on the device past their session.
  clearSavedSession();
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
  clearPersistedCache();
  queryClient.removeQueries({ queryKey: ["me"] });
}
