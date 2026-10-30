import { describe, expect, it } from "vitest";

import { matchesCondition, type FilterableColumn } from "../src/lib/tableFilters";

type Row = { status: string; name: string };
const columns: FilterableColumn<Row>[] = [
  { id: "status", label: "Status", type: "select", options: ["open", "resolved", "not_assessed"], accessor: (r) => r.status },
  { id: "name", label: "Name", type: "text", accessor: (r) => r.name },
];
const cond = (operator: "is" | "is_not" | "contains", value: string, field = "status") => ({
  id: "c",
  field,
  operator,
  value,
});

describe("select filters take several values", () => {
  it("'is any of' matches any listed value", () => {
    expect(matchesCondition({ status: "open", name: "" }, cond("is", "open,resolved"), columns)).toBe(true);
    expect(matchesCondition({ status: "resolved", name: "" }, cond("is", "open,resolved"), columns)).toBe(true);
    expect(matchesCondition({ status: "not_assessed", name: "" }, cond("is", "open,resolved"), columns)).toBe(false);
  });

  it("'is none of' excludes every listed value", () => {
    expect(matchesCondition({ status: "open", name: "" }, cond("is_not", "open,resolved"), columns)).toBe(false);
    expect(matchesCondition({ status: "not_assessed", name: "" }, cond("is_not", "open,resolved"), columns)).toBe(true);
  });

  it("a single value and no value behave as before", () => {
    expect(matchesCondition({ status: "open", name: "" }, cond("is", "open"), columns)).toBe(true);
    expect(matchesCondition({ status: "open", name: "" }, cond("is", ""), columns)).toBe(true);
  });

  it("text filters are unaffected by commas", () => {
    expect(matchesCondition({ status: "", name: "Bridge, north" }, cond("contains", "bridge, n", "name"), columns)).toBe(true);
  });
});
