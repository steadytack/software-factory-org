import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FocusEvent, KeyboardEvent, MouseEvent, ReactNode } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Inbox,
  Pencil,
  PencilOff,
  Plus,
  Search,
  SearchX,
} from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type ColumnOrderState,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { cn } from "../../lib/utils";
import { PageMessage } from "./page-message";
import { matchesAllConditions, type FilterCondition, type FilterableColumn } from "../../lib/tableFilters";
import { IconButton } from "./icon-button";
import { EmptyState } from "./empty-state";
import { TableFilterSort } from "./table-filter-sort";
import { useIsMobile } from "../../hooks/use-mobile";
import { readScroll, writeScroll } from "../../lib/listContext";
import {
  loadColumnLayout,
  loadTableState,
  reconcileOrder,
  rowHeightFor,
  rowPaddingFor,
  saveColumnLayout,
  saveTableState,
} from "../../lib/tableViewPrefs";
import { ColumnFilterMenu } from "./table/ColumnFilterMenu";
import { useTableDisplayPrefs } from "../../hooks/useTableDisplayPrefs";
import { Checkbox } from "./checkbox";
import { ColumnsMenu } from "./table/ColumnsMenu";
import { SavedViewsMenu } from "./table/SavedViewsMenu";
import { ViewOptionsMenu } from "./table/ViewOptionsMenu";
import { PeekPanel, type PeekConfig } from "./table/PeekPanel";
import { SelectionControls } from "./table/SelectionControls";
import { TableSearchBox } from "./table/TableSearchBox";
import { useBulkEdit } from "./table/useBulkEdit";
import { useCardSelection } from "./table/useCardSelection";
import { useCellEditing } from "./table/useCellEditing";
import { useColumnLayout } from "./table/useColumnLayout";
import { ColumnResizeHandle } from "./table/ColumnResizeHandle";
import { EditingCell } from "./table/EditingCell";
import { searchableText } from "./table/csv";
import { downloadTableCsv } from "./table/exportCsv";
import type { EditableColumnMeta } from "./table/columnMeta";

export type { EditableColumnMeta } from "./table/columnMeta";
import type { SavedViewsApi, TableViewState } from "../../hooks/useSavedViews";
import { registerSearchItem, unregisterSearchItem } from "../../search/registry";

/** Toolbar icon buttons on the neutral fill: a compact 2rem on desktop
 *  whatever the density; on phones, control-height squares for touch. */
const TOOLBAR_BTN = "size-[var(--control-h)] md:size-8";
/** Frozen body cells need an opaque background that still tracks the row's
 *  hover/focus/selected tints (which are translucent on the <tr>). */
const FROZEN_CELL_BG =
  "bg-card group-hover:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))] group-focus-visible:bg-muted group-aria-selected:bg-[color-mix(in_oklab,var(--sidebar-accent)_60%,var(--card))] group-data-peeked:bg-muted";
const selectedCountOf = (selection: RowSelectionState) => Object.keys(selection).length;
/** "Wrap text": long values wrap at this width (or the column's own
 *  `maxWidth`) rather than the whole table squeezing to fit its container. */
const WRAP_MAX_WIDTH = "20rem";
/** Pressed state for toggle buttons (edit mode). */
const TOOLBAR_BTN_ON =
  "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent";

/** A table whose rows live on the server: search, sort and filters are sent to it and come back as
 *  `data` (one page), so they cover every row, not the page. The table keeps its toolbar; the page
 *  reads the state from `onStateChange`, queries (`lib/serverTable.ts` makes the parameters), and
 *  passes the page in. The backend's side is `core/table_query.py`. Proven in an app built from
 *  this template. Use it when a list can outgrow one page; keep a list a person needs offline client-side. */
export interface ServerTable {
  /** Rows matching the current search and filters, across every page. */
  total: number;
  page: number;
  size: number;
  onPageChange: (page: number) => void;
  /** Where the server writes every matching row as a CSV, for the table's current state. */
  exportHref: (state: {
    search: string;
    sorting: { id: string; desc: boolean }[];
    conditions: FilterCondition[];
  }) => string;
  /** True while the next page or state is loading, so the rows can dim rather than jump. */
  loading?: boolean;
}

