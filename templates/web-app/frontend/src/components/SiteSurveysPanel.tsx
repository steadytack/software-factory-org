import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ClipboardList,
  ClipboardPlus,
  Pencil,
  ArrowUpDown,
  ListFilter,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { useCan } from "../hooks/useCan";
import { useAllSurveys, useDeleteSurvey, useUpdateSurvey } from "../hooks/useSurveys";
import { formatDate } from "../lib/format";
import { SURVEY_STATUSES, vocabularyLabel } from "../lib/vocabularies";
import type { components } from "../types/openapi";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { PageCapBanner } from "./PageCapBanner";
import { StatusBadge } from "./StatusBadge";
import { SurveyFormDialog } from "./SurveyFormDialog";
import { LoadError } from "./LoadError";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { RowActions, RowActionsMenu } from "./ui/row-actions";
import { Skeleton } from "./ui/skeleton";
import { IconButton } from "./ui/icon-button";
import { IconSelect } from "./ui/icon-select";
import { SearchToggle } from "./ui/search-toggle";

type Survey = components["schemas"]["SurveyRead"];

const ALL = "all";

interface SiteSurveysPanelProps {
  site: { id: string; name: string };
  /** Opens the page-level "Add survey" dialog (shared with the header button). */
  onAddSurvey: () => void;
}

/** The site page's Surveys tab: every survey for the site, searchable and
 *  filterable, with add / edit / status / delete in place. */
export function SiteSurveysPanel({ site, onAddSurvey }: SiteSurveysPanelProps) {
  const can = useCan();
  const surveysQuery = useAllSurveys({ siteId: site.id });
  const updateSurvey = useUpdateSurvey();
  const deleteSurvey = useDeleteSurvey();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [sortKey, setSortKey] = useState<"newest" | "oldest">("newest");

  const [editSurvey, setEditSurvey] = useState<Survey | null>(null);
  const [removeSurvey, setRemoveSurvey] = useState<Survey | null>(null);

  const surveys = useMemo(() => surveysQuery.data?.items ?? [], [surveysQuery.data]);
  const filtering = q.trim() !== "" || status !== ALL;

  const visibleSurveys = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matching = surveys.filter(
      (s) =>
        (status === ALL || s.status === status) &&
        (needle === "" || `${s.surveyor} ${s.summary ?? ""}`.toLowerCase().includes(needle)),
    );
    return matching.sort((a, b) => {
      const diff = new Date(b.survey_date).getTime() - new Date(a.survey_date).getTime();
      return sortKey === "newest" ? diff : -diff;
    });
  }, [surveys, q, status, sortKey]);

  if (surveysQuery.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    );
  }
  if (surveysQuery.isError) {
    return <LoadError error={surveysQuery.error} what="surveys" />;
  }

  if (surveys.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList className="size-8" />}
        title="No surveys yet"
        description="Record a visit to this site."
        action={
          can.edit ? (
            <Button size="sm" onClick={onAddSurvey}>
              <ClipboardPlus />
              Add survey
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* One card holds the toolbar and the rows, like Comments, Attachments and History. */}
      <div className="rounded-lg border border-border bg-card p-3">
      {/* The same toolbar as Comments, Attachments and History: icons, then the count. */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {can.edit && (
          <IconButton label="Add survey" variant="default" onClick={onAddSurvey}>
            <Plus />
          </IconButton>
        )}
        <SearchToggle value={q} onChange={setQ} label="Search surveys" placeholder="Search surveys…" />
        <IconSelect
          icon={<ListFilter />}
          label="Filter by status"
          highlighted={status !== ALL}
          value={status}
          onChange={setStatus}
          options={[{ value: ALL, label: "All statuses" }, ...SURVEY_STATUSES.map((st) => ({ value: st, label: vocabularyLabel(st) }))]}
        />
        <IconSelect
          icon={<ArrowUpDown />}
          label="Sort surveys"
          value={sortKey}
          onChange={(v) => setSortKey(v as "newest" | "oldest")}
          options={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
          ]}
        />
        <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-muted-foreground tnum">
          {filtering ? `${visibleSurveys.length} / ${surveys.length}` : surveys.length}
        </span>
      </div>

      <PageCapBanner loaded={surveys.length} total={surveysQuery.data?.total ?? 0} noun="surveys" />

      {visibleSurveys.length === 0 ? (
        <EmptyState
          icon={<Search className="size-8" />}
          title="Nothing matches"
          description="No surveys match these filters."
        />
      ) : (
        <ul className="divide-y divide-border">
        {visibleSurveys.map((s) => (
          <li key={s.id} className="space-y-2 py-3 first:pt-1 last:pb-1">
              <div className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
                  <Link
                    to={`/surveys/${s.id}`}
                    className="text-sm font-semibold text-foreground hover:text-primary hover:underline tap-area"
                  >
                    Survey {formatDate(s.survey_date)}
                  </Link>
                  <StatusBadge value={s.status} kind="survey" label={vocabularyLabel(s.status)} />
                  <span className="text-xs text-muted-foreground">by {s.surveyor}</span>
                </div>
                {can.edit && (
                  <RowActions>
                    <RowActionsMenu
                      label="Survey actions"
                      items={[
                        {
                          label: "Edit survey",
                          icon: <Pencil />,
                          onSelect: () => setEditSurvey(s),
                        },
                        s.status === "draft"
                          ? {
                              label: "Mark completed",
                              icon: <ClipboardList />,
                              onSelect: () =>
                                updateSurvey.mutate({ id: s.id, body: { status: "completed" } }),
                            }
                          : {
                              label: "Reopen as draft",
                              icon: <ClipboardList />,
                              onSelect: () =>
                                updateSurvey.mutate({ id: s.id, body: { status: "draft" } }),
                            },
                        ...(can.remove
                          ? [
                              {
                                label: "Delete survey",
                                icon: <Trash2 />,
                                tone: "destructive" as const,
                                separated: true,
                                onSelect: () => setRemoveSurvey(s),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </RowActions>
                )}
              </div>
              {s.summary && <p className="text-sm text-muted-foreground">{s.summary}</p>}
          </li>
        ))}
        </ul>
      )}
      </div>

      <SurveyFormDialog
        open={editSurvey !== null}
        survey={editSurvey}
        siteName={site.name}
        onClose={() => setEditSurvey(null)}
      />
      <DeleteConfirmDialog
        open={removeSurvey !== null}
        onClose={() => setRemoveSurvey(null)}
        onConfirm={() =>
          removeSurvey &&
          deleteSurvey.mutate(removeSurvey.id, { onSuccess: () => setRemoveSurvey(null) })
        }
        name={removeSurvey ? `Survey ${formatDate(removeSurvey.survey_date)}` : undefined}
        entityLabel="survey"
        recoverable
        loading={deleteSurvey.isPending}
      />
    </div>
  );
}
