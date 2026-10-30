import type { KeyboardEvent, RefObject } from "react";
import { Check, X } from "lucide-react";

import { cn } from "../../../lib/utils";
import { vocabularyLabel } from "../../../lib/vocabularies";
import { IconButton } from "../icon-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../select";
import type { EditableColumnMeta } from "./columnMeta";

/** The inside of a cell being edited inline. Saving is always explicit:
 *  Enter or the check button for text, picking an option for a select.
 *  Leaving a changed text cell keeps it open (outlined) rather than saving
 *  or losing the edit. */
export function EditingCell({
  meta,
  columnId,
  value,
  dirty,
  saving,
  inputRef,
  onChange,
  onKeyDown,
  onBlurUnchanged,
  onPick,
  onClosePicker,
  onCommit,
  onCancel,
}: {
  meta: EditableColumnMeta | undefined;
  columnId: string;
  value: string;
  dirty: boolean;
  saving: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onBlurUnchanged: () => void;
  onPick: (value: string) => void;
  onClosePicker: () => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      {meta?.type === "select" ? (
        // Picking an option is an explicit choice, so
        // it saves; closing without picking cancels.
        <Select
          defaultOpen
          value={value}
          disabled={saving}
          onValueChange={onPick}
          onOpenChange={(open) => {
            if (!open) onClosePicker();
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label={`Edit ${columnId}`}
            className="w-full border-primary"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            {meta?.options?.map((o) => (
              <SelectItem key={o} value={o}>
                {vocabularyLabel(o)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            autoFocus
            value={value}
            disabled={saving}
            aria-label={`Edit ${columnId}`}
            title="Enter to save · Esc to cancel"
            onChange={(e) => onChange(e.target.value)}
            // Leaving an unchanged cell just closes it; a
            // changed one stays open until saved or
            // cancelled, so tabbing away never saves.
            onBlur={onBlurUnchanged}
            onKeyDown={onKeyDown}
            className={cn(
              "h-8 min-w-0 flex-1 rounded border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              dirty ? "border-warning ring-1 ring-warning/40" : "border-primary",
            )}
          />
          {dirty && (
            <>
              <IconButton
                label="Save (Enter)"
                size="icon-sm"
                variant="default"
                disabled={saving}
                onMouseDown={(e) => e.preventDefault()}
                onClick={onCommit}
              >
                <Check />
              </IconButton>
              <IconButton
                label="Cancel (Esc)"
                size="icon-sm"
                variant="ghost"
                onMouseDown={(e) => e.preventDefault()}
                onClick={onCancel}
              >
                <X />
              </IconButton>
            </>
          )}
        </div>
      )}
    </>
  );
}
