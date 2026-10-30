import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { __stubResponse } from "./setup";
import { HelpProvider } from "../src/help/HelpContext";
import { SidebarProvider } from "../src/components/ui/sidebar";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { SitesPage } from "../src/pages/SitesPage";

// UI audit 2026-09-30, UI-STATE-1: deleting a site is permanent and takes its surveys,
// comments and files with it, so it asks first. (It used to hide the row and delete after a
// 6-second Undo toast; two sites were lost that way during the audit.)
const SITE = {
  id: "s1",
  name: "Alpha Bridge",
  site_type: "bridge",
  status: "active",
  address: "A road",
  postcode: "SW1A 1AA",
  notes: null,
  latitude: 51.5,
  longitude: -0.12,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HelpProvider>
        <TooltipProvider>
          <SidebarProvider>
            <MemoryRouter>
              <SitesPage />
            </MemoryRouter>
          </SidebarProvider>
        </TooltipProvider>
      </HelpProvider>
    </QueryClientProvider>,
  );
}

function deleteRequests(): string[] {
  return (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    .map(([input, init]) => {
      const method = input instanceof Request ? input.method : (init as RequestInit | undefined)?.method;
      const url = input instanceof Request ? input.url : String(input);
      return `${method ?? "GET"} ${url.replace(/^https?:\/\/[^/]+/, "")}`;
    })
    .filter((line) => line.startsWith("DELETE"));
}

describe("deleting a site", () => {
  it("asks first, says what goes with it, and deletes only on confirm", async () => {
    __stubResponse("/api/auth/me", {
      email: "admin@example.com",
      role: "admin",
      is_admin: true,
      multi_user: true,
    });
    __stubResponse("/api/sites", { total: 1, items: [SITE] });
    renderPage();

    const trash = await screen.findByRole("button", { name: "Delete Alpha Bridge permanently" });
    await userEvent.click(trash);

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Alpha Bridge/)).toBeInTheDocument();
    expect(dialog).toHaveTextContent("permanently deleted");
    expect(dialog).toHaveTextContent("Its surveys, comments and files are deleted with it.");
    expect(dialog).toHaveTextContent("This cannot be undone.");
    expect(deleteRequests()).toEqual([]);

    // Cancel: nothing is sent.
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(deleteRequests()).toEqual([]);

    // Ask again and confirm: now it goes.
    await userEvent.click(screen.getByRole("button", { name: "Delete Alpha Bridge permanently" }));
    const again = await screen.findByRole("alertdialog");
    await userEvent.click(within(again).getByRole("button", { name: "Delete" }));
    await vi.waitFor(() => expect(deleteRequests()).toEqual(["DELETE /api/sites/s1"]));
  });
});
