import { useCallback, useRef, useState } from "react";
import type { FilterCondition } from "../lib/tableFilters";

/** The table view state a saved view captures. */
export interface TableViewState {
  search: string;
  sorting: { id: string; desc: boolean }[];
  visibility: Record<string, boolean>;
  order: string[];
  /** Optional so views saved before this field existed still parse. */
  conditions?: FilterCondition[];
}

export interface SavedView {
  id: string;
  name: string;
  createdAt: string;
  state: TableViewState;
}

export interface SavedViewsApi {
  views: SavedView[];
  hasViews: boolean;
  saveView: (name: string, state: TableViewState) => void;
  deleteView: (id: string) => void;
  /** Set by the table when it wants to expose its current state. */
  captureState: () => TableViewState | null;
  registerCapture: (fn: () => TableViewState | null) => void;
}

const storageKey = (page: string) => `saved-views-${page}`;

function load(page: string): SavedView[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey(page)) ?? "[]");
  } catch {
    return [];
  }
}

/** Saved table views, persisted to localStorage per page. The table
 *  registers a `capture` function so "Save current view" can snapshot
 *  whatever the table's state is right now. */
export function useSavedViews(page: string): SavedViewsApi {
  const [views, setViews] = useState<SavedView[]>(() => load(page));
  // Ref (not state): the table re-registers its capture on every render, so
  // storing it in state would cause an infinite re-render loop.
  const captureRef = useRef<(() => TableViewState | null) | null>(null);

  const persist = useCallback(
    (next: SavedView[]) => {
      setViews(next);
      try {
        localStorage.setItem(storageKey(page), JSON.stringify(next));
      } catch {
        // localStorage unavailable (private mode) — views stay in memory
      }
    },
    [page],
  );

  const saveView = useCallback(
    (name: string, state: TableViewState) => {
      persist([
        { id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), state },
        ...views.filter((v) => v.name !== name),
      ]);
    },
    [persist, views],
  );

  const deleteView = useCallback(
    (id: string) => persist(views.filter((v) => v.id !== id)),
    [persist, views],
  );

  return {
    views,
    hasViews: views.length > 0,
    saveView,
    deleteView,
    captureState: () => captureRef.current?.() ?? null,
    registerCapture: (fn) => {
      captureRef.current = fn;
    },
  };
}
