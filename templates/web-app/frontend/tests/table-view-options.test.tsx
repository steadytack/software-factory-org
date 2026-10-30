import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { SidebarProvider } from "../src/components/ui/sidebar";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { ManagedDataTable } from "../src/components/ui/ManagedDataTable";
import { loadPrefs, savePrefs } from "../src/lib/prefs";

// fireEvent rather than user-event, for the same reason as inline-edit.test.

type Row = { id: string; name: string; notes: string };

const columns: ColumnDef<Row, unknown>[] = [
  { id: "name", accessorKey: "name", header: "Name" },
  {
    id: "notes",
    accessorKey: "notes",
    header: "Notes",
    meta: { maxWidth: "10rem" },
  },
];

/** Column widths are per table; display options are one profile setting. */
const WIDTHS_KEY = "table-view:view-test";

function table(props: { hideToolbar?: boolean; enableSelection?: boolean; exportName?: string } = {}) {
  return (
    <ManagedDataTable
      data={[{ id: "r1", name: "Pier", notes: "A long note about the pier" }]}
      columns={columns}
      exportName="view-test"
      autoHeight
      {...props}
    />
  );
}

function renderTables(...tables: ReactElement[]) {
  return render(
    <TooltipProvider>
      <SidebarProvider>
        <MemoryRouter>
          {tables.map((t, i) => (
            <section key={i} aria-label={`table ${i}`}>
              {t}
            </section>
          ))}
        </MemoryRouter>
      </SidebarProvider>
    </TooltipProvider>,
  );
}
const renderTable = (props: Parameters<typeof table>[0] = {}) => renderTables(table(props));

const scroller = (root: ParentNode = document) =>
  root.querySelector("table")!.parentElement as HTMLElement;
const rowPy = (root?: ParentNode) => scroller(root).style.getPropertyValue("--row-py");
const headers = () => [...document.querySelectorAll("th")].map((th) => th.textContent);
const cellFor = (text: string) =>
  [...document.querySelectorAll("td")].find((td) => td.textContent === text)!;
const openMenu = (root: HTMLElement = document.body) =>
  fireEvent.click(within(root).getByLabelText(/view options/i));
const display = () => loadPrefs().table;
const storedWidths = () => JSON.parse(localStorage.getItem(WIDTHS_KEY) ?? "null");

