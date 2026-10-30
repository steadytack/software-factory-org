import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "../src/components/ui/sidebar";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { ManagedDataTable } from "../src/components/ui/ManagedDataTable";

type Row = { id: string; name: string; status: string };

const columns: ColumnDef<Row, unknown>[] = [
  { id: "name", accessorKey: "name", header: "Name", meta: { editable: true, type: "text" } },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    meta: { editable: true, type: "select", options: ["active", "archived"] },
  },
];
const data = [
  { id: "a", name: "Alpha", status: "active" },
  { id: "b", name: "Bravo", status: "active" },
  { id: "c", name: "Charlie", status: "active" },
];

function renderTable(props: { onCellEdit?: (row: Row, col: string, v: string) => Promise<void> }) {
  render(
    <TooltipProvider>
      <SidebarProvider>
        <MemoryRouter>
          <ManagedDataTable
            data={data}
            columns={columns}
            exportName="bulk-test"
            autoHeight
            enableSelection
            {...props}
          />
        </MemoryRouter>
      </SidebarProvider>
    </TooltipProvider>,
  );
}

const selectRow = (name: string) =>
  fireEvent.click(screen.getByText(name).closest("tr")!.querySelector("button[role=checkbox]")!);

/** Radix menus open from the keyboard (or pointerdown), not click. */
function openMenu(trigger: HTMLElement) {
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
}

describe("bulk edit", () => {
  it("sets a select field on every selected row through onCellEdit", async () => {
    const onCellEdit = vi.fn().mockResolvedValue(undefined);
    renderTable({ onCellEdit });
    selectRow("Alpha");
    selectRow("Charlie");

    openMenu(screen.getByLabelText(/set a field on the selected rows/i));
    // Only editable *select* columns are offered (Name is free text).
    expect(screen.queryByRole("menuitem", { name: "Name" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Status" }), { key: "ArrowRight" });
    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitem", { name: "Archived" }));
    });

    expect(onCellEdit).toHaveBeenCalledTimes(2);
    expect(onCellEdit).toHaveBeenCalledWith(data[0], "status", "archived");
    expect(onCellEdit).toHaveBeenCalledWith(data[2], "status", "archived");
  });

  it("isn't offered when the table isn't editable", () => {
    renderTable({});
    selectRow("Alpha");
    expect(screen.queryByLabelText(/set a field on the selected rows/i)).toBeNull();
  });
});
