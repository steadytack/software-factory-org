import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "../src/components/ui/sidebar";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { ManagedDataTable } from "../src/components/ui/ManagedDataTable";

// Direct DOM events rather than user-event: with Radix popovers and
// tooltips in the tree, user-event's pointer/visibility emulation in jsdom
// intermittently takes 10+ seconds per step, which made these tests flaky.
// What's under test is the table's handling of change / Enter / Escape /
// blur, which fireEvent drives exactly.

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

function renderTable(onCellEdit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <TooltipProvider>
      <SidebarProvider>
        <MemoryRouter>
          <ManagedDataTable
            data={[{ id: "r1", name: "Pier", status: "active" }]}
            columns={columns}
            exportName="t"
            onCellEdit={onCellEdit}
            autoHeight
          />
        </MemoryRouter>
      </SidebarProvider>
    </TooltipProvider>,
  );
  return onCellEdit;
}

function openCell(text: string) {
  fireEvent.click(screen.getByLabelText(/^edit mode$/i));
  fireEvent.click(within(screen.getByRole("table")).getByText(text));
}

const nameInput = () => screen.getByLabelText(/edit name/i) as HTMLInputElement;

describe("inline cell editing", () => {
  it("does not save a changed text cell when you tab away", () => {
    const onCellEdit = renderTable();
    openCell("Pier");
    fireEvent.change(nameInput(), { target: { value: "Pier East" } });
    act(() => nameInput().blur());
    expect(onCellEdit).not.toHaveBeenCalled();
    // Still open, still holding the unsaved text.
    expect(nameInput()).toHaveValue("Pier East");
  });

  it("saves a text cell on Enter", () => {
    const onCellEdit = renderTable();
    openCell("Pier");
    fireEvent.change(nameInput(), { target: { value: "Pier East" } });
    fireEvent.keyDown(nameInput(), { key: "Enter" });
    expect(onCellEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }), "name", "Pier East");
  });

  it("does not call the server for an unchanged value", () => {
    const onCellEdit = renderTable();
    openCell("Pier");
    fireEvent.keyDown(nameInput(), { key: "Enter" });
    expect(onCellEdit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/edit name/i)).toBeNull();
  });

  it("Escape discards the change", () => {
    const onCellEdit = renderTable();
    openCell("Pier");
    fireEvent.change(nameInput(), { target: { value: "Pier X" } });
    fireEvent.keyDown(nameInput(), { key: "Escape" });
    expect(onCellEdit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/edit name/i)).toBeNull();
  });

  it("saves a select cell when an option is picked", () => {
    const onCellEdit = renderTable();
    openCell("active");
    const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (o) => o.textContent === "Archived",
    );
    if (!option) throw new Error("Archived option not rendered");
    act(() => option.focus());
    fireEvent.keyDown(option, { key: "Enter" });
    expect(onCellEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }), "status", "archived");
  });
});
