import { describe, expect, it } from "vitest";

// Record data is shown in a ManagedDataTable (DESIGN.md, Tables): header filters, a saved view, every
// field as a column, CSV. A plain <table>, or the bare shadcn Table primitive, outside the managed
// table skips all of that, so it fails here. A list of records drawn as <ul> cannot be told from a
// menu or a nav by a scan, so that half of the rule is the UI polish audit's (factory/audits/ui-polish.md).

const SOURCES = import.meta.glob("../src/**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

/** The managed table itself, and the primitive it may be built from. */
const ALLOWED = new Set(["../src/components/ui/ManagedDataTable.tsx", "../src/components/ui/table.tsx"]);

describe("record data is in a ManagedDataTable", () => {
  it("has no plain <table> or bare Table primitive outside the managed table", () => {
    const offenders = Object.entries(SOURCES)
      .filter(([path]) => !ALLOWED.has(path))
      .filter(([, text]) => /<table[\s>]/.test(text) || /from\s+["'][./]*(?:components\/)?ui\/table["']/.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it("is a real scan (it sees the managed table's own <table>)", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20);
    expect(SOURCES["../src/components/ui/ManagedDataTable.tsx"]).toMatch(/<table[\s>]/);
  });
});
