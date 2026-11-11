/** Multi-condition filtering shared by `ManagedDataTable` and any page that
 *  configures it. Deliberately AND-only (no OR/grouping) — matches "multiple
 *  conditions" without a full boolean-expression builder. */

export type FilterOperator =
  | "contains"
  | "equals"
  | "is"
  | "is_not"
  | "at_least"
  | "at_most"
  | "after"
  | "before";

export interface FilterCondition {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

export interface FilterableColumn<T> {
  id: string;
  label: string;
  type: "text" | "select" | "number" | "date";
  /** Required when `type === "select"`. */
  options?: readonly string[];
  accessor: (row: T) => string | null | undefined;
}

/** Operators available for a field type, in display order. */
export const OPERATORS_BY_TYPE: Record<FilterableColumn<unknown>["type"], FilterOperator[]> = {
  text: ["contains", "equals"],
  select: ["is", "is_not"],
  number: ["at_least", "at_most"],
  date: ["after", "before"],
};

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains: "contains",
  equals: "is",
  is: "is any of",
  is_not: "is none of",
  at_least: "at least",
  at_most: "at most",
  after: "on or after",
  before: "on or before",
};

/** Select conditions hold several values ("is any of"), stored in `value`
 *  comma-separated so the condition shape (and its URL form) stays a single
 *  string. Option codes never contain commas; one value still parses as one. */
export function splitValues(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function joinValues(values: string[]): string {
  return values.join(",");
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function matchesCondition<T>(
  row: T,
  condition: FilterCondition,
  columns: FilterableColumn<T>[],
): boolean {
  const column = columns.find((c) => c.id === condition.field);
  if (!column || !condition.value) return true;
  const raw = normalize(column.accessor(row));
  const needle = normalize(condition.value);
  switch (condition.operator) {
    case "contains":
      return raw.includes(needle);
    case "equals":
      return raw === needle;
    case "is":
      return splitValues(needle).includes(raw);
    case "is_not":
      return !splitValues(needle).includes(raw);
    case "at_least":
    case "at_most": {
      const value = Number(column.accessor(row));
      const limit = Number(needle);
      if (column.accessor(row) == null || Number.isNaN(value) || Number.isNaN(limit)) return false;
      return condition.operator === "at_least" ? value >= limit : value <= limit;
    }
    case "after":
    case "before": {
      const moment = Date.parse(String(column.accessor(row) ?? ""));
      const limit = Date.parse(needle);
      if (Number.isNaN(moment) || Number.isNaN(limit)) return false;
      // a bare date is the whole day
      const end = /^\d{4}-\d{2}-\d{2}$/.test(needle) ? limit + 86_400_000 - 1 : limit;
      return condition.operator === "after" ? moment >= limit : moment <= end;
    }
    default:
      return true;
  }
}

export function matchesAllConditions<T>(
  row: T,
  conditions: FilterCondition[],
  columns: FilterableColumn<T>[],
): boolean {
  return conditions.every((c) => matchesCondition(row, c, columns));
}

export function defaultOperatorFor(type: FilterableColumn<unknown>["type"]): FilterOperator {
  return OPERATORS_BY_TYPE[type][0];
}
