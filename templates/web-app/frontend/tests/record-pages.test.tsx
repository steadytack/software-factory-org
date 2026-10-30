import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { describe, expect, it, vi } from "vitest";

import { __stubResponse } from "./setup";
import { HelpProvider } from "../src/help/HelpContext";
import { SidebarProvider } from "../src/components/ui/sidebar";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { ManagedDataTable } from "../src/components/ui/ManagedDataTable";
import { SurveyDetailPage } from "../src/pages/SurveyDetailPage";

const EMPTY = { total: 0, items: [] };
const ME = (role: string) => ({
  email: "u@example.com",
  display_name: null,
  role,
  is_admin: role === "admin",
  multi_user: true,
});

const SURVEY = {
  id: "sv1",
  site_id: "s1",
  site_name: "North Pier",
  surveyor: "A. Surveyor",
  survey_date: "2026-09-15",
  status: "draft",
  summary: "Deck and railings checked.",
  created_at: "2026-09-15T10:00:00Z",
  updated_at: "2026-09-16T10:00:00Z",
};

function renderPage(path: string, route: string, element: React.ReactElement, role = "editor") {
  __stubResponse("/api/auth/me", ME(role));
  for (const p of ["/api/comments", "/api/attachments", "/api/changelog", "/api/sites/geo"]) {
    __stubResponse(p, EMPTY);
  }
  const router = createMemoryRouter([{ path: route, element }], { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <HelpProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </HelpProvider>
    </QueryClientProvider>,
  );
  return router;
}

const details = () => screen.getByText("Details").closest("[data-slot=card]") as HTMLElement;

/** Radix menus open from the keyboard (or pointerdown), not click. */
function openMoreActions() {
  const trigger = screen.getByRole("button", { name: "More actions" });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
}

describe("survey page", () => {
  it("shows the survey's facts, with its site linked", async () => {
    __stubResponse("/api/surveys/sv1", SURVEY);
    renderPage("/surveys/sv1", "/surveys/:surveyId", <SurveyDetailPage />);
    expect(await screen.findByRole("heading", { name: "Survey · 15 Sept 2026" })).toBeInTheDocument();
    expect(screen.getByText("Deck and railings checked.")).toBeInTheDocument();
    expect(within(details()).getByRole("link", { name: "North Pier" })).toHaveAttribute("href", "/sites/s1");
    expect(within(details()).getByText("A. Surveyor")).toBeInTheDocument();
  });

  it("gives an editor Edit and Mark completed, but not Delete", async () => {
    __stubResponse("/api/surveys/sv1", SURVEY);
    renderPage("/surveys/sv1", "/surveys/:surveyId", <SurveyDetailPage />);
    await screen.findByRole("button", { name: /edit survey/i });
    openMoreActions();
    expect(await screen.findByRole("menuitem", { name: /mark completed/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /delete survey/i })).toBeNull();
  });

  it("shows a viewer no controls", async () => {
    __stubResponse("/api/surveys/sv1", SURVEY);
    renderPage("/surveys/sv1", "/surveys/:surveyId", <SurveyDetailPage />, "viewer");
    await screen.findByRole("heading", { name: /survey ·/i });
    expect(screen.queryByRole("button", { name: /edit survey/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });
});

describe("tables without a side panel", () => {
  it("open a row's page when the row is clicked", () => {
    const onRowOpen = vi.fn();
    const columns: ColumnDef<{ id: string; name: string }, unknown>[] = [
      { id: "name", accessorKey: "name", header: "Name" },
    ];
    render(
      <TooltipProvider>
        <SidebarProvider>
          <RouterProvider
            router={createMemoryRouter([
              {
                path: "/",
                element: (
                  <ManagedDataTable
                    data={[{ id: "r1", name: "Pier" }]}
                    columns={columns}
                    exportName="open-test"
                    autoHeight
                    onRowOpen={onRowOpen}
                  />
                ),
              },
            ])}
          />
        </SidebarProvider>
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByText("Pier"));
    expect(onRowOpen).toHaveBeenCalledWith({ id: "r1", name: "Pier" });
  });
});
