import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { DeleteConfirmDialog } from "../src/components/DeleteConfirmDialog";
import { RecordFormDialog } from "../src/components/RecordFormDialog";
import { SearchModal } from "../src/search/SearchModal";

describe("DeleteConfirmDialog", () => {
  it("names the record and confirms", async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <DeleteConfirmDialog open name="North Pier" entityLabel="site" onConfirm={onConfirm} onClose={onClose} />,
    );
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(/delete site\?/i);
    expect(dialog).toHaveTextContent(/north pier/i);
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("RecordFormDialog", () => {
  it("renders labelled fields and submits", async () => {
    const onSubmit = vi.fn();
    render(
      <RecordFormDialog
        open
        title="Add site"
        fields={[{ name: "name", label: "Name", kind: "text", required: true }]}
        values={{ name: "Pier" }}
        onChange={() => {}}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByRole("dialog", { name: /add site/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toHaveValue("Pier");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});

describe("SearchModal", () => {
  it("opens with a focused search input", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <SearchModal open onClose={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search sites and surveys/i)).toBeInTheDocument();
  });
});
