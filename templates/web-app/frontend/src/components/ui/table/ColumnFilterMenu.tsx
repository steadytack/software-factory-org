import { useState } from "react";
import { Check, Filter } from "lucide-react";

import { cn } from "../../../lib/utils";
import { vocabularyLabel } from "../../../lib/vocabularies";
import {
  joinValues,
  splitValues,
  type FilterCondition,
  type FilterOperator,
  type FilterableColumn,
} from "../../../lib/tableFilters";
import { Popover, PopoverContent, PopoverTrigger } from "../popover";

const newId = () => `f-${Math.random().toString(36).slice(2, 9)}`;

/** The filter button in a column's header: a small funnel that opens just that column's filter, so a
 *  person filters where they are looking. It edits the same conditions as the toolbar's Filter & sort
 *  menu (a select column offers its values, a text column a box, a number or a date a from and a to). */
export function ColumnFilterMenu<T>({
  column,
  conditions,
  onConditionsChange,
}: {
  column: FilterableColumn<T>;
  conditions: FilterCondition[];
  onConditionsChange: (conditions: FilterCondition[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const mine = conditions.filter((c) => c.field === column.id);
  const active = mine.some((c) => c.value.trim() !== "");

  /** Sets one operator's value for this column, or drops it when emptied. */
  const set = (operator: FilterOperator, value: string) => {
    const others = conditions.filter((c) => !(c.field === column.id && c.operator === operator));
    onConditionsChange(
      value === ""
        ? others
        : [...others, { id: mine.find((c) => c.operator === operator)?.id ?? newId(), field: column.id, operator, value }],
    );
  };
  const valueOf = (operator: FilterOperator) => mine.find((c) => c.operator === operator)?.value ?? "";
  const clear = () => onConditionsChange(conditions.filter((c) => c.field !== column.id));

  const selected = splitValues(valueOf("is"));
  const toggle = (option: string) =>
    set(
      "is",
      joinValues(
        (column.options ?? []).filter((o) => (o === option ? !selected.includes(o) : selected.includes(o))),
      ),
    );
  const input = "h-8 w-full rounded border border-border bg-background px-2 text-xs";
  const [low, high]: [FilterOperator, FilterOperator] = column.type === "date" ? ["after", "before"] : ["at_least", "at_most"];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Filter ${column.label}`}
          className={cn(
            "tap-area grid size-5 place-items-center rounded-sm text-muted-foreground opacity-60 transition-opacity hover:bg-muted hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring",
            active && "text-primary opacity-100",
          )}
        >
          <Filter className={cn("size-3", active && "fill-current")} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <p className="mb-2 text-xs font-medium">{column.label}</p>
        {column.type === "select" && (
          <div role="group" aria-label={`${column.label} values`} className="flex flex-wrap gap-1">
            {column.options?.map((o) => {
              const on = selected.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(o)}
                  className={
                    on
                      ? "flex h-7 items-center gap-1 rounded-full border border-primary bg-primary/10 px-3 text-xs font-medium text-primary"
                      : "flex h-7 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs hover:bg-muted/40"
                  }
                >
                  {on && <Check className="size-3" />}
                  {vocabularyLabel(o)}
                </button>
              );
            })}
          </div>
        )}
        {column.type === "text" && (
          <input
            aria-label={`${column.label} contains`}
            autoFocus
            value={valueOf("contains")}
            onChange={(e) => set("contains", e.target.value)}
            placeholder="Contains…"
            className={input}
          />
        )}
        {(column.type === "number" || column.type === "date") && (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {column.type === "date" ? "From" : "At least"}
              <input
                aria-label={`${column.label} ${column.type === "date" ? "from" : "at least"}`}
                type={column.type === "date" ? "date" : "number"}
                value={valueOf(low)}
                onChange={(e) => set(low, e.target.value)}
                className={input}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {column.type === "date" ? "To" : "At most"}
              <input
                aria-label={`${column.label} ${column.type === "date" ? "to" : "at most"}`}
                type={column.type === "date" ? "date" : "number"}
                value={valueOf(high)}
                onChange={(e) => set(high, e.target.value)}
                className={input}
              />
            </label>
          </div>
        )}
        {active && (
          <button type="button" onClick={clear} className="mt-3 text-xs font-medium text-primary hover:underline">
            Clear this filter
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
