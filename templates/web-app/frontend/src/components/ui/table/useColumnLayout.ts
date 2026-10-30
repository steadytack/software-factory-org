import { useState } from "react";
import type { CSSProperties } from "react";
import type { Table } from "@tanstack/react-table";

import { cn } from "../../../lib/utils";
import { loadColumnWidths, saveColumnWidths, type ColumnWidths } from "../../../lib/tableViewPrefs";
import { columnStyle, type EditableColumnMeta } from "./columnMeta";

/** Frozen-first-column layout: the selection column is a fixed width so the
 *  frozen data column after it knows its left offset. */
const SELECT_COL_WIDTH = "2.5rem";

/** Column widths (dragged by the viewer, saved per table) and the frozen
 *  first column. */
export function useColumnLayout<T>({
  table,
  exportName,
  hideToolbar,
  freezeFirstColumn,
}: {
  table: Table<T>;
  exportName: string;
  hideToolbar?: boolean;
  freezeFirstColumn: boolean;
}) {
  // Column widths are per table, and need the toolbar's resize handles.
  const [savedWidths, setSavedWidths] = useState<ColumnWidths>(() => loadColumnWidths(exportName));
  const columnWidths = hideToolbar ? {} : savedWidths;

  // Column widths the viewer dragged to. During a drag the width lives in
  // `liveWidth` and is saved once on release.
  const [liveWidth, setLiveWidth] = useState<{ id: string; px: number } | null>(null);
  const widthFor = (columnId: string): number | undefined =>
    liveWidth?.id === columnId ? liveWidth.px : columnWidths[columnId];
  const canResize = (columnId: string, meta: EditableColumnMeta | undefined) =>
    !hideToolbar && columnId !== "__select" && meta?.width !== "shrink";
  /** A dragged width replaces the column's own minimum width, so it can be
   *  made narrower than its default. */
  const cellStyle = (columnId: string, meta: EditableColumnMeta | undefined) => {
    const style = columnStyle(meta);
    if (widthFor(columnId) === undefined || !style) return style;
    return { ...style, minWidth: undefined };
  };
  function setColumnWidth(columnId: string, px: number | undefined) {
    const next = { ...savedWidths };
    if (px === undefined) delete next[columnId];
    else next[columnId] = px;
    setSavedWidths(next);
    saveColumnWidths(exportName, next);
    setLiveWidth(null);
  }
  function clearWidths() {
    setSavedWidths({});
    saveColumnWidths(exportName, {});
  }

  // Frozen first column: the first visible data column sticks to the left
  // edge, along with the selection column before it.
  const frozenLeft = new Map<string, string>();
  if (freezeFirstColumn) {
    const leading = table.getVisibleLeafColumns();
    let offset = "0px";
    for (const col of leading) {
      frozenLeft.set(col.id, offset);
      if (col.id !== "__select") break;
      offset = SELECT_COL_WIDTH;
    }
  }
  const lastFrozenId = [...frozenLeft.keys()].pop();
  const frozenProps = (columnId: string, base: CSSProperties | undefined) => {
    const left = frozenLeft.get(columnId);
    if (left === undefined) return { style: base, className: undefined };
    const width =
      columnId === "__select"
        ? { width: SELECT_COL_WIDTH, minWidth: SELECT_COL_WIDTH, maxWidth: SELECT_COL_WIDTH }
        : undefined;
    return {
      style: { ...base, ...width, left },
      className: cn(
        "sticky z-[1]",
        columnId === lastFrozenId && "shadow-[inset_-1px_0_0_var(--border)]",
      ),
    };
  };

  return {
    columnWidths,
    hasSavedWidths: Object.keys(savedWidths).length > 0,
    widthFor,
    canResize,
    cellStyle,
    setColumnWidth,
    setLiveWidth,
    clearWidths,
    frozenProps,
  };
}
