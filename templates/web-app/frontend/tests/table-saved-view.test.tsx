import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { beforeEach, describe, expect, it } from "vitest";

import { SidebarProvider } from "../src/components/ui/sidebar";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { ManagedDataTable } from "../src/components/ui/ManagedDataTable";
import { matchesCondition, type FilterableColumn } from "../src/lib/tableFilters";
import {
  loadColumnLayout,
  loadTableState,
  reconcileOrder,
  saveColumnLayout,
  saveTableState,
} from "../src/lib/tableViewPrefs";

// The managed table's header filters and saved view (proven in an app built from this
// template). fireEvent rather than user-event, as in table-view-options.test.

type Row = { id: string; name: string; kind: string; count: number; seen: string; notes: string };

const ROWS: Row[] = [
  { id: "1", name: "Alpha", kind: "north", count: 3, seen: "2026-10-20T10:00:00Z", notes: "first" },
  { id: "2", name: "Bravo", kind: "south", count: 12, seen: "2026-10-22T23:30:00Z", notes: "second" },
  { id: "3", name: "Charlie", kind: "north", count: 40, seen: "2026-10-25T08:00:00Z", notes: "third" },
];

const columns: ColumnDef<Row, unknown>[] = [
  { id: "name", accessorKey: "name", header: "Name" },
  { id: "kind", accessorKey: "kind", header: "Kind" },
  { id: "count", accessorKey: "count", header: "Count", meta: { align: "right" } },
  { id: "seen", accessorKey: "seen", header: "Seen" },
  { id: "notes", accessorKey: "notes", header: "Notes" },
];

const FILTERABLE: FilterableColumn<Row>[] = [
  { id: "name", label: "Name", type: "text", accessor: (r) => r.name },
  { id: "kind", label: "Kind", type: "select", options: ["north", "south"], accessor: (r) => r.kind },
  { id: "count", label: "Count", type: "number", accessor: (r) => String(r.count) },
  { id: "seen", label: "Seen", type: "date", accessor: (r) => r.seen },
];

/** Every field is a column; only the relevant ones show until the person adds the rest. */
const HIDDEN_BY_DEFAULT = { notes: false };

function renderTable() {
  return render(
    <TooltipProvider>
      <SidebarProvider>
        <MemoryRouter>
          <ManagedDataTable
            data={ROWS}
            columns={columns}
            exportName="saved-view-test"
            filterableColumns={FILTERABLE}
            initialVisibility={HIDDEN_BY_DEFAULT}
            autoHeight
          />
        </MemoryRouter>
      </SidebarProvider>
    </TooltipProvider>,
  );
}

const names = () =>
  [...document.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("td")?.textContent ?? "");
const heads = () => [...document.querySelectorAll("th")].map((th) => th.textContent?.trim() ?? "");
const funnel = (label: string) => screen.getByRole("button", { name: `Filter ${label}` });
/** Escape closes the open filter; wait for focus to come back to its button before opening another. */
async function close() {
  const open = document.querySelector<HTMLElement>("button[aria-expanded=true][aria-label^=Filter]")!;
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await waitFor(() => expect(document.activeElement).toBe(open));
}

