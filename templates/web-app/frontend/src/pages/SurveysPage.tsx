import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Pencil, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { useAllSurveys, useDeleteSurvey, useUpdateSurvey } from "../hooks/useSurveys";
import { useSavedViews } from "../hooks/useSavedViews";
import { useTableUrlState } from "../hooks/useTableUrlState";
import { useNewRecordIntent } from "../hooks/useNewRecord";
import { useCan } from "../hooks/useCan";
import { deleteSequentially, useUndoableDelete } from "../hooks/useUndoableDelete";
import { ManagedDataTable } from "../components/ui/ManagedDataTable";
import { DeleteConfirmDialog } from "../components/DeleteConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { SurveyFormDialog } from "../components/SurveyFormDialog";
import { StatusBadge } from "../components/StatusBadge";
import { RowActionButton, RowActions } from "../components/ui/row-actions";
import { TableSkeleton } from "../components/ui/table-skeleton";
import { useRegisterHelpTopics } from "../help/useRegisterHelpTopics";
import { SURVEYS_HELP_TOPICS } from "../help/pageTopics";
import { NO_VALUE, formatDate } from "../lib/format";
import { SURVEY_STATUSES, vocabularyLabel } from "../lib/vocabularies";
import type { FilterableColumn } from "../lib/tableFilters";
import type { components } from "../types/openapi";
import { LoadError } from "../components/LoadError";

type Survey = components["schemas"]["SurveyRead"];

/** Every survey across every site: filter, edit status/surveyor inline,
 *  or jump to the site. */
