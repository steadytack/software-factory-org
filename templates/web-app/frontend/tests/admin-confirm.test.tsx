import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { __stubResponse } from "./setup";
import { HelpProvider } from "../src/help/HelpContext";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { AdminPage } from "../src/pages/AdminPage";

const calls = (path: string) =>
  (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([input]) =>
    String(input instanceof Request ? input.url : input).includes(path),
  ).length;

function renderAdmin() {
  __stubResponse("/api/auth/me", { email: "admin@example.com", display_name: null, role: "admin", is_admin: true, multi_user: false });
  __stubResponse("/api/admin/stats", { counts: {}, storage: null });
  __stubResponse("/api/admin/db-health", { status: "ok", postgis_version: "3.5 USE_GEOS=1" });
  __stubResponse("/api/admin/reseed", { detail: "Seeded." });
  __stubResponse("/api/admin/orphans", { removed: {} });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HelpProvider>
        <TooltipProvider>
          <MemoryRouter>
            <AdminPage />
          </MemoryRouter>
        </TooltipProvider>
      </HelpProvider>
    </QueryClientProvider>,
  );
}

describe("Admin maintenance jobs", () => {
  it("ask first, and do nothing if you cancel", async () => {
    renderAdmin();
    await userEvent.click(await screen.findByRole("button", { name: "Re-seed demo data" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Re-seed demo data?");
    expect(calls("/api/admin/reseed")).toBe(0);

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(calls("/api/admin/reseed")).toBe(0);
  });

  it("runs the job only after you confirm", async () => {
    renderAdmin();
    await userEvent.click(await screen.findByRole("button", { name: "Clean orphaned records" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("cannot be undone");
    expect(calls("/api/admin/orphans")).toBe(0);

    await userEvent.click(screen.getByRole("button", { name: "Clean up" }));
    await waitFor(() => expect(calls("/api/admin/orphans")).toBe(1));
  });
});
