import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSite } from "../src/hooks/useSites";
import { useAllSurveys, useSurvey } from "../src/hooks/useSurveys";
import { useBackgroundSync } from "../src/lib/backgroundSync";
import { __stubResponse } from "./setup";

const SV1 = { id: "sv1", site_id: "s1", survey_date: "2026-09-01", surveyor: "Jo", status: "draft" };
const SV2 = { id: "sv2", site_id: "s2", survey_date: "2026-09-02", surveyor: "Sam", status: "completed" };
const SV3 = { id: "sv3", site_id: "s1", survey_date: "2026-09-03", surveyor: "Kit", status: "completed" };
const FULL_SURVEYS = ["surveys", "all-pages", "any", undefined, undefined, undefined, undefined];

// The API client holds the setup's fetch stub, so swap its implementation.
const stub = vi.mocked(globalThis.fetch);
const stubbed = stub.getMockImplementation()!;
const noSignal = () =>
  stub.mockImplementation(async () => {
    throw new TypeError("Failed to fetch");
  });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(FULL_SURVEYS, { total: 3, items: [SV1, SV2, SV3] });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe("offline answers from the synced lists", () => {
  afterEach(() => stub.mockImplementation(stubbed));

  it("opens a record never visited", async () => {
    noSignal();
    const { wrapper } = setup();
    const { result } = renderHook(() => useSurvey("sv2"), { wrapper });
    await waitFor(() => expect(result.current.data).toMatchObject({ surveyor: "Sam" }));
  });

  it("scopes a site's surveys", async () => {
    noSignal();
    const { wrapper } = setup();
    const bySite = renderHook(() => useAllSurveys({ siteId: "s1" }), { wrapper });
    await waitFor(() => expect(bySite.result.current.data?.items.map((sv) => sv.id)).toEqual(["sv1", "sv3"]));
  });

  it("still fails when nothing on the device matches", async () => {
    noSignal();
    const { wrapper } = setup();
    const missing = renderHook(() => useSurvey("nope"), { wrapper });
    const site = renderHook(() => useSite("s1"), { wrapper });
    await waitFor(() => expect(missing.result.current.isError).toBe(true));
    await waitFor(() => expect(site.result.current.isError).toBe(true));
  });

  it("doesn't mask a server answer", async () => {
    __stubResponse("/api/surveys/sv2", { detail: "Not found" }, 404);
    const { wrapper } = setup();
    const { result } = renderHook(() => useSurvey("sv2"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("background sync", () => {
  it("downloads every list once there's a signal", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    for (const p of ["/api/sites", "/api/surveys"]) {
      __stubResponse(p, { total: 0, items: [] });
    }
    const client = new QueryClient();
    renderHook(() => useBackgroundSync(true), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    await vi.advanceTimersByTimeAsync(2500);
    vi.useRealTimers();
    await waitFor(() => expect(localStorage.getItem("webapp-last-sync")).not.toBeNull());
    expect(client.getQueryData(["sites", "all-pages"])).toEqual({ total: 0, items: [] });
    expect(client.getQueryData(FULL_SURVEYS)).toEqual({ total: 0, items: [] });
  });
});
