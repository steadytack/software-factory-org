import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Plus, SlidersHorizontal, X } from "lucide-react";
import type { SortingState } from "@tanstack/react-table";

import { useModalA11y } from "../../hooks/useModalA11y";
import { vocabularyLabel } from "../../lib/vocabularies";
import { IconButton } from "./icon-button";
import { OptionSelect } from "./option-select";
import { WithTooltip } from "./with-tooltip";
import {
  OPERATORS_BY_TYPE,
  OPERATOR_LABELS,
  defaultOperatorFor,
  joinValues,
  splitValues,
  type FilterCondition,
  type FilterableColumn,
} from "../../lib/tableFilters";

interface SortableColumn {
  id: string;
  label: string;
}

interface TableFilterSortProps<T> {
  filterableColumns: FilterableColumn<T>[];
  conditions: FilterCondition[];
  onConditionsChange: (conditions: FilterCondition[]) => void;
  sortableColumns: SortableColumn[];
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  /** Sizes the trigger to match the rest of the table toolbar. */
  triggerClassName?: string;
}

let nextId = 0;
function newId(): string {
  nextId += 1;
  return `cond-${Date.now()}-${nextId}`;
}

/** Toolbar trigger + popover: multi-condition filters (AND-only) and
 *  multi-column sort, both editable as add/remove lists. Reuses the table's
 *  own `sorting` state, so this and header-click sorting never disagree. */