export function SurveysPage() {
  const navigate = useNavigate();
  useRegisterHelpTopics(SURVEYS_HELP_TOPICS);
  const { data, isPending, error, refetch } = useAllSurveys();
  const updateSurvey = useUpdateSurvey();
  const deleteSurvey = useDeleteSurvey();
  const savedViews = useSavedViews("surveys");
  const tableUrlState = useTableUrlState();
  const can = useCan();

  const [createOpen, setCreateOpen] = useState(false);
  // A new survey can arrive with its site chosen (the phone "+" on a site).
  const [createSiteId, setCreateSiteId] = useState<string | undefined>();
  useNewRecordIntent(({ siteId }) => {
    setCreateSiteId(siteId);
    setCreateOpen(true);
  }, can);
  const [editing, setEditing] = useState<Survey | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState<string[] | null>(null);

  const undoable = useUndoableDelete((id, onError) => deleteSurvey.mutate(id, { onError }));
  const rows = undoable.hide(data?.items);

  // Columns are memoised once; row actions call through a ref.
  const rowActions = {
    edit: (s: Survey) => setEditing(s),
    remove: (s: Survey) =>
      undoable.softDelete(s.id, `Survey of ${formatDate(s.survey_date)} moved to the recycle bin`),
  };
  const actions = useRef(rowActions);
  actions.current = rowActions;

  const columns = useMemo<ColumnDef<Survey, unknown>[]>(
    () => [
      {
        id: "survey_date",
        accessorKey: "survey_date",
        header: "Date",
        cell: (info) => <span className="tnum">{formatDate(info.getValue<string>())}</span>,
      },
      {
        id: "site_name",
        accessorFn: (s) => s.site_name ?? "",
        header: "Site",
        meta: { width: "12rem", maxWidth: "20rem" },
        cell: ({ row }) => (
          <Link
            to={`/sites/${row.original.site_id}`}
            className="text-foreground hover:text-primary hover:underline tap-area"
          >
            {row.original.site_name ?? NO_VALUE}
          </Link>
        ),
      },
      {
        id: "surveyor",
        accessorKey: "surveyor",
        header: "Surveyor",
        meta: { editable: true, type: "text" },
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        cell: (info) => (
          <StatusBadge
            value={info.getValue<string>()}
            kind="survey"
            label={vocabularyLabel(info.getValue<string>())}
          />
        ),
        meta: { editable: true, type: "select", options: SURVEY_STATUSES },
      },
      {
        id: "summary",
        accessorFn: (s) => s.summary ?? "",
        header: "Summary",
        meta: { editable: true, type: "text", maxWidth: "24rem" },
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.summary || NO_VALUE}</span>
        ),
      },
      // Row actions only for roles that can use them (viewers get none).
      ...(can.edit
        ? [
            {
              id: "actions",
              header: "",
              enableSorting: false,
              meta: { width: "shrink", align: "right" },
              cell: ({ row }) => (
                <RowActions>
                  <RowActionButton
                    label="Edit survey"
                    onClick={() => actions.current.edit(row.original)}
                  >
                    <Pencil />
                  </RowActionButton>
                  {can.remove && (
                    <RowActionButton
                      label="Delete survey"
                      tone="destructive"
                      onClick={() => actions.current.remove(row.original)}
                    >
                      <Trash2 />
                    </RowActionButton>
                  )}
                </RowActions>
              ),
            } satisfies ColumnDef<Survey, unknown>,
          ]
        : []),
    ],
    [can.edit, can.remove],
  );

  const filterableColumns: FilterableColumn<Survey>[] = useMemo(
    () => [
      {
        id: "status",
        label: "Status",
        type: "select",
        options: SURVEY_STATUSES,
        accessor: (s) => s.status,
      },
      { id: "site_name", label: "Site", type: "text", accessor: (s) => s.site_name },
      { id: "surveyor", label: "Surveyor", type: "text", accessor: (s) => s.surveyor },
      { id: "summary", label: "Summary", type: "text", accessor: (s) => s.summary },
    ],
    [],
  );

  async function handleCellEdit(survey: Survey, columnId: string, value: string) {
    const trimmed = value.trim();
    if (columnId === "summary") {
      await updateSurvey.mutateAsync({ id: survey.id, body: { summary: trimmed || null } });
    } else if (columnId === "surveyor" && trimmed) {
      await updateSurvey.mutateAsync({ id: survey.id, body: { surveyor: trimmed } });
    } else if (columnId === "status") {
      await updateSurvey.mutateAsync({
        id: survey.id,
        body: { status: value as (typeof SURVEY_STATUSES)[number] },
      });
    }
  }

  return (
    <>
      <PageHeader title="Surveys" />

      {error && <LoadError error={error} what="surveys" onRetry={() => void refetch()} />}
      {isPending && <TableSkeleton />}
      {!isPending && data && (
        <div className="min-h-0 flex-1">
          <ManagedDataTable
            data={rows ?? []}
            columns={columns}
            exportName="surveys"
            emptyMessage="No surveys yet — add one to get started."
            savedViews={savedViews}
            totalRows={data.total}
            initialSearch={tableUrlState.initial.search}
            initialSorting={tableUrlState.initial.sorting}
            initialConditions={tableUrlState.initial.conditions}
            onStateChange={tableUrlState.publish}
            filterableColumns={filterableColumns}
            primaryAction={
              can.edit
                ? {
                    label: "Add survey",
                    onClick: () => {
                      setCreateSiteId(undefined);
                      setCreateOpen(true);
                    },
                  }
                : undefined
            }
            scrollRestoreKey="surveys"
            onCellEdit={can.edit ? handleCellEdit : undefined}
            enableSelection={can.edit}
            onDeleteSelected={can.remove ? (ids) => setPendingBulkDelete(ids) : undefined}
            onRowOpen={(s) => navigate(`/surveys/${s.id}`)}
            renderMobileCard={(s) => (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-card p-[var(--card-p)]">
                <Link to={`/surveys/${s.id}`} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground">{s.site_name}</span>
                    <StatusBadge value={s.status} kind="survey" label={vocabularyLabel(s.status)} />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(s.survey_date)} · {s.surveyor}
                  </span>
                </Link>
                {can.edit && (
                  <>
                    <RowActionButton label="Edit survey" size="icon" onClick={() => setEditing(s)}>
                      <Pencil />
                    </RowActionButton>
                  </>
                )}
              </div>
            )}
          />
        </div>
      )}

      <SurveyFormDialog
        open={createOpen}
        siteId={createSiteId}
        onClose={() => {
          setCreateOpen(false);
          setCreateSiteId(undefined);
        }}
      />
      <SurveyFormDialog open={editing !== null} survey={editing} onClose={() => setEditing(null)} />
      <DeleteConfirmDialog
        open={pendingBulkDelete !== null}
        onClose={() => setPendingBulkDelete(null)}
        onConfirm={() =>
          pendingBulkDelete &&
          deleteSequentially(pendingBulkDelete, (id) => deleteSurvey.mutateAsync(id), "survey")
        }
        count={pendingBulkDelete?.length}
        entityLabel="survey"
        recoverable
        loading={deleteSurvey.isPending}
      />
    </>
  );
}