export interface ManagedDataTableProps<T extends { id: string }> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  /** Initial column visibility keyed by column id. */
  initialVisibility?: VisibilityState;
  /** Global filter predicate; defaults to substring match on all cells. */
  globalFilterFn?: (row: Row<T>, columnId: string, value: string) => boolean;
  /** Filename for the CSV export (without extension). */
  exportName?: string;
  /** What this table's remembered columns, sort and filters are filed under, when its export name
   *  varies (one table shown for every record of a kind). Defaults to the export name. */
  layoutKey?: string;
  /** The sort when the person has not left one (an `initialSorting` from the address wins, then theirs). */
  defaultSorting?: SortingState;
  /** The filters on these fields are remembered between visits; the others are for now (a filter on
   *  something particular to one record would make the next record look empty). Default: all of them. */
  rememberedFilterFields?: string[];
  /** Message shown when the filtered table is empty. */
  emptyMessage?: string;
  /** When provided, enables the saved-views controls (save current / apply). */
  savedViews?: SavedViewsApi;
  /** Server-side total row count. When it exceeds data.length, a banner
   *  warns that filtering/export only cover the loaded page (audit F7). */
  totalRows?: number;
  /** Export values for render-only columns, keyed by column id.
   *
   *  the export used `row.getValue(id)` for every visible
   *  column, which is `undefined` for a column that renders from
   *  `row.original` without an accessor — so the sites CSV **dropped latitude
   *  and longitude entirely**. A column that draws data the reader can see
   *  must be able to say how that data exports.
   *
   *  An accessor may return a plain value, or a `{header: value}` record to
   *  expand into **several** CSV columns — which is what the `coordinates`
   *  column needs: one cell on screen, two columns (`latitude`, `longitude`)
   *  in a file a parser will read. */
  exportColumns?: Record<string, (row: T) => unknown | Record<string, unknown>>;
  /** Initial search term, sort and filter conditions, e.g. read from the URL
   *  (: table state was never in the URL and was lost on refresh
   *  and back). */
  initialSearch?: string;
  initialSorting?: SortingState;
  initialConditions?: FilterCondition[];
  /** Called whenever the search term, sort or filter conditions change, so
   *  the page can reflect them in the query string. */
  onStateChange?: (state: {
    search: string;
    sorting: { id: string; desc: boolean }[];
    conditions: FilterCondition[];
  }) => void;
  /** Fields the "Filter & sort" popover can build conditions against. When
   *  omitted, that toolbar button doesn't render — tables opt in. */
  filterableColumns?: FilterableColumn<T>[];
  /** Called when an inline-edited cell (`meta.editable` on that column's
   *  `ColumnDef`) is committed. Throwing surfaces via the app's existing
   *  global mutation-error toast; the cell simply reverts since it only ever
   *  displays the row's real data, never an optimistic value. */
  onCellEdit?: (row: T, columnId: string, value: string) => Promise<void>;
  /** Shows a checkbox column and a contextual "N selected" bulk-action bar.
   *  With `onCellEdit`, the bar offers "Set field" for every editable select
   *  column, applied to each selected row through `onCellEdit`.
   *  when rows are selected. Requires `onDeleteSelected` to show the bulk
   *  delete action. */
  enableSelection?: boolean;
  /** Called with the selected rows' ids when the bulk delete action is
   *  confirmed. The page owns the confirm dialog (reusing the single-row
   *  delete flow) and the actual delete mutation(s); the table just clears
   *  its selection once the underlying `data` it receives changes. */
  onDeleteSelected?: (ids: string[]) => void;
  /** When set, the table's scroll position is saved per session under this
   *  key and restored on return (e.g. back from a record page). */
  scrollRestoreKey?: string;
  /** Primary "create new row" action, rendered as the last icon button in
   *  the toolbar (e.g. "Add site"). Keeps every table's toolbar — filter,
   *  column visibility, export, saved views, add — in one consistent icon
   *  row instead of a separate labeled button elsewhere on the page. */
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
  /** Phone layout: when provided, rows render as stacked cards below `md`
   *  instead of a wide table. Cards come from the same row model, so
   *  search, filter, sort, saved views and export all still apply. */
  renderMobileCard?: (row: T) => ReactNode;
  /** Opens a row's full page: Enter on a keyboard-focused row calls this
   *  (Shift+Enter, or the panel's "Open" button, when `peek` is set). */
  onRowOpen?: (row: T) => void;
  /** Desktop side panel: clicking a row (or Enter) shows the record here
   *  instead of leaving the list, so scroll, filters and selection stay put.
   *  ↑/↓ in the panel move to the previous/next row. Phones keep `onRowOpen`. */
  peek?: PeekConfig<T>;
  /** Render just the table (no search/filter/columns/export toolbar), e.g.
   *  for a small dashboard widget. */
  hideToolbar?: boolean;
  /** Draw no frame of its own (border, shadow, radius): for a table that sits inside a card. */
  bare?: boolean;
  /** Grow with the rows instead of filling the parent's height. Use when
   *  the table isn't inside a fixed-height page region. */
  autoHeight?: boolean;
  /** Rows live on the server: see `ServerTable`. */
  server?: ServerTable;
}

/** Half-controlled TanStack Table: internal sorting/filter/visibility/order
 *  state, with the data itself owned by the caller. Includes a global filter
 *  input, column visibility dropdown, and CSV export. */
