import { useState } from "react";
import type { Column, RowSelectionState, Table } from "@tanstack/react-table";
import { toast } from "sonner";

import { vocabularyLabel } from "../../../lib/vocabularies";
import type { EditableColumnMeta } from "./columnMeta";

/** Bulk edit: rows saved at once. */
const BULK_CONCURRENCY = 4;

/** Bulk edit: any editable select column can be set on every selected row
 *  through the page's own `onCellEdit` (so validation and the API call live
 *  in one place). Each save waits for its list refetch, so a few run at
 *  once; overlapping invalidations collapse into one refetch. */
export function useBulkEdit<T extends { id: string }>({
  table,
  data,
  rowSelection,
  onCellEdit,
}: {
  table: Table<T>;
  data: T[];
  rowSelection: RowSelectionState;
  onCellEdit?: (row: T, columnId: string, value: string) => Promise<void>;
}) {
  const bulkColumns: Column<T, unknown>[] = onCellEdit
    ? table.getAllLeafColumns().filter((c) => {
        const meta = c.columnDef.meta as EditableColumnMeta | undefined;
        return meta?.editable && meta.type === "select" && (meta.options?.length ?? 0) > 0;
      })
    : [];
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const bulkBusy = bulkProgress !== null;
  async function applyBulkEdit(columnId: string, label: string, value: string) {
    if (!onCellEdit) return;
    const ids = new Set(Object.keys(rowSelection));
    const targets = data.filter((row) => ids.has(row.id));
    let succeeded = 0;
    let settled = 0;
    let next = 0;
    setBulkProgress({ done: 0, total: targets.length });
    const worker = async () => {
      while (next < targets.length) {
        const row = targets[next++];
        try {
          await onCellEdit(row, columnId, value);
          succeeded += 1;
        } catch {
          // surfaced by the global mutation-error toast
        }
        settled += 1;
        setBulkProgress({ done: settled, total: targets.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, targets.length) }, worker));
    setBulkProgress(null);
    const what = `${label} to ${vocabularyLabel(value)}`;
    if (succeeded === targets.length) {
      toast.success(`Set ${what} on ${succeeded} row${succeeded === 1 ? "" : "s"}.`);
    } else {
      toast.error(`Set ${what} on ${succeeded} of ${targets.length} rows — some failed.`);
    }
  }
  return { bulkColumns, bulkProgress, bulkBusy, applyBulkEdit };
}
