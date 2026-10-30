/** The last signed-in session (/api/auth/me), so the app still opens with
 *  no signal. Only used when the server can't be reached: a real "signed
 *  out" answer (401) always wins, and logging out or an expired session
 *  clears it. Holds no token — the session cookies stay HTTP-only. */

const KEY = "webapp-session";

export interface SavedSession<Me> {
  me: Me;
  savedAt: string;
}

export function saveSession<Me>(me: Me): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ me, savedAt: new Date().toISOString() }));
  } catch {
    // Storage unavailable: the app just won't open offline.
  }
}

export function loadSession<Me>(): SavedSession<Me> | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedSession<Me>) : null;
  } catch {
    return null;
  }
}

export function clearSavedSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
