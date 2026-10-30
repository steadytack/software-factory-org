import { useMemo, useState } from "react";
import { ArrowUpDown, History, ListFilter } from "lucide-react";

import { api } from "../api/client";
import { RelativeTime } from "./RelativeTime";
import { chipClass } from "../lib/chips";
import { EmptyState } from "./ui/empty-state";
import { IconSelect } from "./ui/icon-select";
import { SearchToggle } from "./ui/search-toggle";

// Radix Select values can't be empty, so "no filter" needs a sentinel.
const ALL_ACTIONS = "__all";
import { formatDate } from "../lib/format";
import { vocabularyLabel, type EntityName } from "../lib/vocabularies";
import { isPendingCreate } from "../lib/pendingRecords";

export interface ChangelogEntry {
  id: string;
  entity: string;
  entity_id: string;
  action: string;
  actor: string;
  summary: string;
  /** {field: [old, new]} on updates (recorded since migration 0022). */
  changes?: Record<string, unknown[]> | null;
  created_at: string;
}

const FIELD_LABELS: Record<string, string> = {
  site_type: "Type",
  survey_date: "Survey date",
  due_date: "Due",
  resolved: "Status",
  is_active: "Active",
  display_name: "Name",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? vocabularyLabel(field);
}

/** A stored value as a person would say it: vocabulary labels, dates,
 *  and "empty" for null. */
function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "empty";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  const text = String(value);
  if (ISO_DATE.test(text)) return formatDate(text);
  if (/^[a-z_]+$/.test(text)) return vocabularyLabel(text);
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

type SortKey = "date_desc" | "date_asc" | "actor" | "action";

const SORT_LABELS: Record<SortKey, string> = {
  date_desc: "Newest first",
  date_asc: "Oldest first",
  actor: "Actor A–Z",
  action: "Action A–Z",
};

/** Audit-trail tab: search, filter by action, sort; rows show actor, action
 *  chip, summary and relative time. Ported from the MUI template's
 *  ChangelogTab to Tailwind. */
export function ChangelogTab({ entries }: { entries: ChangelogEntry[] }) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("date_desc");

  const uniqueActions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.action))).sort(),
    [entries],
  );

  const processed = useMemo(() => {
    let result = [...entries];
    if (actionFilter) result = result.filter((e) => e.action === actionFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.actor.toLowerCase().includes(q) ||
          e.action.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q),
      );
    }
    result.sort((a, b) => {
      if (sortKey === "date_desc")
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortKey === "date_asc")
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortKey === "actor") return a.actor.localeCompare(b.actor);
      return a.action.localeCompare(b.action);
    });
    return result;
  }, [entries, actionFilter, search]);

  const hasFilter = !!actionFilter || !!search;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      {/* Toolbar */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <SearchToggle value={search} onChange={setSearch} label="Search history" placeholder="Search history…" />
        <IconSelect
          icon={<ListFilter />}
          label="Filter by action"
          highlighted={actionFilter !== null}
          value={actionFilter ?? ALL_ACTIONS}
          onChange={(v) => setActionFilter(v === ALL_ACTIONS ? null : v)}
          options={[
            { value: ALL_ACTIONS, label: "All actions" },
            ...uniqueActions.map((a) => ({ value: a, label: vocabularyLabel(a) })),
          ]}
        />
        <IconSelect
          icon={<ArrowUpDown />}
          label="Sort history"
          value={sortKey}
          onChange={(v) => setSortKey(v as SortKey)}
          options={(Object.keys(SORT_LABELS) as SortKey[]).map((k) => ({
            value: k,
            label: SORT_LABELS[k],
          }))}
        />
        {hasFilter && (
          <button
            onClick={() => {
              setSearch("");
              setActionFilter(null);
            }}
            className="text-xs text-primary hover:underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-muted-foreground tnum">
          {processed.length} / {entries.length}
        </span>
      </div>

      {/* Rows */}
      {processed.length === 0 ? (
        <EmptyState
          icon={<History className="size-8" />}
          title={hasFilter ? "No matches" : "No changelog entries"}
          description={
            hasFilter
              ? "No entries match your filters."
              : "Changes to this record will show up here."
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {processed.map((e) => (
            <li key={e.id} className="flex items-start gap-3 py-2">
              <span
                className={`${chipClass(
                  e.action === "created" ? "success" : e.action === "deleted" ? "destructive" : "info",
                )} mt-0.5 shrink-0 capitalize`}
              >
                {e.action}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-dense text-foreground">{e.summary}</p>
                {e.changes && Object.keys(e.changes).length > 0 && (
                  <dl className="mt-1 space-y-0.5 text-xs">
                    {Object.entries(e.changes).map(([field, [before, after]]) => (
                      <div key={field} className="flex flex-wrap gap-x-2">
                        <dt className="font-medium text-foreground">{fieldLabel(field)}:</dt>
                        <dd className="text-muted-foreground">
                          <span className="line-through decoration-muted-foreground/50">
                            {displayValue(before)}
                          </span>
                          {" → "}
                          <span className="text-foreground">{displayValue(after)}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="text-xs text-muted-foreground">
                  {e.actor} · <RelativeTime value={e.created_at} />
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Fetch helper used by the detail page to load changelog for an entity.
 *  Returns items plus the server-side total (the list endpoint is page-
 *  capped, so the badge should show the real total, not items.length). */
export async function fetchChangelog(
  entity: EntityName,
  entityId: string,
): Promise<{ items: ChangelogEntry[]; total: number }> {
  let result;
  try {
    result = await api.GET("/api/changelog", {
      params: { query: { entity, entity_id: entityId, limit: 100 } },
    });
  } catch (error) {
    // A record made offline has no history on the server yet.
    if (isPendingCreate(entity, entityId)) return { items: [], total: 0 };
    throw error;
  }
  const data = result.data;
  return {
    items: (data?.items ?? []) as ChangelogEntry[],
    total: data?.total ?? 0,
  };
}
