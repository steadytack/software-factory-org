import type { Table } from "@tanstack/react-table";

import { formatForExport } from "../../../lib/format";
import { BOM, csvCell } from "./csv";

/** Export values for render-only columns, keyed by column id (see the
 *  `exportColumns` prop of ManagedDataTable). */
export type ExportColumns<T> = Record<string, (row: T) => unknown | Record<string, unknown>>;

/** Download the table as it is on screen — visible columns, current sort and
 *  filters — as a CSV file named `<exportName>.csv`. */
export function downloadTableCsv<T>(
  table: Table<T>,
  exportName: string,
  exportColumns?: ExportColumns<T>,
): void {
  const exportValueFor = (id: string) => exportColumns?.[id];
  // DSP-4(a): skip columns that carry no data of their own — a render-only
  // column with no accessor and no `exportColumns` entry exported an empty
  // column under an empty header (the `actions` button column did exactly
  // that).
  const cols = table
    .getVisibleLeafColumns()
    .filter((c) => c.accessorFn != null || exportValueFor(c.id) != null);
  // DSP-4(b): the SORTED model. This read `getFilteredRowModel()`, which is
  // pre-sort, so the file ignored the sort the user had just applied.
  const sortedRows = table.getSortedRowModel().rows;

  /** One column's cells: `[header, ...values]`. A render-only column may
   *  expand into several (DSP-4(a) — `coordinates` becomes latitude +
   *  longitude). */
  function columnsFor(column: (typeof cols)[number]): { header: string; values: string[] }[] {
    const accessor = exportValueFor(column.id);
    const fallbackHeader = String(column.columnDef.header ?? column.id);
    if (!accessor) {
      return [
        {
          header: fallbackHeader,
          // DSP-4(c): null and "" both exported blank, discarding the
          // on-screen "—" convention, so "no value" and "empty value" were
          // indistinguishable in the file.
          values: sortedRows.map((row) => formatForExport(row.getValue(column.id))),
        },
      ];
    }
    const first = sortedRows.length ? accessor(sortedRows[0].original) : undefined;
    if (first !== null && typeof first === "object" && !(first instanceof Date)) {
      const headers = Object.keys(first as Record<string, unknown>);
      return headers.map((key) => ({
        header: key,
        values: sortedRows.map((row) =>
          formatForExport((accessor(row.original) as Record<string, unknown>)[key]),
        ),
      }));
    }
    return [
      {
        header: fallbackHeader,
        values: sortedRows.map((row) => formatForExport(accessor(row.original))),
      },
    ];
  }

  const expanded = cols.flatMap(columnsFor);
  // Human-readable headers (column ids are internal identifiers).
  const header = expanded.map((c) => csvCell(c.header)).join(",");
  const rows = sortedRows.map((_row, index) =>
    expanded.map((c) => csvCell(c.values[index])).join(","),
  );
  // DSP-4(d): a UTF-8 BOM and CRLF line endings. Without the BOM Excel
  // reads the file as the local codepage, so accented and emoji names —
  // which the API stores and returns correctly — mis-render.
  const blob = new Blob([BOM + [header, ...rows].join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${exportName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
