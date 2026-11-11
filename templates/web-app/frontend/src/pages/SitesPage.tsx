import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { rememberSitesUrl } from "../lib/listContext";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { useAllSites, useCreateSite, useUpdateSite, useDeleteSite } from "../hooks/useSites";
import { useSavedViews } from "../hooks/useSavedViews";
import { deleteSequentially } from "../hooks/useUndoableDelete";
import { useNewRecordIntent } from "../hooks/useNewRecord";
import { useCan } from "../hooks/useCan";
import { useTableUrlState } from "../hooks/useTableUrlState";
import { ManagedDataTable } from "../components/ui/ManagedDataTable";
import { RecordFormDialog } from "../components/RecordFormDialog";
import { DeleteConfirmDialog } from "../components/DeleteConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { RowActionButton, RowActions } from "../components/ui/row-actions";
import { SiteLocationFields } from "../components/SiteLocationFields";
import { TableSkeleton } from "../components/ui/table-skeleton";
import {
  EMPTY_SITE_FORM,
  SITE_FORM_FIELDS,
  SITE_TYPES,
  STATUSES,
  coordinatesText,
  formToSitePayload,
  type SiteFormValues,
} from "../lib/siteForm";
import { StatusBadge } from "../components/StatusBadge";
import { NO_VALUE, formatCoordinate, formatDateTime } from "../lib/format";
import { vocabularyLabel } from "../lib/vocabularies";
import type { FilterableColumn } from "../lib/tableFilters";
import { RecordPeek } from "../components/RecordPeek";
import type { components } from "../types/openapi";
import { LoadError } from "../components/LoadError";

type Site = components["schemas"]["SiteRead"];

const FORM_FIELDS = SITE_FORM_FIELDS;

/** Every field of a site is a column; these are hidden until the person adds them from Columns. The
 *  default set is what a person scans a list of sites for: name, type, status, address, postcode, where. */
const SITE_HIDDEN_BY_DEFAULT = {
  notes: false,
  latitude: false,
  longitude: false,
  created_at: false,
  updated_at: false,
};


