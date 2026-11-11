/** Table display settings, stored in this browser.
 *
 *  - Row density, wrap text and freeze first column are one personal
 *    setting for every table: Profile → Display, or the table toolbar's
 *    gear for quick access (both write the same value, in the profile
 *    prefs — see lib/prefs.ts and hooks/useTableDisplayPrefs.ts).
 *  - Column widths are per table (`table-view:<exportName>`), since columns
 *    differ from table to table. Not part of a saved view. */

export type TableDensity = "condensed" | "compact" | "comfortable";

export interface TableDisplayPrefs {
  density: TableDensity;
  /** Let cells wrap onto several lines instead of staying on one. */
  wrap: boolean;
  /** Keep the first column (and the selection column) in view when
   *  scrolling sideways. */
  freezeFirstColumn: boolean;
}

export const DEFAULT_TABLE_DISPLAY: TableDisplayPrefs = {
  density: "condensed",
  wrap: false,
  freezeFirstColumn: false,
};

export const TABLE_DENSITY_OPTIONS: { value: TableDensity; label: string; hint: string }[] = [
  { value: "condensed", label: "Dense", hint: "Most rows on screen" },
  { value: "compact", label: "Standard", hint: "A little more space" },
  { value: "comfortable", label: "Roomy", hint: "Roomy rows, easier to tap" },
];

/** Row padding per density. Only rows change; toolbar controls keep the
 *  interface density's `--control-h`. */
const ROW_PY: Record<TableDensity, string> = {
  condensed: "0.125rem",
  compact: "0.25rem",
  comfortable: "0.625rem",
};

export function rowPaddingFor(density: TableDensity): string {
  return ROW_PY[density];
}

/** Minimum row height per density: 40 / 44 / 52 px, so the default is the 40px a dense table wants. */
const ROW_H: Record<TableDensity, string> = {
  condensed: "2.5rem",
  compact: "2.75rem",
  comfortable: "3.25rem",
};

export function rowHeightFor(density: TableDensity): string {
  return ROW_H[density];
}

const isDensity = (value: unknown): value is TableDensity =>
  TABLE_DENSITY_OPTIONS.some((o) => o.value === value);

/** A stored value, validated field by field (defaults for anything else). */
export function parseTableDisplay(raw: unknown): TableDisplayPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<TableDisplayPrefs>;
  return {
    density: isDensity(r.density) ? r.density : DEFAULT_TABLE_DISPLAY.density,
    wrap: r.wrap === true,
    freezeFirstColumn: r.freezeFirstColumn === true,
  };
}

/** Widths the viewer dragged columns to, in px of content (excluding cell
 *  padding), by column id. Columns not listed size to their content. */
export type ColumnWidths = Record<string, number>;

/** Narrowest a column can be dragged to. */
export const MIN_COLUMN_WIDTH = 48;

const keyFor = (table: string) => `table-view:${table}`;

export function loadColumnWidths(table: string): ColumnWidths {
  try {
    const parsed = JSON.parse(localStorage.getItem(keyFor(table)) ?? "{}") as {
      columnWidths?: unknown;
    };
    const raw = parsed.columnWidths;
    if (!raw || typeof raw !== "object") return {};
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).filter(
        (e): e is [string, number] =>
          typeof e[1] === "number" && Number.isFinite(e[1]) && e[1] >= MIN_COLUMN_WIDTH,
      ),
    );
  } catch {
    return {};
  }
}

export function saveColumnWidths(table: string, widths: ColumnWidths): void {
  try {
    // Also drops the per-table density/wrap/freeze stored here before they
    // became one profile setting.
    if (Object.keys(widths).length === 0) localStorage.removeItem(keyFor(table));
    else localStorage.setItem(keyFor(table), JSON.stringify({ columnWidths: widths }));
    // Density alone was stored here before wrap/freeze existed.
    localStorage.removeItem(`table-density:${table}`);
  } catch {
    // Storage unavailable (private mode): the change still applies this session.
  }
}

/** A table's columns as the person left them: which they turned on or off (only those that differ from
 *  the table's own defaults, so a default changed later still reaches the columns they never touched) and
 *  the order they dragged them to. Remembered per table in this browser. */
export interface ColumnLayout {
  visibility: Record<string, boolean>;
  order: string[];
}

const layoutKeyFor = (table: string) => `table-columns:${table}`;

export function loadColumnLayout(table: string): ColumnLayout {
  try {
    const parsed = JSON.parse(localStorage.getItem(layoutKeyFor(table)) ?? "{}") as Partial<ColumnLayout>;
    const visibility =
      parsed.visibility && typeof parsed.visibility === "object"
        ? Object.fromEntries(Object.entries(parsed.visibility).filter((e): e is [string, boolean] => typeof e[1] === "boolean"))
        : {};
    const order = Array.isArray(parsed.order) ? parsed.order.filter((id): id is string => typeof id === "string") : [];
    return { visibility, order };
  } catch {
    return { visibility: {}, order: [] };
  }
}

/** Saves the layout, or forgets it when it is the table's defaults again. */
export function saveColumnLayout(table: string, layout: ColumnLayout): void {
  try {
    if (Object.keys(layout.visibility).length === 0 && layout.order.length === 0) {
      localStorage.removeItem(layoutKeyFor(table));
    } else {
      localStorage.setItem(layoutKeyFor(table), JSON.stringify(layout));
    }
  } catch {
    // Storage unavailable (private mode): the change still applies this session.
  }
}

/** The order to use: the remembered one for the columns that still exist, then any new column in its
 *  own place at the end. */
export function reconcileOrder(remembered: string[], current: string[]): string[] {
  const kept = remembered.filter((id) => current.includes(id));
  return [...kept, ...current.filter((id) => !kept.includes(id))];
}

/** A table's sort and filters as the person left them (the search text is not kept: it is for now). */
export interface TableState {
  sorting: { id: string; desc: boolean }[];
  conditions: { id: string; field: string; operator: string; value: string }[];
}

const stateKeyFor = (table: string) => `table-state:${table}`;

export function loadTableState(table: string): TableState {
  const empty: TableState = { sorting: [], conditions: [] };
  try {
    const parsed = JSON.parse(localStorage.getItem(stateKeyFor(table)) ?? "{}") as Partial<TableState>;
    const sorting = Array.isArray(parsed.sorting)
      ? parsed.sorting.filter((s) => s && typeof s.id === "string" && typeof s.desc === "boolean")
      : [];
    const conditions = Array.isArray(parsed.conditions)
      ? parsed.conditions.filter(
          (c) =>
            c &&
            typeof c.id === "string" &&
            typeof c.field === "string" &&
            typeof c.operator === "string" &&
            typeof c.value === "string" &&
            c.value.trim() !== "",
        )
      : [];
    return { sorting, conditions };
  } catch {
    return empty;
  }
}

/** Saves the sort and filters, or forgets them when there are none. */
export function saveTableState(table: string, state: TableState): void {
  try {
    if (state.sorting.length === 0 && state.conditions.length === 0) localStorage.removeItem(stateKeyFor(table));
    else localStorage.setItem(stateKeyFor(table), JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode): the change still applies this session.
  }
}
