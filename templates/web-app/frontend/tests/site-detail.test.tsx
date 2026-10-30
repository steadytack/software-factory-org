import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { __stubResponse } from "./setup";
import { HelpProvider } from "../src/help/HelpContext";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { SiteDetailPage } from "../src/pages/SiteDetailPage";
import { sitesListHref } from "../src/lib/listContext";

const SITE = {
  id: "s1",
  name: "North Pier",
  site_type: "bridge",
  status: "active",
  address: "1 Harbour Road",
  latitude: 51.5,
  longitude: -0.12,
  notes: null,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-20T10:00:00Z",
};

const ME = (role: string) => ({
  email: "u@example.com",
  display_name: null,
  role,
  is_admin: role === "admin",
  multi_user: true,
});

const EMPTY = { total: 0, items: [] };

function renderSite(initialState?: unknown, role = "editor") {
  __stubResponse("/api/auth/me", ME(role));
  // The Overview's "At a glance" card and the tab counts.
  for (const path of ["/api/surveys", "/api/findings", "/api/actions", "/api/changelog"]) {
    __stubResponse(path, EMPTY);
  }
  const router = createMemoryRouter(
    [
      { path: "/sites/:siteId", element: <SiteDetailPage /> },
      { path: "/sites", element: <p>Sites list</p> },
    ],
    { initialEntries: [{ pathname: "/sites/s1", state: initialState }] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <HelpProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </HelpProvider>
    </QueryClientProvider>,
  );
  return router;
}

describe("SiteDetailPage unsaved-changes guard", () => {
  it("asks before leaving with unsaved edits, and Stay keeps the page", async () => {
    __stubResponse("/api/sites/s1", SITE);
    const router = renderSite();
    const name = await screen.findByLabelText(/^name/i);
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
    await userEvent.type(name, " East");
    expect(screen.getByRole("region", { name: "Unsaved changes" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: "Sites" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(/you have unsaved changes/i);

    await userEvent.click(screen.getByRole("button", { name: /^stay$/i }));
    expect(router.state.location.pathname).toBe("/sites/s1");
    expect(screen.getByLabelText(/^name/i)).toHaveValue("North Pier East");
  });

  it("Leave without saving navigates away", async () => {
    __stubResponse("/api/sites/s1", SITE);
    const router = renderSite();
    await userEvent.type(await screen.findByLabelText(/^name/i), "!");
    await userEvent.click(screen.getByRole("link", { name: "Sites" }));
    await userEvent.click(await screen.findByRole("button", { name: /leave without saving/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/sites"));
  });

  it("does not ask when nothing changed", async () => {
    __stubResponse("/api/sites/s1", SITE);
    const router = renderSite();
    await screen.findByLabelText(/^name/i);
    await userEvent.click(screen.getByRole("link", { name: "Sites" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/sites"));
  });

  it("links back to the list view the user came from", async () => {
    __stubResponse("/api/sites/s1", SITE);
    renderSite({ from: "/sites?q=pier&sort=name" });
    const crumb = await screen.findByRole("link", { name: "Sites" });
    expect(crumb).toHaveAttribute("href", "/sites?q=pier&sort=name");
  });
});

/** Radix menus open from the keyboard (or pointerdown), not click. */
function openMoreActions() {
  const trigger = screen.getByRole("button", { name: "More actions" });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
}

describe("SiteDetailPage save bar", () => {
  it("appears only with unsaved changes, and Discard puts the values back", async () => {
    __stubResponse("/api/sites/s1", SITE);
    renderSite();
    const name = await screen.findByLabelText(/^name/i);
    expect(screen.queryByRole("button", { name: /^save/i })).toBeNull();
    await userEvent.type(name, " East");
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByLabelText(/^name/i)).toHaveValue("North Pier");
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
  });
});

describe("SiteDetailPage roles", () => {
  it("shows a viewer the record read-only, with no write controls", async () => {
    __stubResponse("/api/sites/s1", SITE);
    renderSite(undefined, "viewer");
    const name = await screen.findByLabelText(/^name/i);
    expect(name).toBeDisabled();
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
    expect(screen.queryByRole("button", { name: /add survey/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /add finding/i })).toBeNull();
  });

  it("lets an editor edit but not delete", async () => {
    __stubResponse("/api/sites/s1", SITE);
    renderSite(undefined, "editor");
    expect(await screen.findByLabelText(/^name/i)).toBeEnabled();
    openMoreActions();
    expect(await screen.findByRole("menuitem", { name: /archive site/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /delete site/i })).toBeNull();
  });

  it("gives an admin delete too", async () => {
    __stubResponse("/api/sites/s1", SITE);
    renderSite(undefined, "admin");
    await screen.findByLabelText(/^name/i);
    openMoreActions();
    expect(await screen.findByRole("menuitem", { name: /delete site/i })).toBeInTheDocument();
  });
});

describe("sitesListHref", () => {
  it("only accepts same-app /sites origins", () => {
    expect(sitesListHref({ from: "/sites?q=a" })).toBe("/sites?q=a");
    expect(sitesListHref({ from: "//evil.example/sites" })).toBe("/sites");
    expect(sitesListHref({ from: "https://evil.example" })).toBe("/sites");
    expect(sitesListHref({ from: "/sitesX" })).toBe("/sites");
    expect(sitesListHref(null)).toBe("/sites");
  });
});
