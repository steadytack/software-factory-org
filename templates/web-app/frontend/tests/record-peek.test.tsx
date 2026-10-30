import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "../src/components/ui/sidebar";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { ManagedDataTable } from "../src/components/ui/ManagedDataTable";

type Row = { id: string; name: string };

const columns: ColumnDef<Row, unknown>[] = [{ id: "name", accessorKey: "name", header: "Name" }];
const data = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Bravo" },
  { id: "c", name: "Charlie" },
];

function renderTable(onRowOpen = vi.fn()) {
  render(
    <TooltipProvider>
      <SidebarProvider>
        <MemoryRouter>
          <ManagedDataTable
            data={data}
            columns={columns}
            exportName="peek-test"
            autoHeight
            onRowOpen={onRowOpen}
            peek={{
              title: (r) => `Peek ${r.name}`,
              render: (r) => <p>Body of {r.name}</p>,
              fullPageLabel: "Open record",
            }}
          />
        </MemoryRouter>
      </SidebarProvider>
    </TooltipProvider>,
  );
  return onRowOpen;
}

const rows = () => [...document.querySelectorAll<HTMLElement>("tbody tr")];
const panelTitle = () => document.querySelector("[data-slot=sheet-title]")?.textContent;

describe("row side panel", () => {
  it("opens on a row click, without leaving the list", () => {
    const onRowOpen = renderTable();
    fireEvent.click(screen.getByText("Bravo"));
    expect(panelTitle()).toBe("Peek Bravo");
    expect(screen.getByText("Body of Bravo")).toBeInTheDocument();
    expect(rows()[1]).toHaveAttribute("data-peeked");
    expect(onRowOpen).not.toHaveBeenCalled();
  });

  it("moves to the next and previous record with the arrow keys", () => {
    renderTable();
    fireEvent.click(screen.getByText("Alpha"));
    const panel = document.querySelector<HTMLElement>("[data-slot=sheet-content]")!;
    fireEvent.keyDown(panel, { key: "ArrowDown" });
    expect(panelTitle()).toBe("Peek Bravo");
    fireEvent.keyDown(panel, { key: "ArrowDown" });
    fireEvent.keyDown(panel, { key: "ArrowDown" }); // already at the last row
    expect(panelTitle()).toBe("Peek Charlie");
    fireEvent.keyDown(panel, { key: "ArrowUp" });
    expect(panelTitle()).toBe("Peek Bravo");
  });

  it("opens the panel with Enter and the full page with Shift+Enter", () => {
    const onRowOpen = renderTable();
    fireEvent.keyDown(rows()[2], { key: "Enter" });
    expect(panelTitle()).toBe("Peek Charlie");
    expect(onRowOpen).not.toHaveBeenCalled();

    fireEvent.keyDown(rows()[0], { key: "Enter", shiftKey: true });
    expect(onRowOpen).toHaveBeenCalledWith(data[0]);
  });

  it("offers the full page from the panel", () => {
    const onRowOpen = renderTable();
    fireEvent.click(screen.getByText("Alpha"));
    fireEvent.click(screen.getByText("Open record"));
    expect(onRowOpen).toHaveBeenCalledWith(data[0]);
  });
});