export function ManagedDataTable<T extends { id: string }>({
  data,
  columns,
  initialVisibility = {},
  globalFilterFn,
  exportName = "export",
  layoutKey,
  defaultSorting = [],
  rememberedFilterFields,
  emptyMessage = "No matching rows.",
  savedViews,
  totalRows,
  exportColumns,
  initialSearch = "",
  initialSorting = [],
  initialConditions = [],
  onStateChange,
  primaryAction,
  filterableColumns,
  onCellEdit,
  enableSelection,
  onDeleteSelected,
  scrollRestoreKey,
  renderMobileCard,
  onRowOpen,
  peek,
  hideToolbar,
  bare,
  autoHeight,
  server,
}: ManagedDataTableProps<T>) {
  const isMobile = useIsMobile();
  const cardMode = Boolean(renderMobileCard && isMobile);

  // Restore once rows exist (the container has no height to scroll before).
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRestoredRef = useRef(false);
  useEffect(() => {
    if (!scrollRestoreKey || scrollRestoredRef.current || data.length === 0) return;
    scrollRestoredRef.current = true;
    const top = readScroll(scrollRestoreKey);
    if (top && scrollRef.current) scrollRef.current.scrollTop = top;
  }, [scrollRestoreKey, data.length]);
  const scrollPendingRef = useRef(false);
  const handleScroll = scrollRestoreKey
    ? () => {
        if (scrollPendingRef.current) return;
        scrollPendingRef.current = true;
        requestAnimationFrame(() => {
          scrollPendingRef.current = false;
          if (scrollRef.current) writeScroll(scrollRestoreKey, scrollRef.current.scrollTop);
        });
      }
    : undefined;
  const [editMode, setEditMode] = useState(false);
  // Row density, wrap and freeze: the person's one setting for every table
  // (Profile → Display; the toolbar gear edits the same value).
  const [view, setView] = useTableDisplayPrefs();
  const rowPy = rowPaddingFor(view.density);
  const rowH = rowHeightFor(view.density);
  // Phone: the search is a button in the toolbar row; it opens in place of the other buttons.
  const [searchOpen, setSearchOpen] = useState(false);
  const {
    editingCell,
    editValue,
    setEditValue,
    editOriginal,
    editInputRef,
    pickedRef,
    savingCell,
    editDirty,
    startEdit,
    cancelEdit,
    commitEdit,
    closeEditor,
  } = useCellEditing<T>(onCellEdit);
  // The sort and filters start as the page gave them (its address), else as the person left them last
  // time, else as the table's default; ones for a column that no longer exists are dropped.
  const layoutId = layoutKey ?? exportName;
  const [leftBefore] = useState(() => loadTableState(layoutId));
  const knownColumn = (id: string) => columns.some((c) => (c.id ?? (c as { accessorKey?: string }).accessorKey) === id);
  const [sorting, setSorting] = useState<SortingState>(() =>
    initialSorting.length > 0
      ? initialSorting
      : leftBefore.sorting.filter((s) => knownColumn(s.id)).length > 0
        ? leftBefore.sorting.filter((s) => knownColumn(s.id))
        : defaultSorting,
  );
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState(initialSearch);
  const [conditions, setConditions] = useState<FilterCondition[]>(() =>
    initialConditions.length > 0
      ? initialConditions
      : (leftBefore.conditions as FilterCondition[]).filter(
          (c) =>
            (filterableColumns ?? []).some((f) => f.id === c.field) &&
            (rememberedFilterFields === undefined || rememberedFilterFields.includes(c.field)),
        ),
  );
  // The columns the person chose and ordered last time come back (per table, in this browser).
  const [remembered] = useState(() => loadColumnLayout(layoutId));
  const [visibility, setVisibility] = useState<VisibilityState>(() => ({
    ...initialVisibility,
    ...remembered.visibility,
  }));
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(remembered.order);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Selection is keyed by the row's real id (`getRowId` below) — once the
  // underlying data changes (e.g. a bulk delete completes and refetches),
  // stale selection would point at rows that may no longer exist or mean
  // something different, so drop it rather than carry it forward silently.
  useEffect(() => {
    setRowSelection({});
  }, [data]);

  const tableColumns = useMemo(() => {
    if (!enableSelection) return columns;
    const selectColumn: ColumnDef<T, unknown> = {
      id: "__select",
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all rows"
          checked={
            table.getIsAllRowsSelected()
              ? true
              : table.getIsSomeRowsSelected()
                ? "indeterminate"
                : false
          }
          onCheckedChange={(value) => table.toggleAllRowsSelected(value === true)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Select row"
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(value === true)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { width: "shrink" } satisfies EditableColumnMeta,
    };
    return [selectColumn, ...columns];
  }, [enableSelection, columns]);

  // Multi-condition filters run BEFORE the table sees the data — everything
  // downstream (global search, sort, CSV export via getSortedRowModel) then
  // automatically respects them, same as if the rows never existed.
  const conditionFiltered = useMemo(
    () =>
      server || !filterableColumns || conditions.length === 0
        ? data
        : data.filter((row) => matchesAllConditions(row, conditions, filterableColumns)),
    [data, conditions, filterableColumns, server],
  );

  const table = useReactTable({
    data: conditionFiltered,
    columns: tableColumns,
    getRowId: (row) => row.id,
    // on the server, the rows arrive already searched, filtered and sorted
    manualSorting: Boolean(server),
    manualFiltering: Boolean(server),
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnVisibility: visibility,
      columnOrder,
      rowSelection,
    },
    enableRowSelection: enableSelection ?? false,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setVisibility,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn:
      globalFilterFn ??
      // match only the columns the user can SEE. The default used to
      // be `Object.values(row.original)`, which searched every field of the
      // record — including `id`, `created_at`, `updated_at` and `notes`,
      // none of which are columns. Typing "2026" therefore matched every row
      // via a hidden timestamp, and there was no way to tell why.
      ((row, _columnId, value) => {
        // The needle goes through the same normalisation as the haystack, so
        // a pasted accented or curly-quoted term still matches.
        const needle = searchableText(value);
        if (!needle) return true;
        return row
          .getVisibleCells()
          .some((cell) => searchableText(cell.getValue()).includes(needle));
      }),
  });

  // report search/sort/conditions outward so the page can put them in the URL.
  const publishedRef = useRef<string>("");
  useEffect(() => {
    if (!onStateChange) return;
    const key = `${globalFilter}|${sorting.map((s) => `${s.id}:${s.desc}`).join(",")}|${conditions
      .map((c) => `${c.field}:${c.operator}:${c.value}`)
      .join(",")}`;
    if (publishedRef.current === key) return;
    publishedRef.current = key;
    onStateChange({
      search: globalFilter,
      sorting: sorting.map((s) => ({ id: s.id, desc: s.desc })),
      conditions,
    });
    // `key` is the real dependency; the arrays are rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalFilter, sorting, conditions]);

  // Keep column order in sync with the (possibly dynamic) column list.
  useEffect(() => {
    const ids = table.getAllLeafColumns().map((c) => c.id);
    setColumnOrder((was) => reconcileOrder(was, ids));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  const visibleColumns = useMemo(
    () => table.getAllLeafColumns().filter((c) => c.getCanHide()),
    // `table` itself is a stable reference across renders in TanStack Table —
    // without columnOrder/visibility as explicit deps, this list goes stale
    // after a drag reorder or a visibility toggle even though the table's
    // own rendered columns update correctly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, columnOrder, visibility],
  );

  function handleColumnDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setColumnOrder((prev) => {
      const order = prev.length > 0 ? prev : table.getAllLeafColumns().map((c) => c.id);
      const oldIndex = order.indexOf(String(active.id));
      const newIndex = order.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(order, oldIndex, newIndex);
    });
  }

  const {
    columnWidths,
    hasSavedWidths,
    widthFor,
    canResize,
    cellStyle,
    setColumnWidth,
    setLiveWidth,
    clearWidths,
    frozenProps,
  } = useColumnLayout({
    table,
    exportName: layoutId,
    hideToolbar,
    freezeFirstColumn: view.freezeFirstColumn,
  });

  // "Reset columns": this table's default column order, visibility and
  // widths. The display options are shared by every table, so they're left
  // alone; search, filters and sorting have their own clear.
  // Definition order. (`getAllLeafColumns` follows the current `columnOrder`, so it cannot be the default;
  // `getAllColumns` keeps the order the table's columns were defined in.)
  const defaultOrder = table.getAllColumns().flatMap((c) => c.getLeafColumns()).map((c) => c.id);
  const hiddenIds = (v: VisibilityState) =>
    Object.keys(v)
      .filter((id) => v[id] === false)
      .sort()
      .join(",");
  const canResetColumns =
    hasSavedWidths ||
    (columnOrder.length > 0 && columnOrder.join(",") !== defaultOrder.join(",")) ||
    hiddenIds(visibility) !== hiddenIds(initialVisibility);
  function resetColumns() {
    setColumnOrder(defaultOrder);
    setVisibility(initialVisibility);
    clearWidths();
  }

  // Remember the sort and filters, so the table comes back as it was left (the search is for now).
  useEffect(() => {
    saveTableState(layoutId, {
      sorting: JSON.stringify(sorting) === JSON.stringify(defaultSorting) ? [] : sorting.map((s) => ({ id: s.id, desc: s.desc })),
      conditions: conditions.filter(
        (c) =>
          c.value.trim() !== "" && (rememberedFilterFields === undefined || rememberedFilterFields.includes(c.field)),
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorting, conditions, layoutId]);

  // Remember the column choice and order: only what differs from this table's defaults, so a table
  // with its defaults again forgets it, and a default changed later reaches columns never touched.
  useEffect(() => {
    if (columnOrder.length === 0) return;
    const changed: Record<string, boolean> = {};
    for (const id of new Set([...Object.keys(initialVisibility), ...Object.keys(visibility)])) {
      const now = visibility[id] !== false;
      if (now !== (initialVisibility[id] !== false)) changed[id] = now;
    }
    saveColumnLayout(layoutId, {
      visibility: changed,
      order: columnOrder.join(",") === defaultOrder.join(",") ? [] : columnOrder,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibility, columnOrder, layoutId]);

  // Saved views: let the page snapshot the current table state.
  useEffect(() => {
    if (!savedViews) return;
    savedViews.registerCapture((): TableViewState => ({
      search: globalFilter,
      sorting: sorting.map((s) => ({ id: s.id, desc: s.desc })),
      visibility: { ...visibility },
      order: [...columnOrder],
      conditions: [...conditions],
    }));
    // re-register whenever state changes so the capture is current
  });

  // Apply a saved view when the page tells us to.
  const [appliedView, setAppliedView] = useState<string | null>(null);
  useEffect(() => {
    if (!savedViews || !appliedView) return;
    const view = savedViews.views.find((v) => v.id === appliedView);
    if (!view) return;
    setGlobalFilter(view.state.search);
    setSorting(view.state.sorting.map((s) => ({ id: s.id, desc: s.desc })));
    setVisibility(view.state.visibility);
    setColumnOrder(view.state.order);
    setConditions(view.state.conditions ?? []);
    setAppliedView(null);
  }, [appliedView, savedViews]);

  const { bulkColumns, bulkProgress, bulkBusy, applyBulkEdit } = useBulkEdit({
    table,
    data,
    rowSelection,
    onCellEdit,
  });

  // Command palette: "Export … as CSV" while this table is on screen. The
  // export reads live table state, so it's called through a ref.
  const exportRef = useRef<() => void>(() => {});
  exportRef.current = exportCsv;
  useEffect(() => {
    if (hideToolbar) return;
    const id = `cmd-export-${exportName}`;
    registerSearchItem({
      id,
      label: `Export ${exportName} as CSV`,
      group: "Commands",
      keywords: ["export", "download", "csv", "table", "spreadsheet"],
      icon: <Download className="size-4" />,
      action: () => exportRef.current(),
    });
    return () => unregisterSearchItem(id);
  }, [exportName, hideToolbar]);

  function exportCsv() {
    if (server) {
      // the server writes every matching row; the browser downloads it with the person's session
      const link = document.createElement("a");
      link.href = server.exportHref({
        search: globalFilter,
        sorting: sorting.map((s) => ({ id: s.id, desc: s.desc })),
        conditions,
      });
      link.download = "";
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }
    downloadTableCsv(table, exportName, exportColumns);
  }

  // Keyboard row navigation (roving tabindex): one row is in the tab order;
  // ↑/↓/Home/End move focus, Enter opens, Space toggles selection.
  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  const [activeRow, setActiveRow] = useState(0);
  const rowCount = table.getRowModel().rows.length;
  const focusRow = (index: number) => {
    const next = Math.max(0, Math.min(rowCount - 1, index));
    setActiveRow(next);
    const el = rowRefs.current[next];
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
    // With the side panel open, it follows the focused row.
    if (peekId !== null) setPeekId(table.getRowModel().rows[next]?.id ?? null);
  };
  const rowKeyDown = (e: KeyboardEvent<HTMLElement>, index: number, row: Row<T>) => {
    // Only when the row itself has focus — not a link, input or button in it.
    if (e.target !== e.currentTarget) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusRow(index + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (index === 0 && !hideToolbar) {
          document.querySelector<HTMLInputElement>("[data-table-search]")?.focus();
        } else focusRow(index - 1);
        break;
      case "Home":
        e.preventDefault();
        focusRow(0);
        break;
      case "End":
        e.preventDefault();
        focusRow(rowCount - 1);
        break;
      case "Enter":
        if (peekEnabled && !e.shiftKey) {
          e.preventDefault();
          setPeekId(row.id);
        } else if (onRowOpen) {
          e.preventDefault();
          onRowOpen(row.original);
        }
        break;
      case " ":
        if (enableSelection) {
          e.preventDefault();
          row.toggleSelected();
        }
        break;
    }
  };
  // Side panel (desktop). Keyed by row id so it follows the record through
  // re-sorts; it closes if the record is filtered out or deleted.
  const peekEnabled = Boolean(peek) && !cardMode;
  const [peekId, setPeekId] = useState<string | null>(null);
  const visibleRows = table.getRowModel().rows;
  const peekIndex = peekId === null ? -1 : visibleRows.findIndex((r) => r.id === peekId);
  const peekRow = peekIndex === -1 ? null : visibleRows[peekIndex];
  useEffect(() => {
    if (peekId !== null && (peekIndex === -1 || !peekEnabled)) setPeekId(null);
  }, [peekId, peekIndex, peekEnabled]);
  const movePeek = (delta: number) => {
    const next = peekIndex + delta;
    if (peekIndex === -1 || next < 0 || next >= visibleRows.length) return;
    setPeekId(visibleRows[next].id);
    setActiveRow(next);
    rowRefs.current[next]?.scrollIntoView({ block: "nearest" });
  };
  /** A click anywhere on a row opens it (in the side panel if the table
   *  has one, else its page), except on its own controls or when the user
   *  is selecting text. */
  const rowOpensOnClick = !editMode && (peekEnabled || Boolean(onRowOpen));
  const rowClick = (e: MouseEvent<HTMLElement>, index: number, row: Row<T>) => {
    if (!rowOpensOnClick) return;
    if ((e.target as Element).closest("a, button, input, textarea, select, label, [role=checkbox]")) return;
    if (window.getSelection()?.toString()) return;
    setActiveRow(index);
    if (peekEnabled) setPeekId(row.id);
    else onRowOpen?.(row.original);
  };

  const rowFocusProps = (index: number, row: Row<T>) => ({
    ref: (el: HTMLElement | null) => {
      rowRefs.current[index] = el;
    },
    tabIndex: index === Math.min(activeRow, rowCount - 1) ? 0 : -1,
    "data-row": "",
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (e.target === e.currentTarget) setActiveRow(index);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => rowKeyDown(e, index, row),
  });

  // "there is no data" and "your filter matched nothing" were the
  // same message, so a user who had forgotten a filter was told the table
  // was empty. The second case now says so, and offers the way out.
  const emptyNode = data.length > 0 || (server && (globalFilter || conditions.length > 0)) ? (
    <EmptyState
      icon={<SearchX className="size-8" />}
      title="No matching rows"
      description={
        globalFilter
          ? `Nothing matches "${globalFilter}".`
          : "No rows match the current filter."
      }
      action={
        <button
          className="text-xs font-semibold text-primary hover:underline"
          onClick={() => {
            setGlobalFilter("");
            setColumnFilters([]);
            setConditions([]);
          }}
        >
          {server ? "Clear the filter to see every row" : `Clear the filter to see all ${data.length} rows`}
        </button>
      }
    />
  ) : (
    <EmptyState icon={<Inbox className="size-8" />} title={emptyMessage} />
  );

  const { selecting, cardPressProps } = useCardSelection<T>({ enableSelection, rowSelection });

  // Bulk actions for the selected rows: in the toolbar on desktop, and in a
  // floating bar above the tab bar in card mode (within thumb reach).
  const selectedCount = selectedCountOf(rowSelection);
  const selectionControls = (
    <SelectionControls
      selectedCount={selectedCount}
      bulkProgress={bulkProgress}
      bulkColumns={bulkColumns}
      bulkBusy={bulkBusy}
      onApplyBulk={(columnId, label, value) => void applyBulkEdit(columnId, label, value)}
      onDelete={onDeleteSelected && (() => onDeleteSelected(Object.keys(rowSelection)))}
      onClear={() => setRowSelection({})}
      compact={cardMode}
    />
  );

  return (
    <div className={cn("flex flex-col gap-3", !autoHeight && "h-full min-h-0")}>
      {/* Tells screen-reader users what a search or filter left, as sighted users see it change. */}
      <p role="status" className="sr-only">
        {`${rowCount} ${rowCount === 1 ? "row" : "rows"}`}
      </p>
      {/* Page-cap honesty banner (audit F7): when the server reports more
          rows than were loaded, say so instead of silently truncating. */}
      {totalRows != null && totalRows > data.length && (
        <PageMessage tone="warning" dismissKey={`${exportName}-page-cap`}>
          Showing {data.length} of {totalRows} rows — search, sorting and CSV
          export cover only the loaded rows.
        </PageMessage>
      )}
      {!hideToolbar && (
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {cardMode && !searchOpen ? (
        <IconButton
          label={globalFilter ? "Search (filter applied)" : "Search"}
          variant="secondary"
          onClick={() => setSearchOpen(true)}
          className={cn("relative", TOOLBAR_BTN)}
        >
          <Search />
          {globalFilter && <span aria-hidden className="absolute right-1 top-1 size-2 rounded-full bg-primary" />}
        </IconButton>
        ) : (
        <TableSearchBox
          onClose={cardMode ? () => setSearchOpen(false) : undefined}
          value={globalFilter}
          onChange={setGlobalFilter}
          canArrowDown={rowCount > 0}
          onArrowDown={() => focusRow(0)}
          canClear={
            Boolean(globalFilter) ||
            columnFilters.length > 0 ||
            sorting.length > 0 ||
            conditions.length > 0
          }
          onClear={() => {
            // "Clear filter" used to clear only the text box,
            // leaving column filters and sorting silently applied.
            setGlobalFilter("");
            setColumnFilters([]);
            setSorting([]);
            setConditions([]);
          }}
        />
        )}
        {!(cardMode && searchOpen) && (
          <>
        {/* Two groups, so seven icons read as "how I look at the rows" and "what I do with them". */}
        <div role="group" aria-label="View" className="flex items-center gap-1">
        {filterableColumns && filterableColumns.length > 0 && (
          <TableFilterSort
            triggerClassName={TOOLBAR_BTN}
            filterableColumns={filterableColumns}
            conditions={conditions}
            onConditionsChange={setConditions}
            sortableColumns={table
              .getAllLeafColumns()
              .filter((c) => c.getCanSort())
              .map((c) => ({
                id: c.id,
                label: String(c.columnDef.header ?? c.id),
              }))}
            sorting={sorting}
            onSortingChange={setSorting}
          />
        )}
        {!cardMode && (
          <ColumnsMenu
            columns={visibleColumns}
            onDragEnd={handleColumnDragEnd}
            triggerClassName={TOOLBAR_BTN}
          />
        )}
        {!cardMode && (
          <ViewOptionsMenu
            prefs={view}
            onPrefsChange={setView}
            canReset={canResetColumns}
            onReset={resetColumns}
            triggerClassName={TOOLBAR_BTN}
          />
        )}
        </div>
        <div role="group" aria-label="Actions" className="flex items-center gap-1">
        {onCellEdit && !cardMode && (
          <IconButton
            label={editMode ? "Exit edit mode" : "Edit mode"}
            variant="secondary"
            aria-pressed={editMode}
            onClick={() => {
              setEditMode((m) => !m);
              // Leaving edit mode with a cell open would strand an input the
              // user can no longer click into to commit or cancel.
              closeEditor();
            }}
            className={cn(TOOLBAR_BTN, editMode && TOOLBAR_BTN_ON)}
          >
            {editMode ? <PencilOff /> : <Pencil />}
          </IconButton>
        )}
        <IconButton label="Export as CSV" variant="secondary" onClick={exportCsv} className={TOOLBAR_BTN}>
          <Download />
        </IconButton>
        {savedViews && (
          <SavedViewsMenu
            savedViews={savedViews}
            onApply={setAppliedView}
            triggerClassName={TOOLBAR_BTN}
          />
        )}
        </div>
        {primaryAction && (
          <IconButton
            label={primaryAction.label}
            hint="N"
            variant="default"
            onClick={primaryAction.onClick}
            className={TOOLBAR_BTN}
            // The global `n` shortcut presses this (see useGlobalShortcuts).
            data-primary-action=""
          >
            {primaryAction.icon ?? <Plus />}
          </IconButton>
        )}
        {enableSelection && selectedCount > 0 && !cardMode ? (
          <div className="ml-auto flex items-center gap-1">{selectionControls}</div>
        ) : (
          <span
            title={
              server
                ? `${server.total.toLocaleString("en-GB")} matching rows`
                : `${table.getFilteredRowModel().rows.length} of ${data.length} rows`
            }
            className="ml-auto text-xs text-tertiary tnum"
          >
            {server
              ? `${server.total.toLocaleString("en-GB")} ${server.total === 1 ? "row" : "rows"}`
              : globalFilter || conditions.length > 0
                ? `${table.getFilteredRowModel().rows.length} / ${data.length}`
                : `${data.length} rows`}
          </span>
        )}
          </>
        )}
      </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ "--row-py": rowPy, "--row-h": rowH } as CSSProperties}
        className={cn(
          autoHeight ? "overflow-x-auto" : "flex-initial min-h-0 overflow-auto",
          !cardMode && !bare && "rounded-lg border border-border bg-card shadow-sm",
          server?.loading && "opacity-60 transition-opacity",
        )}
      >
        {cardMode ? (
          table.getRowModel().rows.length === 0 ? (
            <div className="rounded-lg border border-border bg-card px-3 py-2">{emptyNode}</div>
          ) : (
            <ul className={cn("flex flex-col gap-2", selecting && "pb-20")}>
              {table.getRowModel().rows.map((row, index) => (
                <li
                  key={row.id}
                  {...rowFocusProps(index, row)}
                  {...cardPressProps(row)}
                  // A list item cannot carry aria-selected (axe: aria-allowed-attr), so the state is
                  // said in words below and kept as data for styling and tests.
                  data-selected={enableSelection ? String(row.getIsSelected()) : undefined}
                  className={cn(
                    "relative rounded-lg outline-none select-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-ring",
                    // While selecting, cards shift over to show a check column.
                    selecting && "pl-9",
                    // Border and tint rather than a ring, which the scroll area would clip.
                    row.getIsSelected() && "[&>:not([data-check])]:border-primary! [&>:not([data-check])]:bg-sidebar-accent!",
                  )}
                >
                  {renderMobileCard!(row.original)}
                  {enableSelection && row.getIsSelected() && <span className="sr-only">Selected</span>}
                  {selecting && (
                    <span
                      aria-hidden
                      data-check=""
                      className={cn(
                        "pointer-events-none absolute top-1/2 left-1 grid size-6 -translate-y-1/2 place-items-center rounded-full border-2",
                        row.getIsSelected()
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/50 bg-card",
                      )}
                    >
                      {row.getIsSelected() && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : (
          <table className="w-full text-dense tnum">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr
                  key={headerGroup.id}
                  className="sticky top-0 z-10 bg-muted shadow-[inset_0_-1px_0_var(--border)]"
                >
                  {headerGroup.headers.map((header) => {
                    const col = header.column;
                    const meta = col.columnDef.meta as EditableColumnMeta | undefined;
                    const frozen = frozenProps(col.id, cellStyle(col.id, meta));
                    const resizable = canResize(col.id, meta);
                    const width = widthFor(col.id);
                    const label = String(col.columnDef.header || col.id);
                    return (
                      <th
                        key={header.id}
                        style={frozen.style}
                        className={cn(
                          "h-8 whitespace-nowrap px-3 text-left text-xs font-medium text-muted-foreground",
                          meta?.align === "right" && "text-right",
                          frozen.className && cn(frozen.className, "bg-muted"),
                          resizable && !frozen.className && "relative",
                        )}
                      >
                        <div
                          className={cn(
                            width !== undefined && "overflow-hidden",
                            width !== undefined && meta?.align === "right" && "ml-auto",
                          )}
                          style={width !== undefined ? { width } : undefined}
                        >
                        {!col.columnDef.header && <span className="sr-only">{label}</span>}
                        <div className={cn("flex items-center gap-1", meta?.align === "right" && "justify-end")}>
                        {col.getCanSort() ? (
                          <button
                            onClick={col.getToggleSortingHandler()}
                            className={`tap-area flex items-center gap-1 hover:text-primary ${
                              col.getIsSorted() ? "text-primary" : ""
                            }`}
                          >
                            {flexRender(
                              header.column.columnDef.header ?? col.id,
                              header.getContext(),
                            )}
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3 w-3"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              {col.getIsSorted() === "asc" ? (
                                <path d="M12 19V5M5 12l7-7 7 7" />
                              ) : col.getIsSorted() === "desc" ? (
                                <path d="M12 5v14M19 12l-7 7-7-7" />
                              ) : (
                                <path d="M8 9l4-4 4 4M8 15l4 4 4-4" opacity={0.4} />
                              )}
                            </svg>
                          </button>
                        ) : (
                          flexRender(
                            header.column.columnDef.header ?? col.id,
                            header.getContext(),
                          )
                        )}
                        {filterableColumns?.find((f) => f.id === col.id) && (
                          <ColumnFilterMenu
                            column={filterableColumns.find((f) => f.id === col.id)!}
                            conditions={conditions}
                            onConditionsChange={setConditions}
                          />
                        )}
                        </div>
                        </div>
                        {resizable && (
                          <ColumnResizeHandle
                            label={label}
                            width={columnWidths[col.id]}
                            onPreview={(px) => setLiveWidth({ id: col.id, px })}
                            onCommit={(px) => setColumnWidth(col.id, px)}
                            onReset={() => setColumnWidth(col.id, undefined)}
                          />
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={table.getVisibleLeafColumns().length}
                    className="px-3 py-2"
                  >
                    {emptyNode}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row, index) => (
                  <tr
                    key={row.id}
                    {...rowFocusProps(index, row)}
                    aria-selected={enableSelection ? row.getIsSelected() : undefined}
                    data-peeked={row.id === peekId ? "" : undefined}
                    onClick={(e) => rowClick(e, index, row)}
                    className={cn(
                      "group border-b border-border outline-none transition-colors last:border-b-0 hover:bg-muted/50 focus-visible:bg-muted focus-visible:shadow-[inset_3px_0_0_var(--ring)] aria-selected:bg-sidebar-accent/60 data-peeked:bg-muted",
                      rowOpensOnClick && "cursor-pointer",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as EditableColumnMeta | undefined;
                      const isEditable = Boolean(editMode && meta?.editable && onCellEdit);
                      const isEditing =
                        editingCell?.rowId === row.id && editingCell.columnId === cell.column.id;
                      const cellKey = `${row.id}:${cell.column.id}`;
                      const isSaving = savingCell === cellKey;
                      const frozen = frozenProps(cell.column.id, cellStyle(cell.column.id, meta));
                      const frozenClass = frozen.className && cn(frozen.className, FROZEN_CELL_BG);

                      if (isEditable && isEditing) {
                        const commit = () => commitEdit(row.original);
                        const onKeyDown = (e: KeyboardEvent) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commit();
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            e.stopPropagation();
                            cancelEdit();
                          }
                        };
                        return (
                          <td
                            key={cell.id}
                            style={frozen.style}
                            className={cn("px-3 py-1 text-dense", frozenClass)}
                          >
                            <EditingCell
                              meta={meta}
                              columnId={cell.column.id}
                              value={editValue}
                              dirty={editDirty}
                              saving={isSaving}
                              inputRef={editInputRef}
                              onChange={setEditValue}
                              onKeyDown={onKeyDown}
                              onBlurUnchanged={() => {
                                if (editValue === editOriginal) cancelEdit();
                              }}
                              onPick={(value) => {
                                pickedRef.current = true;
                                setEditValue(value);
                                void commitEdit(row.original, value);
                              }}
                              onClosePicker={() => {
                                if (!pickedRef.current) cancelEdit();
                              }}
                              onCommit={commit}
                              onCancel={cancelEdit}
                            />
                          </td>
                        );
                      }

                      return (
                        <td
                          key={cell.id}
                          onClick={
                            isEditable
                              ? () => startEdit(row.id, cell.column.id, String(cell.getValue() ?? ""))
                              : undefined
                          }
                          title={isEditable ? "Click to edit" : undefined}
                          style={frozen.style}
                          className={cn(
                            "h-(--row-h) px-3 py-[var(--row-py)] text-dense text-foreground",
                            !meta?.wrap && "whitespace-nowrap",
                            meta?.align === "right" && "text-right",
                            isEditable && "cursor-text rounded hover:ring-1 hover:ring-inset hover:ring-primary/40",
                            isSaving && "opacity-50",
                            frozenClass,
                          )}
                        >
                          {widthFor(cell.column.id) !== undefined ? (
                            // A dragged width: a fixed box, since table cells
                            // ignore max-width. Truncates, or wraps with
                            // "Wrap text" on.
                            <div
                              className={cn(
                                view.wrap ? "whitespace-normal break-words" : "truncate",
                                meta?.align === "right" && "ml-auto",
                              )}
                              style={{ width: widthFor(cell.column.id) }}
                              title={
                                !view.wrap && typeof cell.getValue() === "string"
                                  ? (cell.getValue() as string)
                                  : undefined
                              }
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </div>
                          ) : view.wrap && meta?.width !== "shrink" ? (
                            // Sized to the content up to a cap, so short values
                            // keep their width and only long ones wrap. A box
                            // ignores text-align, so a right-aligned one is
                            // pushed over by its margin.
                            <div
                              className={cn(
                                "w-max whitespace-normal break-words",
                                meta?.align === "right" && "ml-auto",
                              )}
                              style={{ maxWidth: meta?.maxWidth ?? WRAP_MAX_WIDTH }}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </div>
                          ) : meta?.maxWidth ? (
                            // Table cells ignore max-width, so cap an inner box.
                            <div
                              className="truncate"
                              style={{ maxWidth: meta.maxWidth }}
                              title={typeof cell.getValue() === "string" ? (cell.getValue() as string) : undefined}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </div>
                          ) : (
                            flexRender(cell.column.columnDef.cell, cell.getContext())
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {cardMode && selecting && (
        <div
          role="toolbar"
          aria-label="Selected rows"
          className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-1 rounded-xl border border-border bg-popover py-2 pr-2 pl-4 shadow-lg"
        >
          {selectionControls}
        </div>
      )}

      {peek && (
        <PeekPanel
          peek={peek}
          peekRow={peekRow}
          peekIndex={peekIndex}
          rowTotal={visibleRows.length}
          scrollRef={scrollRef}
          onClose={() => setPeekId(null)}
          onMove={movePeek}
          onOpenFullPage={onRowOpen}
          onRestoreFocus={() => rowRefs.current[activeRow]?.focus()}
        />
      )}

      {server && Math.ceil(server.total / server.size) > 1 && (
        <nav aria-label="Pages" className="flex shrink-0 items-center justify-end gap-2 text-xs text-muted-foreground">
          <IconButton
            label="Previous page"
            variant="ghost"
            disabled={server.page <= 1}
            onClick={() => server.onPageChange(server.page - 1)}
          >
            <ChevronLeft />
          </IconButton>
          <span className="tnum">
            Page {server.page} of {Math.ceil(server.total / server.size)}
          </span>
          <IconButton
            label="Next page"
            variant="ghost"
            disabled={server.page >= Math.ceil(server.total / server.size)}
            onClick={() => server.onPageChange(server.page + 1)}
          >
            <ChevronRight />
          </IconButton>
        </nav>
      )}
    </div>
  );
}


export const dataTableClasses = {
  cell: cn("px-3 py-2"),
};
