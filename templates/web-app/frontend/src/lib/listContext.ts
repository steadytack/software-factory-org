/** Remembers where a list view was (URL incl. filters/sort/page, and scroll
 *  offset) so returning from a record restores the user's exact place. */

const LAST_URL_KEY = "list-context:sites:url";

export interface ListOrigin {
  from?: string;
}

/** Call whenever the Sites list URL changes. */
export function rememberSitesUrl(url: string): void {
  try {
    sessionStorage.setItem(LAST_URL_KEY, url);
  } catch {
    /* storage unavailable — fall back to the bare list */
  }
}

/** Where "Sites" should link back to from a record page. Prefers the origin
 *  passed in navigation state, then the last-seen list URL. Only same-app
 *  `/sites` paths are accepted, so state can't redirect elsewhere. */
export function sitesListHref(state: unknown): string {
  const from = (state as ListOrigin | null)?.from;
  if (typeof from === "string" && /^\/sites(?:[?#]|$)/.test(from)) return from;
  try {
    const last = sessionStorage.getItem(LAST_URL_KEY);
    if (last && /^\/sites(?:[?#]|$)/.test(last)) return last;
  } catch {
    /* ignore */
  }
  return "/sites";
}

export function readScroll(key: string): number {
  try {
    return Number(sessionStorage.getItem(`scroll:${key}`)) || 0;
  } catch {
    return 0;
  }
}

export function writeScroll(key: string, top: number): void {
  try {
    sessionStorage.setItem(`scroll:${key}`, String(Math.round(top)));
  } catch {
    /* ignore */
  }
}