export function SitesPage() {
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useAllSites();
  const createSite = useCreateSite();
  const updateSite = useUpdateSite();
  const deleteSite = useDeleteSite();
  const savedViews = useSavedViews("sites");
  const tableUrlState = useTableUrlState();
  const can = useCan();

  const location = useLocation();
  const listUrl = `${location.pathname}${location.search}`;
  // Read at click time by the name links, so columns needn't rebuild per URL change.
  const listUrlRef = useRef(listUrl);
  listUrlRef.current = listUrl;
  useEffect(() => {
    rememberSitesUrl(listUrl);
  }, [listUrl]);
  // Dashboard's "Add site" navigates here with { create: true }.
  const [dialogOpen, setDialogOpen] = useState(
    () => (location.state as { create?: boolean } | null)?.create === true,
  );
  useEffect(() => {
    if ((location.state as { create?: boolean } | null)?.create) {
      // Clear it so a refresh or back-navigation doesn't reopen the dialog.
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [location, navigate]);
  useNewRecordIntent(() => setDialogOpen(true), can);
  const [form, setForm] = useState<SiteFormValues>(EMPTY_SITE_FORM);
  // Deleting a site is permanent and takes everything under it, so one and many both confirm first
  // (the 6-second Undo toast used for surveys is not enough for this).
  const [pendingBulkDelete, setPendingBulkDelete] = useState<string[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Site | null>(null);

  // Columns are memoised once; call through a ref for the latest closure.
  const askDelete = (site: Site) => setPendingDelete(site);
  const askDeleteRef = useRef(askDelete);
  askDeleteRef.current = askDelete;
  // Archiving is the everyday "remove": reversible, keeps the history, and
  // open to editors. Permanent delete stays an admin action.
  const toggleArchive = (site: Site) => {
    const status = site.status === "archived" ? "active" : "archived";
    updateSite.mutate(
      { id: site.id, body: { status } },
      {
        onSuccess: () =>
          toast.success(status === "archived" ? `Archived ${site.name}.` : `Restored ${site.name}.`),
      },
    );
  };
  const toggleArchiveRef = useRef(toggleArchive);
  toggleArchiveRef.current = toggleArchive;

  const visibleSites = data?.items;

  const columns = useMemo<ColumnDef<Site, unknown>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "Name",
        meta: { width: "12rem", maxWidth: "20rem" },
        cell: (info) => (
          <Link
            to={`/sites/${info.row.original.id}`}
            state={{ from: listUrlRef.current }}
            className="text-foreground hover:text-primary hover:underline tap-area"
          >
            {info.getValue<string>()}
          </Link>
        ),
      },
      {
        id: "site_type",
        accessorKey: "site_type",
        header: "Type",
        cell: (info) => <span className="capitalize">{info.getValue<string>()}</span>,
        meta: { editable: true, type: "select", options: SITE_TYPES },
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        cell: (info) => <StatusBadge value={info.getValue<string>()} kind="site" />,
        meta: { editable: true, type: "select", options: STATUSES },
      },
      {
        id: "address",
        accessorKey: "address",
        header: "Address",
        cell: (info) => (
          <span className="text-muted-foreground">
            {info.getValue<string | null>() ?? NO_VALUE}
          </span>
        ),
        meta: { editable: true, type: "text", maxWidth: "24rem" },
      },
      {
        id: "postcode",
        accessorKey: "postcode",
        header: "Postcode",
        cell: (info) => (
          <span className="text-muted-foreground">{info.getValue<string | null>() ?? NO_VALUE}</span>
        ),
        meta: { editable: true, type: "text" },
      },
      {
        id: "coordinates",
        header: "Coordinates (BNG)",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {coordinatesText(row.original.latitude, row.original.longitude) || NO_VALUE}
          </span>
        ),
      },
      // Every other field of a site is a column too, hidden until chosen (SITE_HIDDEN_BY_DEFAULT).
      {
        id: "notes",
        accessorFn: (s) => s.notes ?? "",
        header: "Notes",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.notes || NO_VALUE}</span>
        ),
        meta: { editable: true, type: "text", maxWidth: "24rem" },
      },
      {
        id: "latitude",
        accessorKey: "latitude",
        header: "Latitude",
        cell: (info) => <span className="font-mono text-xs">{formatCoordinate(info.getValue<number>())}</span>,
        meta: { align: "right" },
      },
      {
        id: "longitude",
        accessorKey: "longitude",
        header: "Longitude",
        cell: (info) => <span className="font-mono text-xs">{formatCoordinate(info.getValue<number>())}</span>,
        meta: { align: "right" },
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
                const archived = row.original.status === "archived";
                return (
                  <RowActions>
                    <RowActionButton
                      label={archived ? `Restore ${row.original.name}` : `Archive ${row.original.name}`}
                      onClick={() => toggleArchiveRef.current(row.original)}
                    >
                      {archived ? <ArchiveRestore /> : <Archive />}
                    </RowActionButton>
                    {can.remove && (
                      <RowActionButton
                        label={`Delete ${row.original.name} permanently`}
                        tone="destructive"
                        onClick={() => askDeleteRef.current(row.original)}
                      >
                        <Trash2 />
                      </RowActionButton>
                    )}
                  </RowActions>
                );
              },
            } satisfies ColumnDef<Site, unknown>,
          ]
        : []),
    ],
    [can.edit, can.remove],
  );

  const filterableColumns: FilterableColumn<Site>[] = useMemo(
    () => [
      { id: "site_type", label: "Type", type: "select", options: SITE_TYPES, accessor: (s) => s.site_type },
      { id: "status", label: "Status", type: "select", options: STATUSES, accessor: (s) => s.status },
      { id: "name", label: "Name", type: "text", accessor: (s) => s.name },
      { id: "address", label: "Address", type: "text", accessor: (s) => s.address },
      { id: "postcode", label: "Postcode", type: "text", accessor: (s) => s.postcode ?? null },
      { id: "notes", label: "Notes", type: "text", accessor: (s) => s.notes },
      { id: "latitude", label: "Latitude", type: "number", accessor: (s) => String(s.latitude) },
      { id: "longitude", label: "Longitude", type: "number", accessor: (s) => String(s.longitude) },
      { id: "created_at", label: "Added", type: "date", accessor: (s) => s.created_at },
      { id: "updated_at", label: "Updated", type: "date", accessor: (s) => s.updated_at },
    ],
    [],
  );

  async function handleCellEdit(site: Site, columnId: string, value: string) {
    await updateSite.mutateAsync({ id: site.id, body: { [columnId]: value } });
  }

  function handleBulkDelete() {
    if (!pendingBulkDelete) return;
    void deleteSequentially(pendingBulkDelete, (id) => deleteSite.mutateAsync(id), "site");
  }

  function handleSubmit() {
    const result = formToSitePayload(form);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    createSite.mutate(result.body, {
      onSuccess: () => {
        setDialogOpen(false);
        setForm(EMPTY_SITE_FORM);
        toast.success(`Created ${result.body.name}.`);
      },
    });
  }

  return (
    <>
      <PageHeader title="Sites" />

      {error && <LoadError error={error} what="sites" onRetry={() => void refetch()} />}
      {isPending && <TableSkeleton />}
      {!isPending && data && (
        <div className="flex-1 min-h-0">
        <ManagedDataTable
          data={visibleSites ?? []}
          columns={columns}
          exportName="sites"
          initialVisibility={SITE_HIDDEN_BY_DEFAULT}
          emptyMessage="No sites yet — add one to get started."
          savedViews={savedViews}
          totalRows={data.total}
          // `coordinates` is a render-only column with no
          // accessor, so `row.getValue("coordinates")` was `undefined` and
          // latitude/longitude were **dropped from the CSV entirely**. Split
          // into two real columns in the file, at full precision — the
          // 4-decimal display rounding is for reading, not for export.
          exportColumns={{
            coordinates: (site) => {
              const [easting = "", northing = ""] = coordinatesText(site.latitude, site.longitude).split(", ");
              return { easting, northing, latitude: site.latitude, longitude: site.longitude };
            },
          }}
          // search, sort and filter conditions live in the query
          // string, so a filtered view survives refresh and back — and can
          // be linked.
          initialSearch={tableUrlState.initial.search}
          initialSorting={tableUrlState.initial.sorting}
          initialConditions={tableUrlState.initial.conditions}
          onStateChange={tableUrlState.publish}
          filterableColumns={filterableColumns}
          primaryAction={can.edit ? { label: "Add site", onClick: () => setDialogOpen(true) } : undefined}
          scrollRestoreKey="sites"
          onCellEdit={can.edit ? handleCellEdit : undefined}
          enableSelection={can.edit}
          onDeleteSelected={can.remove ? (ids) => setPendingBulkDelete(ids) : undefined}
          onRowOpen={(site) => navigate(`/sites/${site.id}`, { state: { from: listUrlRef.current } })}
          peek={{
            title: (site) => site.name,
            description: (site) => vocabularyLabel(site.site_type),
            fullPageLabel: "Open site",
            render: (site) => (
              <RecordPeek
                entity="site"
                entityId={site.id}
                updatedAt={site.updated_at}
                fields={[
                  { label: "Status", value: <StatusBadge value={site.status} kind="site" /> },
                  { label: "Type", value: vocabularyLabel(site.site_type) },
                  { label: "Address", value: site.address || NO_VALUE },
                  { label: "Postcode", value: site.postcode || NO_VALUE },
                  {
                    label: "Location",
                    value: `${formatCoordinate(site.latitude)}, ${formatCoordinate(site.longitude)}`,
                  },
                  { label: "Notes", value: site.notes || NO_VALUE },
                ]}
              />
            ),
          }}
          renderMobileCard={(site) => (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-card p-[var(--card-p)]">
              <Link
                to={`/sites/${site.id}`}
                state={{ from: listUrlRef.current }}
                className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-1"
              >
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium text-foreground">{site.name}</span>
                  <StatusBadge value={site.status} kind="site" />
                </span>
                <span className="text-xs capitalize text-muted-foreground">{site.site_type}</span>
                <span className="truncate text-sm text-muted-foreground">
                  {[site.address, site.postcode].filter(Boolean).join(", ") || NO_VALUE}
                </span>
              </Link>
              {can.remove && (
                <RowActionButton
                  label={`Delete ${site.name}`}
                  tone="destructive"
                  size="icon"
                  className="shrink-0"
                  onClick={() => askDelete(site)}
                >
                  <Trash2 />
                </RowActionButton>
              )}
            </div>
          )}
        />
        </div>
      )}

      <RecordFormDialog
        open={dialogOpen}
        title="Add site"
        fields={FORM_FIELDS}
        values={form}
        onChange={(name, value) => setForm((f) => ({ ...f, [name]: value }))}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
        loading={createSite.isPending}
        contentClassName="sm:max-w-2xl"
      >
        <SiteLocationFields
          idPrefix="new-site"
          values={form}
          onChange={(name, value) => setForm((f) => ({ ...f, [name]: value }))}
        />
      </RecordFormDialog>

      <DeleteConfirmDialog
        open={pendingBulkDelete !== null || pendingDelete !== null}
        onClose={() => {
          setPendingBulkDelete(null);
          setPendingDelete(null);
        }}
        onConfirm={() => {
          if (pendingDelete) deleteSite.mutate(pendingDelete.id);
          else handleBulkDelete();
        }}
        name={pendingDelete?.name}
        count={pendingBulkDelete?.length}
        entityLabel="site"
        consequence="Its surveys, comments and files are deleted with it."
        loading={deleteSite.isPending}
      />
    </>
  );
}
