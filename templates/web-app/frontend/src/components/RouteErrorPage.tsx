import { useEffect } from "react";
import { useRouteError, isRouteErrorResponse, useNavigate } from "react-router-dom";

import { isChunkLoadError, recoverFromStaleBuild } from "../lib/staleBuild";

import { Button } from "./ui/button";

/** Used as the `errorElement` on individual routes. Catches unhandled throws
 *  from loaders, actions, or the page component itself without taking down
 *  the whole app. Ported from the reference template's RouteErrorPage. */
export function RouteErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();

  const is404 = isRouteErrorResponse(error) && error.status === 404;
  // A page file the server no longer has: this tab is on an old version.
  const stale = isChunkLoadError(error);
  useEffect(() => {
    if (stale) void recoverFromStaleBuild();
  }, [stale]);

  const heading = stale ? "The app has been updated" : is404 ? "Page not found" : "Something went wrong";
  const message = stale
    ? "This tab is on an older version. Reload to get the latest."
    : is404
      ? "The page you're looking for doesn't exist or has been moved."
    : isRouteErrorResponse(error)
      ? `${error.status} – ${error.statusText}`
      : error instanceof Error
        ? error.message
        : "An unexpected error occurred on this page.";

  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 p-8">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">{heading}</h2>
      <p className="max-w-[480px] text-center text-sm text-muted-foreground">
        {message}
      </p>
      <div className="flex gap-2">
        {stale ? (
          <Button onClick={() => window.location.reload()}>
            Reload
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => navigate(-1)}>
              Go back
            </Button>
            <Button onClick={() => navigate("/")}>
              Go home
            </Button>
          </>
        )}
      </div>
    </div>
  );
}