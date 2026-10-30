/** Profile preferences: localStorage-backed display name, landing page,
 *  interface density, phone tabs and table display. Shared by ProfilePage (writer) and Header/AppLayout
 *  (consumers). */

import { DEFAULT_TABLE_DISPLAY, parseTableDisplay, type TableDisplayPrefs } from "./tableViewPrefs";

export type Density = "comfortable" | "compact";

export interface ProfilePrefs {
  displayName: string;
  defaultPage: string;
  density: Density;
  /** Row density, wrap and freeze for every table (lib/tableViewPrefs.ts). */
  table: TableDisplayPrefs;
}

const KEY = "profile-prefs";

/** Compact suits a mouse and a big screen (work); comfortable suits touch
 *  (phone/tablet), so that's the default on coarse pointers. */
function defaultDensity(): Density {
  try {
    return window.matchMedia("(pointer: coarse)").matches ? "comfortable" : "compact";
  } catch {
    return "compact";
  }
}

export function loadPrefs(): ProfilePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      displayName: typeof raw.displayName === "string" ? raw.displayName : "",
      defaultPage: typeof raw.defaultPage === "string" ? raw.defaultPage : "/",
      density:
        raw.density === "compact" || raw.density === "comfortable"
          ? raw.density
          : defaultDensity(),
      table: parseTableDisplay(raw.table),
    };
  } catch {
    return {
      displayName: "",
      defaultPage: "/",
      density: defaultDensity(),
      table: DEFAULT_TABLE_DISPLAY,
    };
  }
}

export function savePrefs(prefs: ProfilePrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable (private mode): the change still applies this session.
  }
  applyDensity(prefs.density);
  // Same-tab consumers (Header) listen to this custom event; other tabs get
  // the native storage event automatically.
  window.dispatchEvent(new CustomEvent("profile-prefs-changed"));
}

/** Reflect the density on <html>; CSS variables in styles.css key off it. */
export function applyDensity(density: Density): void {
  document.documentElement.dataset.density = density;
}
