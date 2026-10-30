import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api, expectData } from "../api/client";
import { isNetworkError } from "../lib/outbox";
import { clearSavedSession, loadSession, saveSession } from "../lib/session";
import { clearPersistedCache } from "../lib/persistence";
import type { UserRole } from "../lib/vocabularies";

type Me = Awaited<ReturnType<typeof fetchMe>>;

function fetchMe() {
  return expectData(() => api.GET("/api/auth/me"));
}

/** /auth/me, falling back to the last session when the server can't be
 *  reached, so the app opens on site with no signal. A 401 isn't a
 *  network error, so being signed out still signs you out. */
async function meOrSavedSession(): Promise<Me & { offline?: boolean }> {
  try {
    const me = await fetchMe();
    saveSession(me);
    return me;
  } catch (error) {
    const saved = loadSession<Me>();
    if (saved && isNetworkError(error)) return { ...saved.me, offline: true };
    throw error;
  }
}

/** Auth state derives from /auth/me; the JWT lives in HTTP-only cookies,
 *  so the client never touches the token itself. */
export function useAuth() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["me"],
    queryFn: meOrSavedSession,
    retry: false,
  });

  const role: UserRole =
    query.data && "role" in query.data ? (query.data.role as UserRole) : "viewer";
  return {
    isAuthed: query.isSuccess,
    role,
    isLoading: query.isPending,
    email: query.data && "email" in query.data ? String(query.data.email) : undefined,
    isAdmin:
      query.data && "is_admin" in query.data ? Boolean(query.data.is_admin) : false,
    multiUser:
      query.data && "multi_user" in query.data ? Boolean(query.data.multi_user) : true,
    /** Signed in from the saved session because the server is out of reach. */
    offline: Boolean(query.data && "offline" in query.data && query.data.offline),
    async logout() {
      await api.POST("/api/auth/logout", {});
      clearSavedSession();
      // Offline copies of API reads belong to this user; don't leave them
      // on a shared device. (Queued writes stay, and only send for them.)
      if (typeof caches !== "undefined") await caches.delete("api-reads").catch(() => false);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      clearPersistedCache();
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  };
}

