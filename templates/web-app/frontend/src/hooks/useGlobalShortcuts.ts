import { createElement, useEffect } from "react";
import { Keyboard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { create } from "zustand";

import { registerSearchItem, unregisterSearchItem } from "../search/registry";

interface ShortcutsState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** Open state for the keyboard-shortcuts sheet, so the command palette,
 *  help and account menu can all open it. */
export const useShortcutsStore = create<ShortcutsState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** `g` then a letter: jump to a page (Jira/Atlassian convention). */
export const GO_TO: { key: string; label: string; to: string }[] = [
  { key: "d", label: "Dashboard", to: "/" },
  { key: "s", label: "Sites", to: "/sites" },
  { key: "v", label: "Surveys", to: "/surveys" },
  { key: "m", label: "Map", to: "/map" },
  { key: "p", label: "Profile", to: "/profile" },
];

const SEQUENCE_TIMEOUT_MS = 1000;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

/** Single-key app shortcuts: `?` opens the shortcuts sheet, `/` focuses the
 *  table search, `n` adds a record on a list page, `g`+letter navigates. Ignored while typing in a field or
 *  with a modifier held, so they never hijack text entry or browser keys.
 *  Mount once inside the app shell. */
export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const setOpen = useShortcutsStore((s) => s.setOpen);

  useEffect(() => {
    registerSearchItem({
      id: "action-shortcuts",
      label: "Keyboard shortcuts",
      icon: createElement(Keyboard, { className: "size-4" }),
      group: "Commands",
      keywords: ["keyboard", "shortcuts", "hotkeys", "keys", "?"],
      action: () => setOpen(true),
    });
    return () => unregisterSearchItem("action-shortcuts");
  }, [setOpen]);

  useEffect(() => {
    let pendingG: ReturnType<typeof setTimeout> | null = null;
    const clearG = () => {
      if (pendingG) clearTimeout(pendingG);
      pendingG = null;
    };

    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      // Leave keys alone while a dialog/sheet/menu owns focus.
      if (document.querySelector("[role=dialog], [role=menu]")) return;

      if (pendingG) {
        const dest = GO_TO.find((g) => g.key === e.key.toLowerCase());
        clearG();
        if (dest) {
          e.preventDefault();
          navigate(dest.to);
        }
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "/") {
        const search = document.querySelector<HTMLInputElement>("[data-table-search]");
        if (search) {
          e.preventDefault();
          search.focus();
        }
      } else if (e.key === "n") {
        // The list page's "Add …" button (ManagedDataTable's primary action).
        const add = document.querySelector<HTMLButtonElement>("[data-primary-action]");
        if (add) {
          e.preventDefault();
          add.click();
        }
      } else if (e.key.toLowerCase() === "g" && !e.shiftKey) {
        pendingG = setTimeout(clearG, SEQUENCE_TIMEOUT_MS);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearG();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [navigate, setOpen]);
}
