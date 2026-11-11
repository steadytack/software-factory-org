import type { FilterCondition, FilterOperator } from "./tableFilters";

/** A table's search, sort and filters as they travel in the URL and to the server (the backend side is core/table_query.py):
 *  `sort=field:asc|desc` and one `where=field:operator:value` per filter. */

export function sortParam(sorting: { id: string; desc: boolean }[]): string | null {
  const first = sorting[0];
  return first ? `${first.id}:${first.desc ? "desc" : "asc"}` : null;
}

export function sortingOf(param: string | null): { id: string; desc: boolean }[] {
  const [id, direction] = (param ?? "").split(":");
  return id && (direction === "asc" || direction === "desc") ? [{ id, desc: direction === "desc" }] : [];
}

/** The conditions that say something: a filter with no value yet filters nothing. */
export function whereParams(conditions: FilterCondition[]): string[] {
  return conditions.filter((c) => c.value.trim() !== "").map((c) => `${c.field}:${c.operator}:${c.value}`);
}

export function conditionsOf(where: string[]): FilterCondition[] {
  return where.flatMap((spec, index) => {
    const [field, operator, ...rest] = spec.split(":");
    if (!field || !operator) return [];
    return [{ id: `c${index}`, field, operator: operator as FilterOperator, value: rest.join(":") }];
  });
}
