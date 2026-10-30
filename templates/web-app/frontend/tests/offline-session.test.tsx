import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { __stubResponse } from "./setup";
import { useAuth } from "../src/hooks/useAuth";
import { loadSession } from "../src/lib/session";

const ME = { email: "u@example.com", display_name: null, role: "editor", is_admin: false, multi_user: true };

function renderAuth() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useAuth(), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("offline session", () => {
  // The API client holds the setup's fetch stub, so swap its implementation.
  const stub = vi.mocked(globalThis.fetch);
  const stubbed = stub.getMockImplementation()!;
  const noSignal = () =>
    stub.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
  afterEach(() => {
    stub.mockImplementation(stubbed);
    localStorage.clear();
  });

  it("remembers the session, and keeps you signed in when the server can't be reached", async () => {
    __stubResponse("/api/auth/me", ME);
    const online = renderAuth();
    await waitFor(() => expect(online.result.current.isAuthed).toBe(true));
    expect(loadSession()?.me).toMatchObject({ email: "u@example.com" });

    noSignal();
    const offline = renderAuth();
    await waitFor(() => expect(offline.result.current.isAuthed).toBe(true));
    expect(offline.result.current.offline).toBe(true);
    expect(offline.result.current.role).toBe("editor");
  });

  it("signs you out on a 401 even with a saved session", async () => {
    localStorage.setItem("webapp-session", JSON.stringify({ me: ME, savedAt: "" }));
    __stubResponse("/api/auth/me", { detail: "Not authenticated" }, 401);
    __stubResponse("/api/auth/refresh", { detail: "Not authenticated" }, 401);
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthed).toBe(false);
    expect(loadSession()).toBeNull();
  });

  it("stays signed out offline with no saved session", async () => {
    noSignal();
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthed).toBe(false);
  });
});
