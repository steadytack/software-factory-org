import type { Column } from "@tanstack/react-table";
import { ListChecks, Trash2, X } from "lucide-react";

import { vocabularyLabel } from "../../../lib/vocabularies";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../dropdown-menu";
import { IconButton } from "../icon-button";
import type { EditableColumnMeta } from "./columnMeta";

/** Bulk actions for the selected rows: in the toolbar on desktop, and in a
 *  floating bar above the tab bar in card mode (within thumb reach). */
export function SelectionControls<T>({
  selectedCount,
  bulkProgress,
  bulkColumns,
  bulkBusy,
  onApplyBulk,
  onDelete,
  onClear,
  compact,
}: {
  selectedCount: number;
  bulkProgress: { done: number; total: number } | null;
  bulkColumns: Column<T, unknown>[];
  bulkBusy: boolean;
  onApplyBulk: (columnId: string, label: string, value: string) => void;
  /** Present when the page supports bulk delete. */
  onDelete?: () => void;
  onClear: () => void;
  /** Card mode: icon-sized buttons for touch. */
  compact: boolean;
}) {
  const size = compact ? ("icon" as const) : undefined;
  return (
    <>
      <span className="mr-1 flex-1 text-xs font-medium text-foreground md:flex-none" aria-live="polite">
        {bulkProgress
          ? `Updated ${bulkProgress.done} of ${bulkProgress.total}…`
          : `${selectedCount} selected`}
      </span>
      {bulkColumns.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="Set a field on the selected rows" disabled={bulkBusy} size={size}>
              <ListChecks />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Set on {selectedCount} selected</DropdownMenuLabel>
            {bulkColumns.map((col) => {
              const label = String(col.columnDef.header || col.id);
              const options = (col.columnDef.meta as EditableColumnMeta).options ?? [];
              return (
                <DropdownMenuSub key={col.id}>
                  <DropdownMenuSubTrigger>{label}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {options.map((o) => (
                      <DropdownMenuItem key={o} onSelect={() => onApplyBulk(col.id, label, o)}>
                        {vocabularyLabel(o)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {onDelete && (
        <IconButton
          label="Delete selected"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 />
        </IconButton>
      )}
      <IconButton label="Clear selection" size={size} onClick={onClear}>
        <X />
      </IconButton>
    </>
  );
}
