import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { __stubResponse } from "./setup";
import { SidebarProvider } from "../src/components/ui/sidebar";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { SitesPage } from "../src/pages/SitesPage";
import { SurveysPage } from "../src/pages/SurveysPage";
import { UsersPanel } from "../src/components/UsersPanel";
import { SiteSurveysPanel } from "../src/components/SiteSurveysPanel";
import type { components } from "../src/types/openapi";

// Every list of records is a managed table whose columns cover every field of the record, with a
// relevant set shown by default and the rest in the Columns menu (DESIGN.md, Tables). The records here
// are typed as the API's, so a field added to the API without a column fails tsc or these tests.

type Site = components["schemas"]["SiteRead"];
type Survey = components["schemas"]["SurveyRead"];
type User = components["schemas"]["UserRead"];

const SITE: Required<Site> = {
  id: "s1",
  name: "North Pier",
  site_type: "bridge",
  status: "active",
  address: "1 Harbour Road",
  postcode: "AB1 2CD",
  notes: "Gate code at the office",
  latitude: 51.5,
  longitude: -0.12,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-20T10:00:00Z",
};

const SURVEY: Required<Survey> = {
  id: "v1",
  site_id: "s1",
  site_name: "North Pier",
  surveyor: "Sam",
  survey_date: "2026-09-10",
  status: "draft",
  summary: "Railings loose",
  created_at: "2026-09-10T10:00:00Z",
  updated_at: "2026-09-11T10:00:00Z",
};

const USER: User = {
  id: "u1",
  email: "sam@example.com",
  display_name: "Sam",
  role: "editor",
  is_admin: false,
  is_active: true,
  is_bootstrap: false,
  last_login_at: null,
  created_at: "2026-09-01T10:00:00Z",
};

/** Each field's column label. Ids are keys, not data a person reads: a record's own id opens it, and a
 *  survey's site_id is its Site column (site_name). `is_active` is the user's Status. */
const SITE_COLUMNS: Record<Exclude<keyof Site, "id">, string> = {
  name: "Name",
  site_type: "Type",
  status: "Status",
  address: "Address",
  postcode: "Postcode",
  notes: "Notes",
  latitude: "Latitude",
  longitude: "Longitude",
  created_at: "Added",
  updated_at: "Updated",
};
const SURVEY_COLUMNS: Record<Exclude<keyof Survey, "id" | "site_id">, string> = {
  site_name: "Site",
  surveyor: "Surveyor",
  survey_date: "Date",
  status: "Status",
  summary: "Summary",
  created_at: "Added",
  updated_at: "Updated",
};
const USER_COLUMNS: Record<Exclude<keyof User, "id">, string> = {
  email: "Email",
  display_name: "Name",
  role: "Role",
  is_admin: "Admin",
  is_active: "Status",
  is_bootstrap: "Bootstrap",
  last_login_at: "Last login",
  created_at: "Added",
};

function renderUi(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <SidebarProvider>
            <MemoryRouter>{ui}</MemoryRouter>
          </SidebarProvider>
        </TooltipProvider>
    </QueryClientProvider>,
  );
}

const shown = () =>
  screen.getAllByRole("columnheader").map((h) => h.textContent?.trim() ?? "").filter(Boolean);

function expectEveryField(labels: Record<string, string>, defaults: string[]) {
  // a relevant default set is shown
  for (const label of defaults) expect(shown().some((l) => l.startsWith(label))).toBe(true);
  // the rest are not shown, but each waits in the Columns menu
  const hidden = Object.values(labels).filter((l) => !defaults.includes(l));
  for (const label of hidden) expect(shown().some((l) => l.startsWith(label))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Columns" }));
  for (const label of Object.values(labels)) {
    expect(screen.getByRole("checkbox", { name: label })).toBeInTheDocument();
  }
}

beforeEach(() => {
  localStorage.clear();
  __stubResponse("/api/auth/me", { email: "admin@example.com", role: "admin", is_admin: true, multi_user: true });
});

describe("every list of records is a managed table covering every field", () => {
  it("Sites", async () => {
    __stubResponse("/api/sites", { total: 1, items: [SITE] });
    renderUi(<SitesPage />);
    await screen.findByRole("link", { name: "North Pier" });
    expectEveryField(SITE_COLUMNS, ["Name", "Type", "Status", "Address", "Postcode"]);
    expect(screen.getByRole("button", { name: "Filter Status" })).toBeInTheDocument();
  });

  it("Surveys", async () => {
    __stubResponse("/api/surveys", { total: 1, items: [SURVEY] });
    __stubResponse("/api/sites", { total: 1, items: [SITE] });
    renderUi(<SurveysPage />);
    await screen.findByRole("link", { name: "North Pier" });
    expectEveryField(SURVEY_COLUMNS, ["Date", "Site", "Surveyor", "Status", "Summary"]);
    expect(screen.getByRole("button", { name: "Filter Date" })).toBeInTheDocument();
  });

  it("Users", async () => {
    __stubResponse("/api/users", [USER]);
    renderUi(<UsersPanel myEmail="admin@example.com" />);
    await screen.findByText("sam@example.com");
    expectEveryField(USER_COLUMNS, ["Email", "Name", "Role", "Status", "Last login"]);
    expect(screen.getByRole("button", { name: "Filter Role" })).toBeInTheDocument();
  });

  it("a site's surveys (once a plain list) are a managed table too", async () => {
    __stubResponse("/api/surveys", { total: 1, items: [SURVEY] });
    renderUi(<SiteSurveysPanel site={{ id: "s1", name: "North Pier" }} onAddSurvey={() => {}} />);
    await screen.findByRole("table");
    const { site_name: _site, ...rest } = SURVEY_COLUMNS; // the page is the site's own
    expectEveryField(rest, ["Date", "Status", "Surveyor", "Summary"]);
    expect(screen.getByRole("button", { name: "Filter Status" })).toBeInTheDocument();
  });
});
