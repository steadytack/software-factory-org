import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { __stubResponse } from "./setup";
import { RequireAuth } from "../src/components/RequireAuth";
import { LoginPage } from "../src/pages/LoginPage";

const ME = { email: "u@example.com", display_name: null, role: "editor", is_admin: false, multi_user: true };

function Here() {
  const l = useLocation();
  return <p data-testid="here">{l.pathname + l.search + l.hash}</p>;
}

describe("signing in from a shared link", () => {
  it("returns to the full link — filters and anchor included", async () => {
    __stubResponse("/api/auth/me", { detail: "Not authenticated" }, 401);
    __stubResponse("/api/auth/refresh", { detail: "Not authenticated" }, 401);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/findings?status=open&severity=high#list"]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route path="*" element={<Here />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const email = await screen.findByLabelText(/email/i);
    await userEvent.type(email, "u@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "Some#Password#1");
    __stubResponse("/api/auth/login", { status: "authenticated" });
    __stubResponse("/api/auth/me", ME);
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() =>
      expect(screen.getByTestId("here")).toHaveTextContent("/findings?status=open&severity=high#list"),
    );
  });
});

describe("signing in when the account can't sign in here", () => {
  it("shows the server's reason, not a password error", async () => {
    __stubResponse("/api/auth/me", { detail: "Not authenticated" }, 401);
    __stubResponse("/api/auth/refresh", { detail: "Not authenticated" }, 401);
    __stubResponse(
      "/api/auth/login",
      { detail: "Sign-in is limited to the administrator in single-user mode" },
      403,
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/login"]}>
          <LoginPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await userEvent.type(await screen.findByLabelText(/email/i), "plain@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "Plain#User#1");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText(/limited to the administrator in single-user mode/i)).toBeInTheDocument();
  });
});
