import { useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import type { FilterCondition, FilterOperator } from "../lib/tableFilters";

/** Table search/sort state reflected in the URL query string.
 *
 *  filter, sort and search state was never in the URL, so it was
 *  lost on navigation, refresh and back, and a filtered view could not be
 *  linked or bookmarked. Saved views (localStorage) were the only persistence,
 *  and applying one restored search/sort/visibility/order but **not**
 *  pagination.
 *
 *  Scope, deliberately: the **search term and the sort** go in the URL.
 *  Column visibility and order are a per-person preference, not a description
 *  of *what data is being shown* — putting them in a shareable link would
 *  mean sending someone else your layout. They stay in saved views, where
 *  they already worked.
 *
 *  `replace: true` on every update: typing in the search box must not push a
 *  history entry per keystroke, or Back becomes unusable.
 *
 *  Filter conditions joined the URL alongside search/sort for the same
 *  reason: they describe *what data is being shown*, so a filtered view
 *  should be linkable/bookmarkable too.
 */
export interface TableUrlState {
  search: string;
  sorting: { id: string; desc: boolean }[];
  conditions: FilterCondition[];
}

const SEARCH_PARAM = "q";
const SORT_PARAM = "sort";
const FILTERS_PARAM = "filters";

/** Between-item delimiter for both `sort` and `filters`. Not `,` — `,` gets
 *  percent-encoded to `%2C` by `URLSearchParams` (it isn't in its unescaped
 *  set: letters, digits, `- _ . *`), which is the same unreadable-address-bar
 *  problem the field.operator.value delimiter had with `:`. `*` is in that
 *  safe set, so it survives untouched. */
const LIST_DELIM = "*";

/** `encodeURIComponent` leaves a handful of characters — including `*` —
 *  unescaped, since they're already URL-safe on their own (that's exactly
 *  what makes `*` usable as `LIST_DELIM` without becoming `%2A` itself). But
 *  it also means `encodeURIComponent` is a no-op on a literal `*` inside a
 *  *value*, which would then be indistinguishable from the delimiter once
 *  joined. So this replaces it by hand with its percent-encoded form —
 *  `decodeURIComponent` on the other end reverses that along with
 *  everything else, so callers never see the difference. */
function escapeDelim(s: string): string {
  return s.split(LIST_DELIM).join("%2A");
}

/** `sort=name` (ascending) or `sort=-name` (descending) — the convention most
 *  HTTP APIs use, so it stays readable and hand-editable in the address bar.
 *  Column ids are a fixed, app-defined vocabulary that never contains
 *  `LIST_DELIM`, so multiple sorts can join on it directly. */
function parseSort(value: string | null): { id: string; desc: boolean }[] {
  if (!value) return [];
  return value
    .split(LIST_DELIM)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part.startsWith("-") ? { id: part.slice(1), desc: true } : { id: part, desc: false },
    );
}

function formatSort(sorting: { id: string; desc: boolean }[]): string {
  return sorting.map((s) => (s.desc ? `-${s.id}` : s.id)).join(LIST_DELIM);
}

let nextConditionId = 0;

/** `filters=site_type.is.bridge*status.is.active` — dot-separated
 *  field.operator.value triples, `LIST_DELIM`-separated between conditions.
 *  `.` is used for the triple (not `:`) for the same reason as `LIST_DELIM`
 *  above — a colon there gets percent-encoded to `%3A` even though
 *  `encodeURIComponent` itself never put it there. `field`/`operator` are a
 *  fixed, app-defined vocabulary that never contains a literal `.`, so it's
 *  safe as their delimiter; each part is still percent-encoded (and, for
 *  `LIST_DELIM` itself, escaped — see `escapeDelim`) so a *value* containing
 *  `.` or `LIST_DELIM` round-trips correctly. */
function parseFilters(value: string | null): FilterCondition[] {
  if (!value) return [];
  return value
    .split(LIST_DELIM)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [field, operator, ...rest] = part.split(".");
      nextConditionId += 1;
      return {
        id: `url-cond-${nextConditionId}`,
        field: decodeURIComponent(field ?? ""),
        operator: decodeURIComponent(operator ?? "") as FilterOperator,
        value: decodeURIComponent(rest.join(".") ?? ""),
      };
    })
    .filter((c) => c.field && c.operator);
}

function formatFilters(conditions: FilterCondition[]): string {
  return conditions
    .filter((c) => c.value)
    .map((c) =>
      escapeDelim(
        `${encodeURIComponent(c.field)}.${encodeURIComponent(c.operator)}.${encodeURIComponent(c.value)}`,
      ),
    )
    .join(LIST_DELIM);
}

export function useTableUrlState(): {
  initial: TableUrlState;
  publish: (state: TableUrlState) => void;
} {
  const [params, setParams] = useSearchParams();

  // Read once, on mount: after that the table owns the state and pushes it
  // out. Re-reading on every change would fight the table for control.
  const initialRef = useRef<TableUrlState | null>(null);
  if (!initialRef.current) {
    initialRef.current = {
      search: params.get(SEARCH_PARAM) ?? "",
      sorting: parseSort(params.get(SORT_PARAM)),
      conditions: parseFilters(params.get(FILTERS_PARAM)),
    };
  }

  const publish = useCallback(
    (state: TableUrlState) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          // Absent, not empty: `?q=` is noise, and FLT-2 is a reminder that
          // an empty-string parameter is its own kind of ambiguity.
          if (state.search) next.set(SEARCH_PARAM, state.search);
          else next.delete(SEARCH_PARAM);
          const sort = formatSort(state.sorting);
          if (sort) next.set(SORT_PARAM, sort);
          else next.delete(SORT_PARAM);
          const filters = formatFilters(state.conditions);
          if (filters) next.set(FILTERS_PARAM, filters);
          else next.delete(FILTERS_PARAM);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return { initial: initialRef.current, publish };
}
