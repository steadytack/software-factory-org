import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "../src/components/ui/sidebar";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { ManagedDataTable, type ServerTable } from "../src/components/ui/ManagedDataTable";
import { conditionsOf, sortParam, sortingOf, whereParams } from "../src/lib/serverTable";
import type { FilterableColumn } from "../src/lib/tableFilters";

// A managed table in server mode (proven in an app built from this template): the rows arrive searched,
// filtered and sorted; the table sends its state up, counts every match, pages and exports on the server.

type Row = { id: string; name: string; kind: string };
const columns: ColumnDef<Row, unknown>[] = [
  { id: "name", accessorKey: "name", header: "Name" },
  { id: "kind", accessorKey: "kind", header: "Kind" },
];
const FILTERS: FilterableColumn<Row>[] = [
  { id: "kind", label: "Kind", type: "select", options: ["north", "south"], accessor: (r) => r.kind },
];
// One page as the server sent it: in its order, and holding a row the client filter would drop.
const PAGE: Row[] = [
  { id: "1", name: "Zulu", kind: "south" },
  { id: "2", name: "Alpha", kind: "north" },
];

function renderServer(server: Partial<ServerTable> = {}, onStateChange = vi.fn()) {
  const full: ServerTable = {
    total: 120,
    page: 2,
    size: 50,
    onPageChange: vi.fn(),
    exportHref: (s) => `/api/things.csv?${new URLSearchParams([
      ...(sortParam(s.sorting) ? [["sort", sortParam(s.sorting)!]] : []),
      ...whereParams(s.conditions).map((w) => ["where", w]),
    ])}`,
    ...server,
  };
  render(
    <TooltipProvider>
      <SidebarProvider>
        <MemoryRouter>
          <ManagedDataTable
            data={PAGE}
            columns={columns}
            exportName="server-test"
            filterableColumns={FILTERS}
            initialConditions={[{ id: "c", field: "kind", operator: "is", value: "north" }]}
            onStateChange={onStateChange}
            server={full}
            autoHeight
          />
        </MemoryRouter>
      </SidebarProvider>
    </TooltipProvider>,
  );
  return full;
}

const names = () => [...document.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("td")?.textContent);

describe("ManagedDataTable in server mode", () => {
  beforeEach(() => localStorage.clear());

  it("shows the page as the server sent it, and counts every match", () => {
    renderServer();
    // not filtered or re-sorted in the browser: the server already did
    expect(names()).toEqual(["Zulu", "Alpha"]);
    expect(screen.getByText("120 rows")).toBeInTheDocument();
  });

  it("sends a sort up rather than sorting the page", () => {
    const onStateChange = vi.fn();
    renderServer({}, onStateChange);
    fireEvent.click(screen.getByRole("button", { name: /^Name/ }));
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ sorting: [{ id: "name", desc: false }] }),
    );
    expect(names()).toEqual(["Zulu", "Alpha"]);
  });

  it("pages through the server's rows", () => {
    const server = renderServer();
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(server.onPageChange).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(server.onPageChange).toHaveBeenCalledWith(1);
  });

  it("has no pager when everything fits on one page", () => {
    renderServer({ total: 2, page: 1 });
    expect(screen.queryByRole("navigation", { name: "Pages" })).not.toBeInTheDocument();
  });

  it("exports every match from the server, with the table's filters", () => {
    const clicked: string[] = [];
    const spy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.getAttribute("href") ?? "");
    });
    renderServer();
    fireEvent.click(screen.getByRole("button", { name: "Export as CSV" }));
    spy.mockRestore();
    expect(clicked).toEqual(["/api/things.csv?where=kind%3Ais%3Anorth"]);
  });
});

describe("serverTable parameters", () => {
  it("round-trips a sort and filters", () => {
    expect(sortParam([{ id: "name", desc: true }])).toBe("name:desc");
    expect(sortParam([])).toBeNull();
    expect(sortingOf("name:asc")).toEqual([{ id: "name", desc: false }]);
    expect(sortingOf("name:sideways")).toEqual([]);
    const where = whereParams([
      { id: "a", field: "seen", operator: "after", value: "2026-10-01T10:00" },
      { id: "b", field: "kind", operator: "is", value: " " },
    ]);
    // an empty filter says nothing; a value may hold colons
    expect(where).toEqual(["seen:after:2026-10-01T10:00"]);
    expect(conditionsOf(where)).toEqual([{ id: "c0", field: "seen", operator: "after", value: "2026-10-01T10:00" }]);
  });
});
