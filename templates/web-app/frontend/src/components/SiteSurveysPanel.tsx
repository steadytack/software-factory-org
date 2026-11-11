import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList, ClipboardPlus, Pencil, Trash2 } from "lucide-react";

import { useCan } from "../hooks/useCan";
import { useAllSurveys, useDeleteSurvey, useUpdateSurvey } from "../hooks/useSurveys";
import { NO_VALUE, formatDate, formatDateTime } from "../lib/format";
import type { FilterableColumn } from "../lib/tableFilters";
import { SURVEY_STATUSES, vocabularyLabel } from "../lib/vocabularies";
import type { components } from "../types/openapi";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { StatusBadge } from "./StatusBadge";
import { SurveyFormDialog } from "./SurveyFormDialog";
import { LoadError } from "./LoadError";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { ManagedDataTable } from "./ui/ManagedDataTable";
import { RowActions, RowActionsMenu } from "./ui/row-actions";
import { TableSkeleton } from "./ui/table-skeleton";
import { TABLE_PANEL } from "../lib/tablePanel";

type Survey = components["schemas"]["SurveyRead"];

/** Every field of a survey is a column (the site is this page's own, so it is not one); these are
 *  hidden until the person adds them from Columns. */
const HIDDEN_BY_DEFAULT = { created_at: false, updated_at: false };

const FILTERS: FilterableColumn<Survey>[] = [
  { id: "survey_date", label: "Date", type: "date", accessor: (s) => s.survey_date },
  { id: "status", label: "Status", type: "select", options: [...SURVEY_STATUSES], accessor: (s) => s.status },
  { id: "surveyor", label: "Surveyor", type: "text", accessor: (s) => s.surveyor },
  { id: "summary", label: "Summary", type: "text", accessor: (s) => s.summary },
  { id: "created_at", label: "Added", type: "date", accessor: (s) => s.created_at },
  { id: "updated_at", label: "Updated", type: "date", accessor: (s) => s.updated_at },
];

/** The status filter carries from one site to the next; a surveyor, a summary or a date is about this
 *  site's surveys, and kept would make the next site's tab look empty. */
const REMEMBERED_FILTERS = ["status"];

interface SiteSurveysPanelProps {
  site: { id: string; name: string };
  /** Opens the page-level "Add survey" dialog (shared with the header button). */
  onAddSurvey: () => void;
}

/** The site page's Surveys tab: every survey for the site in a managed table (search, header filters,
 *  sort, columns, CSV), with add / edit / status / delete in place. One saved view serves every site. */
export function SiteSurveysPanel({ site, onAddSurvey }: SiteSurveysPanelProps) {
  const can = useCan();
  const surveysQuery = useAllSurveys({ siteId: site.id });
  const updateSurvey = useUpdateSurvey();
  const deleteSurvey = useDeleteSurvey();

  const [editSurvey, setEditSurvey] = useState<Survey | null>(null);
  const [removeSurvey, setRemoveSurvey] = useState<Survey | null>(null);

  const surveys = useMemo(() => surveysQuery.data?.items ?? [], [surveysQuery.data]);

  // Read at click time by the row menus, so the columns needn't rebuild.
  const rowActions = {
    edit: (s: Survey) => setEditSurvey(s),
    setStatus: (s: Survey, status: "draft" | "completed") => updateSurvey.mutate({ id: s.id, body: { status } }),
    remove: (s: Survey) => setRemoveSurvey(s),
  };
  const actions = useRef(rowActions);
  actions.current = rowActions;

  const columns = useMemo<ColumnDef<Survey, unknown>[]>(
    () => [
      {
        id: "survey_date",
        accessorKey: "survey_date",
        header: "Date",
        cell: ({ row }) => (
          <Link
            to={`/surveys/${row.original.id}`}
            className="tnum text-foreground hover:text-primary hover:underline tap-area"
          >
            {formatDate(row.original.survey_date)}
          </Link>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        cell: (info) => (
          <StatusBadge value={info.getValue<string>()} kind="survey" label={vocabularyLabel(info.getValue<string>())} />
        ),
      },
      { id: "surveyor", accessorKey: "surveyor", header: "Surveyor" },
      {
        id: "summary",
        accessorFn: (s) => s.summary ?? "",
        header: "Summary",
        meta: { maxWidth: "24rem" },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.summary || NO_VALUE}</span>,
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        header: "Added",
        cell: (info) => <span className="tnum text-muted-foreground">{formatDateTime(info.getValue<string>())}</span>,
      },
      {
        id: "updated_at",
        accessorKey: "updated_at",
        header: "Updated",
        cell: (info) => <span className="tnum text-muted-foreground">{formatDateTime(info.getValue<string>())}</span>,
      },
      ...(can.edit
        ? [
            {
              id: "actions",
              header: "",
              enableSorting: false,
              meta: { width: "shrink", align: "right" },
              cell: ({ row }) => {
                const s = row.original;
                return (
                  <RowActions>
                    <RowActionsMenu
                      label={`Actions for the survey of ${formatDate(s.survey_date)}`}
                      items={[
                        { label: "Edit survey", icon: <Pencil />, onSelect: () => actions.current.edit(s) },
                        s.status === "draft"
                          ? {
                              label: "Mark completed",
                              icon: <ClipboardList />,
                              onSelect: () => actions.current.setStatus(s, "completed"),
                            }
                          : {
                              label: "Reopen as draft",
                              icon: <ClipboardList />,
                              onSelect: () => actions.current.setStatus(s, "draft"),
                            },
                        ...(can.remove
                          ? [
                              {
                                label: "Delete survey",
                                icon: <Trash2 />,
                                tone: "destructive" as const,
                                separated: true,
                                onSelect: () => actions.current.remove(s),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </RowActions>
                );
              },
            } satisfies ColumnDef<Survey, unknown>,
          ]
        : []),
    ],
    [can.edit, can.remove],
  );

  if (surveysQuery.isPending) return <TableSkeleton rows={3} />;
  if (surveysQuery.isError) return <LoadError error={surveysQuery.error} what="surveys" />;

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
      {/* Scrolls inside the page past min(34rem, 70vh), header in view (lib/tablePanel.ts). */}
      <div className={TABLE_PANEL}>
      <ManagedDataTable
        data={surveys}
        columns={columns}
        exportName={`surveys-${site.name}`}
        layoutKey="site-surveys"
        initialVisibility={HIDDEN_BY_DEFAULT}
        filterableColumns={FILTERS}
        rememberedFilterFields={REMEMBERED_FILTERS}
        defaultSorting={[{ id: "survey_date", desc: true }]}
        totalRows={surveysQuery.data?.total}
        emptyMessage="No surveys match these filters."
        primaryAction={can.edit ? { label: "Add survey", onClick: onAddSurvey } : undefined}
        // On a phone, cards as on the Surveys page (the table's filters stay in its toolbar menu).
        renderMobileCard={(s) => (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-card p-[var(--card-p)]">
            <Link to={`/surveys/${s.id}`} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-1">
              <span className="flex items-center gap-2">
                <span className="truncate font-medium text-foreground">{formatDate(s.survey_date)}</span>
                <StatusBadge value={s.status} kind="survey" label={vocabularyLabel(s.status)} />
              </span>
              <span className="text-xs text-muted-foreground">
                {s.surveyor}
                {s.summary ? ` · ${s.summary}` : ""}
              </span>
            </Link>
          </div>
        )}
      />
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
