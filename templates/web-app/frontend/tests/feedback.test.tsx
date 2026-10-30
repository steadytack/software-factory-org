import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/screenshot", () => ({
  captureScreen: vi.fn(async () => "data:image/jpeg;base64,/9j/AAAA"),
}));

import { __stubResponse } from "./setup";
import { FeedbackForm } from "../src/help/FeedbackForm";
import { collectDiagnostics, diagnosticsRows, parseBrowser, parseOS } from "../src/lib/diagnostics";
import { recentErrors, recordError } from "../src/lib/errorLog";

const UA = {
  chromeWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.92 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.68",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  firefoxMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36",
};

describe("diagnostics", () => {
  it("names the browser and system", () => {
    expect(parseBrowser(UA.chromeWin)).toEqual({ name: "Chrome", version: "130.0.6723.92" });
    expect(parseBrowser(UA.edge).name).toBe("Edge");
    expect(parseBrowser(UA.iphone)).toEqual({ name: "Safari", version: "17.6" });
    expect(parseBrowser(UA.firefoxMac)).toEqual({ name: "Firefox", version: "131.0" });
    expect(parseOS(UA.chromeWin)).toBe("Windows 10/11");
    expect(parseOS(UA.iphone)).toBe("iOS 17.6");
    expect(parseOS(UA.firefoxMac)).toBe("macOS 14.6");
    expect(parseOS(UA.android)).toBe("Android 14");
  });

  it("includes the user, page and recent errors, and lists them for the user", () => {
    recordError("app", "Save failed: 500");
    const d = collectDiagnostics({ email: "u@example.com", displayName: "Una", role: "editor", multiUser: true });
    expect(d.user).toMatchObject({ email: "u@example.com", role: "editor", mode: "multi-user" });
    expect(d.page.path).toBe(window.location.pathname + window.location.search);
    expect(d.recentErrors.at(-1)).toMatch(/\[app\] Save failed: 500/);
    const rows = Object.fromEntries(diagnosticsRows(d));
    expect(rows["You · role"]).toBe("editor");
    expect(rows["Recent errors"]).toContain("Save failed");
  });

  it("keeps only the last 20 errors", () => {
    for (let i = 0; i < 30; i++) recordError("console", `e${i}`);
    const log = recentErrors();
    expect(log).toHaveLength(20);
    expect(log.at(-1)?.message).toBe("e29");
  });
});

describe("Help & feedback", () => {
  it("sends the report with the screenshot and diagnostics", async () => {
    __stubResponse("/api/auth/me", { email: "u@example.com", role: "viewer", is_admin: false, multi_user: true });
    __stubResponse("/api/feedback", { id: "r1", emailed: true, message: "Sent to the team." }, 201);
    const fetchSpy = vi.mocked(globalThis.fetch);
    const onSent = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FeedbackForm onSent={onSent} />
      </QueryClientProvider>,
    );
    await screen.findByAltText("Screenshot of the page");
    fireEvent.click(screen.getByRole("radio", { name: "Suggestion" }));
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Filter by surveyor" } });
    fireEvent.change(screen.getByLabelText("Details"), { target: { value: "On the Findings table." } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })));
    await waitFor(() => expect(onSent).toHaveBeenCalled());

    const call = fetchSpy.mock.calls.find(([input]) => (input as Request).url?.endsWith("/api/feedback"));
    const body = JSON.parse(await (call![0] as Request).clone().text());
    expect(body).toMatchObject({
      kind: "idea",
      summary: "Filter by surveyor",
      details: "On the Findings table.",
      screenshot: "data:image/jpeg;base64,/9j/AAAA",
    });
    expect(body.context.browser.name).toBeTruthy();
    expect(body.context.page.url).toBe(window.location.href);
  });

  it("leaves the screenshot out when switched off", async () => {
    __stubResponse("/api/feedback", { id: "r2", emailed: false, message: "Saved for the admins." }, 201);
    const fetchSpy = vi.mocked(globalThis.fetch);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FeedbackForm />
      </QueryClientProvider>,
    );
    await screen.findByAltText("Screenshot of the page");
    fireEvent.click(screen.getByRole("switch", { name: "Include a screenshot" }));
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Blank export" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })));
    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([input]) => (input as Request).url?.endsWith("/api/feedback"))).toBe(true),
    );
    const call = fetchSpy.mock.calls.filter(([input]) => (input as Request).url?.endsWith("/api/feedback")).at(-1);
    expect(JSON.parse(await (call![0] as Request).clone().text()).screenshot).toBeNull();
  });
});