export function TableFilterSort<T>({
  filterableColumns,
  conditions,
  onConditionsChange,
  sortableColumns,
  sorting,
  onSortingChange,
  triggerClassName,
}: TableFilterSortProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useModalA11y(containerRef, { active: open, onEscape: () => setOpen(false) });

  const activeCount = conditions.length + sorting.length;

  function addCondition() {
    const first = filterableColumns[0];
    if (!first) return;
    onConditionsChange([
      ...conditions,
      {
        id: newId(),
        field: first.id,
        operator: defaultOperatorFor(first.type),
        value: "",
      },
    ]);
  }

  function updateCondition(id: string, patch: Partial<FilterCondition>) {
    onConditionsChange(conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeCondition(id: string) {
    onConditionsChange(conditions.filter((c) => c.id !== id));
  }

  function addSort() {
    const used = new Set(sorting.map((s) => s.id));
    const next = sortableColumns.find((c) => !used.has(c.id)) ?? sortableColumns[0];
    if (!next) return;
    onSortingChange([...sorting, { id: next.id, desc: false }]);
  }

  function updateSort(index: number, patch: Partial<SortingState[number]>) {
    onSortingChange(sorting.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function removeSort(index: number) {
    onSortingChange(sorting.filter((_, i) => i !== index));
  }

  function clearAll() {
    onConditionsChange([]);
    onSortingChange([]);
  }

  return (
    <div className="relative">
      <IconButton
        label="Filter & sort"
        variant="secondary"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={triggerClassName}
      >
        <SlidersHorizontal />
      </IconButton>
      {/* A sibling of the trigger (not nested inside it) so it's a real
          button; ringed so it sits cleanly over the trigger's corner. */}
      {activeCount > 0 && (
        <WithTooltip label={`Clear ${activeCount} filter and sort condition${activeCount === 1 ? "" : "s"}`}>
          <button
            type="button"
            aria-label={`Clear ${activeCount} filter and sort condition${activeCount === 1 ? "" : "s"}`}
            onClick={clearAll}
            className="group absolute -right-1 -top-1 z-(--z-sticky) pointer-coarse:after:absolute pointer-coarse:after:-inset-4 pointer-coarse:after:content-[''] grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-micro font-semibold leading-none text-primary-foreground ring-2 ring-background hover:bg-destructive"
          >
            <span className="group-hover:hidden">{activeCount}</span>
            <X className="hidden size-2.5 group-hover:block" />
          </button>
        </WithTooltip>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Filter and sort"
            tabIndex={-1}
            className="absolute left-0 z-50 mt-1 w-96 overflow-hidden rounded-lg border border-border/60 bg-popover text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
          >
            <div className="max-h-[70vh] overflow-y-auto p-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Filters
              </div>
              <div className="space-y-2">
                {conditions.map((condition) => {
                  const column = filterableColumns.find((c) => c.id === condition.field);
                  const type = column?.type ?? "text";
                  const selected = splitValues(condition.value);
                  const toggle = (option: string) =>
                    updateCondition(condition.id, {
                      // Keep the column's option order, not click order.
                      value: joinValues(
                        (column?.options ?? []).filter((o) =>
                          o === option ? !selected.includes(o) : selected.includes(o),
                        ),
                      ),
                    });
                  return (
                    <div key={condition.id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <OptionSelect
                          ariaLabel="Filter field"
                          value={condition.field}
                          onChange={(field) => {
                            const nextColumn = filterableColumns.find((c) => c.id === field);
                            updateCondition(condition.id, {
                              field,
                              operator: nextColumn
                                ? defaultOperatorFor(nextColumn.type)
                                : condition.operator,
                              value: "",
                            });
                          }}
                          options={filterableColumns.map((c) => ({ value: c.id, label: c.label }))}
                          className="min-w-0 flex-1"
                        />
                        <OptionSelect
                          ariaLabel="Filter operator"
                          value={condition.operator}
                          onChange={(op) =>
                            updateCondition(condition.id, {
                              operator: op as FilterCondition["operator"],
                            })
                          }
                          options={OPERATORS_BY_TYPE[type].map((op) => ({
                            value: op,
                            label: OPERATOR_LABELS[op],
                          }))}
                          className="w-28 shrink-0"
                        />
                        {type === "select" ? null : (
                          <input
                            aria-label="Filter value"
                            type={type === "number" ? "number" : type === "date" ? "date" : "text"}
                            value={condition.value}
                            onChange={(e) =>
                              updateCondition(condition.id, {
                                value: e.target.value,
                              })
                            }
                            placeholder="Value…"
                            className="h-8 min-w-0 flex-1 rounded border border-border bg-background px-2 text-xs"
                          />
                        )}
                        <WithTooltip label="Remove filter">
                          <button
                            aria-label="Remove filter"
                            onClick={() => removeCondition(condition.id)}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted/40 hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </WithTooltip>
                      </div>
                      {/* Pick any number of values; none picked = no filter. */}
                      {type === "select" && (
                        <div
                          role="group"
                          aria-label={`${column?.label ?? "Filter"} values`}
                          className="flex flex-wrap gap-1"
                        >
                          {column?.options?.map((o) => {
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
                                    : "flex h-7 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs text-foreground hover:bg-muted/40"
                                }
                              >
                                {on && <Check className="size-3" />}
                                {vocabularyLabel(o)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                onClick={addCondition}
                className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add filter
              </button>

              <div className="my-3 border-t border-border" />

              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sort
              </div>
              <div className="space-y-2">
                {sorting.map((rule, index) => (
                  <div key={`${rule.id}-${index}`} className="flex items-center gap-2">
                    <OptionSelect
                      ariaLabel="Sort field"
                      value={rule.id}
                      onChange={(id) => updateSort(index, { id })}
                      options={sortableColumns.map((c) => ({ value: c.id, label: c.label }))}
                      className="min-w-0 flex-1"
                    />
                    <button
                      onClick={() => updateSort(index, { desc: !rule.desc })}
                      className="flex h-8 w-24 shrink-0 items-center justify-center gap-1 rounded border border-border bg-background text-xs text-foreground hover:bg-muted/40"
                    >
                      {rule.desc ? (
                        <>
                          <ArrowDown className="h-3.5 w-3.5" /> Desc
                        </>
                      ) : (
                        <>
                          <ArrowUp className="h-3.5 w-3.5" /> Asc
                        </>
                      )}
                    </button>
                    <WithTooltip label="Remove sort">
                      <button
                        aria-label="Remove sort"
                        onClick={() => removeSort(index)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted/40 hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </WithTooltip>
                  </div>
                ))}
              </div>
              {sorting.length < sortableColumns.length && (
                <button
                  onClick={addSort}
                  className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add sort
                </button>
              )}
            </div>
            {activeCount > 0 && (
              <div className="flex justify-end border-t border-border bg-muted/40 px-3 py-2">
                <button
                  onClick={clearAll}
                  className="text-xs font-semibold text-muted-foreground hover:text-destructive"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