describe("filter button in each column header", () => {
  beforeEach(() => localStorage.clear());

  it("is a labelled button in every filterable header, and none in the others", () => {
    renderTable();
    for (const label of ["Name", "Kind", "Count", "Seen"]) {
      const button = funnel(label);
      expect(button.tagName).toBe("BUTTON"); // reachable by Tab, opened by Enter or Space
      expect(button.closest("th")).not.toBeNull();
    }
    expect(screen.queryByRole("button", { name: "Filter Notes" })).not.toBeInTheDocument();
  });

  it("filters by a value, a text, a number and a date, and shows when it is in use", async () => {
    renderTable();
    fireEvent.click(funnel("Kind"));
    fireEvent.click(await screen.findByRole("button", { name: "North" }));
    await waitFor(() => expect(names()).toEqual(["Alpha", "Charlie"]));
    expect(funnel("Kind").className).toContain("text-primary");
    expect(funnel("Name").className).not.toContain("text-primary");
    await close();

    fireEvent.click(funnel("Count"));
    fireEvent.change(await screen.findByLabelText("Count at least"), { target: { value: "10" } });
    await waitFor(() => expect(names()).toEqual(["Charlie"]));
    // clearing one column's filter leaves the others
    fireEvent.click(screen.getByRole("button", { name: "Clear this filter" }));
    await waitFor(() => expect(names()).toEqual(["Alpha", "Charlie"]));
    await close();

    fireEvent.click(funnel("Seen"));
    fireEvent.change(await screen.findByLabelText("Seen from"), { target: { value: "2026-10-21" } });
    await waitFor(() => expect(names()).toEqual(["Charlie"]));
    await close();

    fireEvent.click(funnel("Name"));
    fireEvent.change(await screen.findByLabelText("Name contains"), { target: { value: "zzz" } });
    // no row is left (the table says so in its empty row)
    await waitFor(() => expect(names().filter((n) => ["Alpha", "Bravo", "Charlie"].includes(n))).toEqual([]));
  });
});

