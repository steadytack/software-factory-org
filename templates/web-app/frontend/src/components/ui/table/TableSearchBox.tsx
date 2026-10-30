import { Search, X } from "lucide-react";

import { IconButton } from "../icon-button";
import { Input } from "../input";
import { WithTooltip } from "../with-tooltip";

/** The table's search field, with a clear button that appears once anything
 *  (search text, column filters, sorting, conditions) is applied. */
export function TableSearchBox({
  value,
  onChange,
  onArrowDown,
  canArrowDown,
  canClear,
  onClear,
  onClose,
}: {
  value: string;
  onChange: (value: string) => void;
  /** ↓ from the search box drops into the rows (when there are any). */
  onArrowDown: () => void;
  canArrowDown: boolean;
  canClear: boolean;
  onClear: () => void;
  /** Phone: the field is open in place of the toolbar buttons; this closes it again. */
  onClose?: () => void;
}) {
  const field = (
    <div className={onClose ? "relative min-w-0 flex-1" : "relative basis-full md:max-w-xs md:flex-1 md:basis-auto"}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={Boolean(onClose)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && onClose) {
            onClose();
            return;
          }
          if (e.key === "ArrowDown" && canArrowDown) {
            e.preventDefault();
            onArrowDown();
          }
        }}
        placeholder="Search…"
        aria-label="Search"
        data-table-search
        className="h-[var(--control-h)] pl-8 pr-8 text-sm pointer-coarse:text-base md:h-8"
      />
      {canClear && (
        <WithTooltip label="Clear filter and sorting">
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear filter and sorting"
            className="absolute right-2 top-1/2 grid -translate-y-1/2 place-items-center text-muted-foreground hover:text-foreground pointer-coarse:right-0 pointer-coarse:size-11"
          >
            <X className="size-3.5" />
          </button>
        </WithTooltip>
      )}
    </div>
  );
  if (!onClose) return field;
  return (
    <div className="flex basis-full items-center gap-2">
      {field}
      <IconButton label="Close search" variant="ghost" onClick={onClose}>
        <X />
      </IconButton>
    </div>
  );
}
