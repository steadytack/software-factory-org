import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";

/** Route guard: renders children only when /auth/me reports authenticated.
 *  While the check is pending a full-screen spinner is shown; on a definitive
 *  401 the user is redirected to /login with the original location preserved
 *  so LoginPage can return them after signing in.
 *  Client-side convenience only — real authorisation is server-side per request. */
export function RequireAuth() {
  const { isAuthed, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground/60" />
          <p className="text-sm">Checking session…</p>
        </div>
      </div>
    );
  }

  if (!isAuthed) {
    // The whole location — a shared link's filters (?…) and anchor (#…)
    // must survive signing in, not just the page.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
  }

  return <Outlet />;
}
