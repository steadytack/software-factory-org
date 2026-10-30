import type { ReactNode } from "react";

/** A single searchable item. `keywords` are extra lowercase strings matched
 *  in addition to the label (e.g. a route path or synonyms). */
export interface SearchItem {
  id: string;
  label: string;
  /** Lowercase group heading shown in the modal, e.g. "Pages". */
  group: string;
  keywords?: string[];
  /** Optional trailing hint (e.g. coordinates). */
  hint?: string;
  icon?: ReactNode;
  action: () => void;
}

type Listener = () => void;

const items = new Map<string, SearchItem>();
const listeners = new Set<Listener>();

/** Register (or replace) a search item. Safe to call during render/effects. */
export function registerSearchItem(item: SearchItem): void {
  items.set(item.id, item);
  emit();
}

export function unregisterSearchItem(id: string): void {
  items.delete(id);
  emit();
}

let cachedItems: SearchItem[] = [];

export function getSearchItems(): SearchItem[] {
  return cachedItems;
}

function emit() {
  cachedItems = [...items.values()];
  listeners.forEach((l) => l());
}

export function subscribeSearchItems(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Case-insensitive substring match across label + keywords. */
export function matchesQuery(item: SearchItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [item.label, ...(item.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((term) => haystack.includes(term));
}