describe("table display options", () => {
  beforeEach(() => localStorage.clear());

  describe("row density", () => {
    it("is dense by default", () => {
      renderTable();
      expect(rowPy()).toBe("0.125rem");
    });

    it("is one setting for every table: the gear in one changes them all", () => {
      renderTables(table(), table({ exportName: "other" }));
      const [first, second] = screen.getAllByRole("region");
      openMenu(first);
      fireEvent.click(screen.getByRole("radio", { name: /roomy/i }));
      expect(rowPy(first)).toBe("0.625rem");
      expect(rowPy(second)).toBe("0.625rem");
      expect(display().density).toBe("comfortable");
    });

    it("follows a change made in Profile straight away", () => {
      renderTable();
      act(() => savePrefs({ ...loadPrefs(), table: { ...display(), density: "compact" } }));
      expect(rowPy()).toBe("0.25rem");
    });

    it("applies to tables without a toolbar too", () => {
      savePrefs({ ...loadPrefs(), table: { density: "comfortable", wrap: true, freezeFirstColumn: false } });
      renderTable({ hideToolbar: true });
      expect(rowPy()).toBe("0.625rem");
      expect(cellFor("Pier").querySelector("div")!.className).toContain("whitespace-normal");
    });

    it("ignores the per-table density saved before it became one setting", () => {
      localStorage.setItem(WIDTHS_KEY, JSON.stringify({ density: "comfortable" }));
      localStorage.setItem("table-density:view-test", "comfortable");
      renderTable();
      expect(rowPy()).toBe("0.125rem");
    });
  });

  describe("wrap text", () => {
    it("lets cells wrap, including capped columns, instead of truncating", () => {
      renderTable();
      const notes = () => cellFor("A long note about the pier");
      expect(cellFor("Pier").className).toContain("whitespace-nowrap");
      expect(notes().querySelector("div")!.className).toContain("truncate");

      openMenu();
      fireEvent.click(screen.getByLabelText(/wrap text/i));
      expect(cellFor("Pier").querySelector("div")!.className).toContain("whitespace-normal");
      expect(notes().querySelector("div")!.className).toContain("whitespace-normal");
      // Capped columns wrap at their own cap; others at the default.
      expect(notes().querySelector("div")!.style.maxWidth).toBe("10rem");
      expect(cellFor("Pier").querySelector("div")!.style.maxWidth).toBe("20rem");
      expect(display().wrap).toBe(true);
    });
  });

  describe("freeze first column", () => {
    it("sticks the first data column to the left edge", () => {
      renderTable();
      openMenu();
      fireEvent.click(screen.getByLabelText(/freeze first column/i));
      expect(cellFor("Pier").className).toContain("sticky");
      expect(cellFor("Pier").style.left).toBe("0px");
      expect(cellFor("A long note about the pier").className).not.toContain("sticky");
      expect(display().freezeFirstColumn).toBe(true);
    });

    it("freezes the selection column too, with the data column after it", () => {
      savePrefs({ ...loadPrefs(), table: { density: "condensed", wrap: false, freezeFirstColumn: true } });
      renderTable({ enableSelection: true });
      const [selectCell] = document.querySelectorAll<HTMLElement>("tbody td");
      expect(selectCell.style.left).toBe("0px");
      expect(selectCell.style.width).toBe("2.5rem");
      expect(cellFor("Pier").style.left).toBe("2.5rem");
    });
  });

  describe("column widths (per table)", () => {
    const handle = () => screen.getByRole("separator", { name: "Resize Name column" });

    it("resizes from the keyboard, remembers the width, and resets on double-click", () => {
      renderTable();
      // jsdom has no layout, so the column measures as the 48px minimum.
      fireEvent.keyDown(handle(), { key: "ArrowRight" });
      expect(storedWidths()).toEqual({ columnWidths: { name: 64 } });
      expect(cellFor("Pier").querySelector("div")!.style.width).toBe("64px");

      fireEvent.keyDown(handle(), { key: "ArrowLeft" });
      fireEvent.keyDown(handle(), { key: "ArrowLeft" });
      expect(storedWidths()).toEqual({ columnWidths: { name: 48 } });

      fireEvent.doubleClick(handle());
      expect(localStorage.getItem(WIDTHS_KEY)).toBeNull();
      expect(cellFor("Pier").querySelector("div")).toBeNull();
    });

    it("isn't offered on the selection column", () => {
      renderTable({ enableSelection: true });
      expect(screen.getAllByRole("separator").map((h) => h.getAttribute("aria-label"))).toEqual([
        "Resize Name column",
        "Resize Notes column",
      ]);
    });

    it("keeps widths to their own table", () => {
      localStorage.setItem(WIDTHS_KEY, JSON.stringify({ columnWidths: { name: 200 } }));
      renderTables(table({ exportName: "other" }));
      expect(cellFor("Pier").querySelector("div")).toBeNull();
    });
  });

  describe("reset columns", () => {
    it("is disabled while the columns are at their defaults", () => {
      renderTable();
      openMenu();
      expect(screen.getByText("Reset columns").closest("button")).toBeDisabled();
    });

    it("restores this table's columns and widths, but not the shared display options", () => {
      localStorage.setItem(WIDTHS_KEY, JSON.stringify({ columnWidths: { notes: 200 } }));
      renderTable();
      fireEvent.click(screen.getByLabelText(/^columns$/i));
      fireEvent.click(screen.getByRole("checkbox", { name: "Name" }));
      expect(headers()).toEqual(["Notes"]);
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });

      openMenu();
      fireEvent.click(screen.getByRole("radio", { name: /roomy/i }));
      fireEvent.click(screen.getByText("Reset columns"));

      expect(headers()).toEqual(["Name", "Notes"]);
      expect(localStorage.getItem(WIDTHS_KEY)).toBeNull();
      expect(display().density).toBe("comfortable");
    });
  });
});
