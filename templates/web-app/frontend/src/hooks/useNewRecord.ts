import { useCallback, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

/** `?new=1` on a list page asks it to open its "Add …" dialog. It's how the
 *  command palette, the `n` shortcut and the phone "+" button start a new
 *  record without each knowing how every page's dialog is wired. */
const NEW_PARAM = "new";
/** Optional: the site the new record belongs to (e.g. a survey started
 *  from a site's page). */
const SITE_PARAM = "site";

export interface NewRecordRequest {
  siteId?: string;
}

/** Opens the page's create dialog once when `?new=1` is present, then drops
 *  the parameter so a refresh or Back doesn't reopen it. Waits for the role
 *  to load; a user who may not create (a viewer) just has it dropped. */
export function useNewRecordIntent(
  open: (request: NewRecordRequest) => void,
  can: { edit: boolean; ready: boolean },
) {
  const [params, setParams] = useSearchParams();
  const requested = params.has(NEW_PARAM);
  const siteId = params.get(SITE_PARAM) ?? undefined;
  const allowed = can.edit;
  useEffect(() => {
    if (!requested || !can.ready) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(NEW_PARAM);
        next.delete(SITE_PARAM);
        return next;
      },
      { replace: true },
    );
    if (allowed) open({ siteId });
    // `open` is a fresh closure each render; only the request matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested, allowed, can.ready]);
}

/** Starts a new record on the list page at `path`. Already there, the
 *  table's search/sort/filters in the URL are kept. */
export function useStartNewRecord(): (path: string, request?: NewRecordRequest) => void {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(
    (path: string, request?: NewRecordRequest) => {
      const here = location.pathname === path;
      const params = new URLSearchParams(here ? location.search : "");
      params.set(NEW_PARAM, "1");
      if (request?.siteId) params.set(SITE_PARAM, request.siteId);
      navigate({ pathname: path, search: `?${params}` }, { replace: here });
    },
    [navigate, location.pathname, location.search],
  );
}
