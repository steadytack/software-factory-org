import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "../src/components/ui/sidebar";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { ManagedDataTable } from "../src/components/ui/ManagedDataTable";

// jsdom has no PointerEvent; without one, button and coordinates are lost.
if (!("PointerEvent" in window)) {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = class extends MouseEvent {};
}

// Phone layout: the table renders cards.
vi.mock("../src/hooks/use-mobile", () => ({ useIsMobile: () => true }));

type Row = { id: string; name: string };
const columns: ColumnDef<Row, unknown>[] = [{ id: "name", accessorKey: "name", header: "Name" }];
const data = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Bravo" },
];

function renderCards(onOpen = vi.fn()) {
  render(
    <TooltipProvider>
      <SidebarProvider>
        <MemoryRouter>
          <ManagedDataTable
            data={data}
            columns={columns}
            exportName="cards-test"
            autoHeight
            enableSelection
            onDeleteSelected={() => {}}
            renderMobileCard={(r) => (
              <button type="button" onClick={() => onOpen(r)}>
                {r.name}
              </button>
            )}
          />
        </MemoryRouter>
      </SidebarProvider>
    </TooltipProvider>,
  );
  return onOpen;
}

const card = (name: string) => screen.getByText(name).closest("li")!;
const longPress = (el: Element) => {
  fireEvent.pointerDown(el, { button: 0, clientX: 10, clientY: 10 });
  act(() => vi.advanceTimersByTime(500));
  fireEvent.pointerUp(el);
};

describe("card selection", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts with a long press, which doesn't also open the card", () => {
    const onOpen = renderCards();
    longPress(screen.getByText("Alpha"));
    fireEvent.click(screen.getByText("Alpha"));
    expect(card("Alpha")).toHaveAttribute("aria-selected", "true");
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole("toolbar", { name: "Selected rows" })).toHaveTextContent("1 selected");
  });

  it("toggles cards with a tap while selecting, and opens them again after", () => {
    const onOpen = renderCards();
    longPress(screen.getByText("Alpha"));
    fireEvent.click(screen.getByText("Alpha")); // the click that ends the press
    fireEvent.click(screen.getByText("Bravo"));
    expect(card("Bravo")).toHaveAttribute("aria-selected", "true");
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Clear selection"));
    fireEvent.click(screen.getByText("Bravo"));
    expect(onOpen).toHaveBeenCalledWith(data[1]);
  });

  it("isn't a long press if the finger moves (a scroll)", () => {
    renderCards();
    const el = screen.getByText("Alpha");
    fireEvent.pointerDown(el, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(el, { clientX: 10, clientY: 60 });
    act(() => vi.advanceTimersByTime(500));
    expect(card("Alpha")).toHaveAttribute("aria-selected", "false");
  });
});
