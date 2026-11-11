import { createElement, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
// feature:theme:start
import { Monitor, Moon, Sun } from "lucide-react";
// feature:theme:end
import { registerSearchItem, unregisterSearchItem, type SearchItem } from "./registry";
import { useSearchStore } from "./searchStore";
import { useCan } from "../hooks/useCan";
import { useStartNewRecord } from "../hooks/useNewRecord";
// feature:theme:start
import { useTheme } from "../components/theme-provider";
// feature:theme:end

const PAGE_ITEMS = [
  { id: "page-dashboard", label: "Dashboard", to: "/" },
  { id: "page-sites", label: "Sites", to: "/sites" },
  { id: "page-surveys", label: "Surveys", to: "/surveys" },
  { id: "page-map", label: "Map", to: "/map" },
  { id: "page-admin", label: "Admin", to: "/admin" },
];

const NEW_RECORDS = [
  { id: "cmd-new-site", label: "New site", to: "/sites" },
  { id: "cmd-new-survey", label: "New survey", to: "/surveys" },
];

const icon = (Icon: typeof Plus) => createElement(Icon, { className: "size-4" });

/** Registers static page destinations and commands (new record, theme) in
 *  the search registry, and binds the global Cmd/Ctrl+K
 *  shortcut. Mount once inside the app shell. Pages add their own commands,
 *  e.g. a table's "Export as CSV". */
export function useSearch() {
  const navigate = useNavigate();
  const can = useCan();
  // Changes on every navigation; read through a ref so the commands aren't
  // re-registered each time.
  const start = useStartNewRecord();
  const startNewRecord = useRef(start);
  startNewRecord.current = start;
  // feature:theme:start
  const { setTheme } = useTheme();
  // feature:theme:end

  useEffect(() => {
    const commands: SearchItem[] = [
      ...(can.edit
        ? NEW_RECORDS.map((c) => ({
            id: c.id,
            label: c.label,
            group: "Commands",
            keywords: ["add", "create", "new"],
            icon: icon(Plus),
            action: () => startNewRecord.current(c.to),
          }))
        : []),
      // feature:theme:start
      ...(
        [
          ["light", "Light theme", Sun],
          ["dark", "Dark theme", Moon],
          ["system", "System theme", Monitor],
        ] as const
      ).map(([theme, label, Icon]) => ({
        id: `cmd-theme-${theme}`,
        label: `Switch to ${label.toLowerCase()}`,
        group: "Commands",
        keywords: ["theme", "appearance", "mode", "colour", "color"],
        icon: icon(Icon),
        action: () => setTheme(theme),
      })),
      // feature:theme:end
    ];
    commands.forEach(registerSearchItem);
    return () => commands.forEach((c) => unregisterSearchItem(c.id));
  // feature:theme:start
  }, [can.edit, setTheme]);
  // feature:theme:else
  // }, [can.edit]);
  // feature:theme:end

  useEffect(() => {
    for (const item of PAGE_ITEMS) {
      registerSearchItem({
        id: item.id,
        label: item.label,
        group: "Pages",
        keywords: [item.to, "go to", "navigate"],
        action: () => navigate(item.to),
      });
    }
    return () => {
      for (const item of PAGE_ITEMS) unregisterSearchItem(item.id);
    };
  }, [navigate]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useSearchStore.setState({ modalOpen: true });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