describe("the saved view: columns, order, sort and filters, per table", () => {
  beforeEach(() => localStorage.clear());

  it("covers every field, shows the default set, and offers the rest in the Columns menu", () => {
    renderTable();
    expect(heads().some((h) => h.includes("Notes"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    expect(screen.getByRole("checkbox", { name: "Notes" })).toBeInTheDocument();
  });

  it("remembers the columns chosen, only as they differ from the defaults, and forgets them when back", async () => {
    const first = renderTable();
    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Notes" })); // on
    fireEvent.click(screen.getByRole("checkbox", { name: "Kind" })); // off
    await waitFor(() =>
      expect(loadColumnLayout("saved-view-test").visibility).toEqual({ notes: true, kind: false }),
    );
    first.unmount();
    renderTable(); // a new visit
    expect(heads().some((h) => h.includes("Notes"))).toBe(true);
    expect(heads().some((h) => h.includes("Kind"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Notes" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Kind" }));
    await waitFor(() => expect(localStorage.getItem("table-columns:saved-view-test")).toBeNull());
  });

  it("opens with the order the person left, keeps it on reload, and Reset columns forgets it", async () => {
    saveColumnLayout("saved-view-test", { visibility: {}, order: ["count", "name", "kind", "seen", "notes"] });
    renderTable();
    await waitFor(() => expect(heads()[0]).toContain("Count"));
    // the order must not be compared with itself and stored as "default"
    expect(loadColumnLayout("saved-view-test").order.slice(0, 2)).toEqual(["count", "name"]);
    fireEvent.click(screen.getByLabelText(/view options/i));
    fireEvent.click(await screen.findByRole("button", { name: /Reset columns/ }));
    await waitFor(() => expect(heads()[0]).toContain("Name"));
    await waitFor(() => expect(localStorage.getItem("table-columns:saved-view-test")).toBeNull());
  });

  it("remembers the sort and filters, and opens as they were left", async () => {
    const first = renderTable();
    fireEvent.click(within(document.querySelector("thead")!).getByRole("button", { name: /^Count/ }));
    fireEvent.click(funnel("Kind"));
    fireEvent.click(await screen.findByRole("button", { name: "North" }));
    await waitFor(() =>
      expect(loadTableState("saved-view-test")).toMatchObject({
        sorting: [{ id: "count" }],
        conditions: [{ field: "kind", operator: "is", value: "north" }],
      }),
    );
    const left = names();
    first.unmount();
    renderTable();
    expect(names()).toEqual(left);
    expect(names()).not.toContain("Bravo");
  });

  it("forgets the sort and filters once they are cleared", async () => {
    saveTableState("saved-view-test", {
      sorting: [{ id: "count", desc: true }],
      conditions: [{ id: "c", field: "kind", operator: "is", value: "south" }],
    });
    renderTable();
    expect(names()).toEqual(["Bravo"]);
    fireEvent.click(screen.getByRole("button", { name: /Clear filter and sorting/ }));
    await waitFor(() => expect(loadTableState("saved-view-test")).toEqual({ sorting: [], conditions: [] }));
  });
});

describe("number and date conditions", () => {
  type R = { n: number | null; when: string | null };
  const cols: FilterableColumn<R>[] = [
    { id: "n", label: "N", type: "number", accessor: (r) => (r.n === null ? null : String(r.n)) },
    { id: "when", label: "When", type: "date", accessor: (r) => r.when },
  ];
  const cond = (field: string, operator: "at_least" | "at_most" | "after" | "before", value: string) => ({
    id: "c",
    field,
    operator,
    value,
  });
  it("compares numbers, and a missing number matches neither end", () => {
    expect(matchesCondition({ n: 5, when: null }, cond("n", "at_least", "5"), cols)).toBe(true);
    expect(matchesCondition({ n: 4, when: null }, cond("n", "at_least", "5"), cols)).toBe(false);
    expect(matchesCondition({ n: 4, when: null }, cond("n", "at_most", "5"), cols)).toBe(true);
    expect(matchesCondition({ n: null, when: null }, cond("n", "at_most", "5"), cols)).toBe(false);
  });
  it("compares dates, a bare date meaning the whole day", () => {
    const row = { n: 1, when: "2026-10-22T23:30:00Z" };
    expect(matchesCondition(row, cond("when", "after", "2026-10-22"), cols)).toBe(true);
    expect(matchesCondition(row, cond("when", "before", "2026-10-22"), cols)).toBe(true);
    expect(matchesCondition(row, cond("when", "before", "2026-10-21"), cols)).toBe(false);
    expect(matchesCondition(row, cond("when", "after", "2026-10-23"), cols)).toBe(false);
  });
});

describe("remembered layouts in storage", () => {
  beforeEach(() => localStorage.clear());
  it("round-trips, per table, and survives bad stored data", () => {
    saveColumnLayout("a", { visibility: { x: false }, order: ["b", "a"] });
    expect(loadColumnLayout("a")).toEqual({ visibility: { x: false }, order: ["b", "a"] });
    expect(loadColumnLayout("other")).toEqual({ visibility: {}, order: [] });
    saveColumnLayout("a", { visibility: {}, order: [] });
    expect(localStorage.getItem("table-columns:a")).toBeNull();
    localStorage.setItem("table-columns:a", "{not json");
    expect(loadColumnLayout("a")).toEqual({ visibility: {}, order: [] });
    localStorage.setItem("table-columns:a", JSON.stringify({ visibility: { x: "yes", y: false }, order: [1, "z"] }));
    expect(loadColumnLayout("a")).toEqual({ visibility: { y: false }, order: ["z"] });
  });
  it("round-trips a table's sort and filters, drops empty filters, and ignores bad data", () => {
    saveTableState("t", {
      sorting: [{ id: "a", desc: true }],
      conditions: [
        { id: "1", field: "f", operator: "is", value: "x" },
        { id: "2", field: "g", operator: "is", value: " " },
      ],
    });
    expect(loadTableState("t")).toEqual({
      sorting: [{ id: "a", desc: true }],
      conditions: [{ id: "1", field: "f", operator: "is", value: "x" }],
    });
    saveTableState("t", { sorting: [], conditions: [] });
    expect(localStorage.getItem("table-state:t")).toBeNull();
    localStorage.setItem("table-state:t", "oops");
    expect(loadTableState("t")).toEqual({ sorting: [], conditions: [] });
  });
  it("keeps the remembered order for the columns that remain and puts a new one at the end", () => {
    expect(reconcileOrder(["c", "a", "gone", "b"], ["a", "b", "c", "new"])).toEqual(["c", "a", "b", "new"]);
    expect(reconcileOrder([], ["a", "b"])).toEqual(["a", "b"]);
  });
});
