import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { __stubResponse } from "./setup";
import { SidebarProvider } from "../src/components/ui/sidebar";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { LoginPage } from "../src/pages/LoginPage";
import { SitesPage } from "../src/pages/SitesPage";
import { ProfilePage } from "../src/pages/ProfilePage";
import { loadPrefs } from "../src/lib/prefs";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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

describe("LoginPage", () => {
  it("renders email and password fields", () => {
    __stubResponse("/api/auth/login", { status: "authenticated" });
    renderWithProviders(<LoginPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("shows an error on failed login", async () => {
    __stubResponse("/api/auth/login", { detail: "Invalid credentials" }, 401);
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.c");
    await userEvent.type(screen.getByLabelText(/password/i), "nope");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/login failed/i);
  });
});

describe("SitesPage", () => {
  it("shows the empty state", async () => {
    __stubResponse("/api/sites", { total: 0, items: [] });
    __stubResponse("/api/auth/me", { email: "admin@example.com" });
    renderWithProviders(<SitesPage />);
    expect(await screen.findByText(/no sites yet/i)).toBeInTheDocument();
  });
});

describe("ProfilePage", () => {
  it("says what the role can do on hover, and saves preferences when you leave a field", async () => {
    __stubResponse("/api/auth/me", {
      email: "sam@example.com",
      display_name: null,
      role: "editor",
      is_admin: false,
      multi_user: true,
    });
    renderWithProviders(<ProfilePage />);
    // What the role allows is a tooltip on the role badge now, not a paragraph on the card.
    await userEvent.hover(await screen.findByText("Editor"));
    expect((await screen.findAllByText(/Record and edit sites and surveys/)).length).toBeGreaterThan(0);
    // There is no Save button: preferences save themselves.
    expect(screen.queryByRole("button", { name: "Save preferences" })).not.toBeInTheDocument();
    // Nothing changed yet, so nothing is saved or announced.
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    await userEvent.type(screen.getByLabelText("Display name"), "Sam Surveyor");
    // Leaving the field saves it.
    await userEvent.tab();
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    expect(loadPrefs().displayName).toBe("Sam Surveyor");
    // The card shows the new name and its initials.
    expect(screen.getByText("SS")).toBeInTheDocument();
  });
});
