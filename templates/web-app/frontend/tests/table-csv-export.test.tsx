import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "../src/components/ui/sidebar";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { ManagedDataTable } from "../src/components/ui/ManagedDataTable";

// The CSV export is the table's one output other programs read, and it carries
// several deliberate rules: this pins them.
type Row = { id: string; name: string; note: string | null; lat: number; lng: number };

const columns: ColumnDef<Row, unknown>[] = [
  { id: "name", accessorKey: "name", header: "Name" },
  { id: "note", accessorKey: "note", header: "Note" },
  // Draws from row.original with no accessor, so it needs `exportColumns`.
  {
    id: "coordinates",
    header: "Coordinates",
    cell: ({ row }) => `${row.original.lat}, ${row.original.lng}`,
  },
  // Render-only and no export entry: must not appear in the file.
  { id: "actions", header: "", cell: () => <button>Open</button> },
];
const data: Row[] = [
  { id: "c", name: "Charlie", note: null, lat: 51.5, lng: -0.12 },
  { id: "a", name: "=SUM(A1)", note: "plain", lat: 52, lng: -1 },
  { id: "b", name: "Bravo, Ltd", note: "", lat: 53, lng: -2 },
];

let blob: Blob | undefined;
let bytes = new Uint8Array();

function readBlob(b: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(b);
  });
}

async function exportedCsv(sortBy?: string): Promise<string> {
  blob = undefined;
  URL.createObjectURL = vi.fn((b: Blob) => {
    blob = b;
    return "blob:test";
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  render(
    <TooltipProvider>
      <SidebarProvider>
        <MemoryRouter>
          <ManagedDataTable
            data={data}
            columns={columns}
            exportName="sites-test"
            autoHeight
            exportColumns={{ coordinates: (row) => ({ latitude: row.lat, longitude: row.lng }) }}
          />
        </MemoryRouter>
      </SidebarProvider>
    </TooltipProvider>,
  );
  if (sortBy) fireEvent.click(screen.getByRole("button", { name: new RegExp(sortBy) }));
  fireEvent.click(screen.getByLabelText("Export as CSV"));
  expect(blob).toBeDefined();
  bytes = new Uint8Array(await readBlob(blob!));
  // The BOM is stripped by any text decoder, so it is checked on the bytes.
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
}

describe("CSV export", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes a BOM, CRLF lines, expanded columns and skips render-only ones", async () => {
    const text = await exportedCsv();
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text.startsWith("﻿")).toBe(true);
    const lines = text.slice(1).split("\r\n");
    // Header: real column titles; `coordinates` becomes latitude + longitude;
    // the accessor-less `actions` column is left out.
    expect(lines[0]).toBe("Name,Note,latitude,longitude");
    expect(lines).toHaveLength(4);
  });

  it("guards formulas, quotes commas and marks a missing value", async () => {
    const lines = (await exportedCsv()).slice(1).split("\r\n");
    // Audit R2-EXP-1 (2026-09-29): the formula guard used to prefix plain
    // negative numbers too, so a west-of-Greenwich longitude exported as text.
    expect(lines[1]).toBe("Charlie,—,51.5,-0.12");
    expect(lines[2]).toBe("'=SUM(A1),plain,52,-1");
    expect(lines[3]).toBe('"Bravo, Ltd",,53,-2');
  });

  it("follows the sort the user applied", async () => {
    const lines = (await exportedCsv("Name")).slice(1).split("\r\n");
    // Ascending by name: "=SUM" < "Bravo" < "Charlie".
    expect(lines.slice(1).map((l) => l.split(",")[0])).toEqual(["'=SUM(A1)", '"Bravo', "Charlie"]);
  });

  it("names the file after the table", async () => {
    let downloaded = "";
    const original = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = original(tag);
      if (tag === "a") Object.defineProperty(el, "download", { set: (v) => (downloaded = v), get: () => downloaded });
      return el;
    });
    await exportedCsv();
    expect(downloaded).toBe("sites-test.csv");
  });
});
