import { Check, RotateCcw, Settings } from "lucide-react";
import { Link } from "react-router-dom";

import { Checkbox } from "../checkbox";
import { IconButton } from "../icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "../popover";
import { TABLE_DENSITY_OPTIONS, type TableDisplayPrefs } from "../../../lib/tableViewPrefs";

/** Toolbar popover for how tables look (not what they show): quick access
 *  to the person's row density, wrap and freeze settings, which apply to
 *  every table and also live in Profile → Display; plus a reset for this
 *  table's columns. */
export function ViewOptionsMenu({
  prefs,
  onPrefsChange,
  canReset,
  onReset,
  triggerClassName,
}: {
  prefs: TableDisplayPrefs;
  onPrefsChange: (prefs: TableDisplayPrefs) => void;
  /** False when this table's columns are already at their defaults. */
  canReset: boolean;
  /** Restore this table's default column order, visibility and widths. */
  onReset: () => void;
  triggerClassName?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton label="View options" variant="secondary" className={triggerClassName}>
          <Settings />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 gap-0 p-1">
        <p
          id="table-density-label"
          className="px-2 pb-1 pt-2 text-xs font-semibold text-muted-foreground"
        >
          Row density
        </p>
        <div role="radiogroup" aria-labelledby="table-density-label" className="flex flex-col">
          {TABLE_DENSITY_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={prefs.density === o.value}
              onClick={() => onPrefsChange({ ...prefs, density: o.value })}
              className="flex items-center gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
            >
              <span className="flex flex-1 flex-col">
                <span className="text-foreground">{o.label}</span>
                <span className="text-xs text-muted-foreground">{o.hint}</span>
              </span>
              {prefs.density === o.value && <Check aria-hidden className="size-4 text-primary" />}
            </button>
          ))}
        </div>

        <div role="separator" className="my-1 h-px bg-border" />
        <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm transition-colors hover:bg-muted">
          <Checkbox
            checked={prefs.wrap}
            onCheckedChange={(v) => onPrefsChange({ ...prefs, wrap: v === true })}
          />
          Wrap text
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm transition-colors hover:bg-muted">
          <Checkbox
            checked={prefs.freezeFirstColumn}
            onCheckedChange={(v) => onPrefsChange({ ...prefs, freezeFirstColumn: v === true })}
          />
          Freeze first column
        </label>
        <p className="px-2 pt-1 pb-2 text-xs text-muted-foreground">
          Applies to all tables · also in{" "}
          <Link to="/profile" className="font-medium text-primary hover:underline">
            Profile
          </Link>
        </p>

        <div role="separator" className="my-1 h-px bg-border" />
        <button
          type="button"
          disabled={!canReset}
          onClick={onReset}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
        >
          <RotateCcw aria-hidden className="size-4 text-muted-foreground" />
          Reset columns
        </button>
      </PopoverContent>
    </Popover>
  );
}
