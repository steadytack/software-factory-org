import { useCallback, useEffect, useState } from "react";

import { loadPrefs, savePrefs } from "../lib/prefs";
import type { TableDisplayPrefs } from "../lib/tableViewPrefs";

/** The signed-in person's table display settings (row density, wrap,
 *  freeze), shared by every table, the toolbar gear and Profile → Display.
 *  A change from any of them updates every table on screen, and in other
 *  tabs. */
export function useTableDisplayPrefs(): [TableDisplayPrefs, (next: TableDisplayPrefs) => void] {
  const [prefs, setPrefs] = useState(() => loadPrefs().table);
  useEffect(() => {
    const update = () => setPrefs(loadPrefs().table);
    window.addEventListener("profile-prefs-changed", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("profile-prefs-changed", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  const update = useCallback((next: TableDisplayPrefs) => {
    setPrefs(next);
    savePrefs({ ...loadPrefs(), table: next });
  }, []);
  return [prefs, update];
}
