import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OutboxEntry } from "../src/lib/outbox";

// What's waiting in the outbox (normally IndexedDB).
const waiting: OutboxEntry[] = [];
vi.mock("../src/lib/outbox", async (importActual) => ({
  ...(await importActual<typeof import("../src/lib/outbox")>()),
  snapshot: () => waiting,
}));

const { useAllSurveys, useSurvey } = await import("../src/hooks/useSurveys");
const { useAllSites } = await import("../src/hooks/useSites");
const { useComments } = await import("../src/hooks/useComments");
const { isPending, isPendingCreate, newId } = await import("../src/lib/pendingRecords");
const { __stubResponse } = await import("./setup");

let n = 0;
function queue(method: string, url: string, body?: object) {
  waiting.push({
    id: `o${++n}`,
    createdAt: `2026-09-26T10:00:0${n}Z`,
    owner: "u@example.com",
    method,
    url,
    label: "",
    body: body && JSON.stringify(body),
  });
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["sites", "all-pages"], { total: 1, items: [{ id: "s1", name: "Pier" }] });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

// The API client holds the setup's fetch stub, so swap its implementation.
const stub = vi.mocked(globalThis.fetch);
const stubbed = stub.getMockImplementation()!;

describe("records made offline", () => {
  afterEach(() => {
    waiting.length = 0;
    stub.mockImplementation(stubbed);
  });

  it("appear in the right lists, with parent names, before they upload", async () => {
    __stubResponse("/api/surveys", { total: 1, items: [{ id: "sv0", site_id: "s1", status: "completed" }] });
    queue("POST", "/api/surveys", { id: "sv1", site_id: "s1", surveyor: "A", survey_date: "2026-09-26" });
    queue("POST", "/api/surveys", { id: "sv2", site_id: "s2", surveyor: "B", survey_date: "2026-09-26" });
    const w = wrapper();
    const onSite = renderHook(() => useAllSurveys({ siteId: "s1" }), { wrapper: w });
    await waitFor(() => expect(onSite.result.current.data?.items.map((s) => s.id)).toEqual(["sv1", "sv0"]));
    const made = onSite.result.current.data!.items[0];
    expect(isPending(made)).toBe(true);
    expect(made).toMatchObject({ site_name: "Pier", status: "draft" });
    expect(onSite.result.current.data?.total).toBe(2);
  });

  it("open on their own page, with later edits, and have nothing on the server yet", async () => {
    stub.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
    queue("POST", "/api/surveys", { id: "sv1", site_id: "s1", surveyor: "A", survey_date: "2026-09-26" });
    queue("PATCH", "/api/surveys/sv1", { summary: "Deck checked" });
    const { result } = renderHook(() => useSurvey("sv1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toMatchObject({ surveyor: "A", summary: "Deck checked" }));
    expect(isPendingCreate("survey", "sv1")).toBe(true);
    expect(isPendingCreate("survey", "other")).toBe(false);
  });

  it("hide deletions and show edits to existing records", async () => {
    __stubResponse("/api/sites", { total: 2, items: [{ id: "a", name: "A" }, { id: "b", name: "B" }] });
    queue("DELETE", "/api/sites/a");
    queue("PATCH", "/api/sites/b", { name: "B2" });
    const { result } = renderHook(() => useAllSites(), { wrapper: wrapper() });
    await waitFor(() =>
      expect(result.current.data?.items).toEqual([expect.objectContaining({ id: "b", name: "B2", pending: true })]),
    );
  });

  it("show a waiting comment even with no signal", async () => {
    stub.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
    queue("POST", "/api/comments", { id: "c1", entity: "site", entity_id: "s1", text: "Gate locked" });
    const { result } = renderHook(() => useComments("site", "s1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.items.map((c) => c.text)).toEqual(["Gate locked"]));
  });

  it("get UUIDs", () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
