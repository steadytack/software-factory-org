import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/screenshot", () => ({
  captureScreen: vi.fn(async () => "data:image/jpeg;base64,/9j/AAAA"),
}));

import { __stubResponse } from "./setup";
import { FeedbackForm } from "../src/help/FeedbackForm";
import { FeedbackAdminPanel } from "../src/components/FeedbackAdminPanel";
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

const ALL_STORED = [
  { type: "problem", kind: "bug", destination: "store", address: null },
  { type: "suggestion", kind: "idea", destination: "store", address: null },
  { type: "question", kind: "other", destination: "store", address: null },
];

function renderForm() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <FeedbackForm />
    </QueryClientProvider>,
  );
}

describe("Help & feedback", () => {
  it("sends the report with the screenshot and diagnostics", async () => {
    __stubResponse("/api/auth/me", { email: "u@example.com", role: "viewer", is_admin: false, multi_user: true });
    __stubResponse("/api/feedback/config", { types: ALL_STORED });
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
    __stubResponse("/api/feedback/config", { types: ALL_STORED });
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

describe("Feedback types", () => {
  it("offers only the types that are on, and says where each goes", async () => {
    __stubResponse("/api/feedback/config", {
      types: [
        { type: "problem", kind: "bug", destination: "email", address: null },
        { type: "question", kind: "other", destination: "store", address: null },
      ],
    });
    renderForm();
    await waitFor(() => expect(screen.queryByRole("radio", { name: "Suggestion" })).not.toBeInTheDocument());
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Problem", "Question"]);

    fireEvent.click(screen.getByText("What's sent with it"));
    expect(await screen.findByText("Problems are emailed to the team.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Question" }));
    expect(screen.getByText("Questions are kept in the app for the admins to read.")).toBeInTheDocument();
  });

  it("starts on the first type that is on", async () => {
    __stubResponse("/api/feedback/config", {
      types: [{ type: "suggestion", kind: "idea", destination: "email", address: "ideas@example.com" }],
    });
    renderForm();
    const radio = await screen.findByRole("radio", { name: "Suggestion" });
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(1));
    expect(radio).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByText("What's sent with it"));
    expect(await screen.findByText("Suggestions are emailed to ideas@example.com.")).toBeInTheDocument();
  });

  it("says so when every type is off", async () => {
    __stubResponse("/api/feedback/config", { types: [] });
    renderForm();
    expect(await screen.findByText(/Feedback is turned off for this app/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
  });
});

describe("Admin → Feedback", () => {
  const SETTINGS = {
    feedback_email: "team@example.com",
    smtp_configured: true,
    routes: {
      problem: { destination: "email", address: "bugs@example.com" },
      suggestion: { destination: "store", address: "" },
      question: { destination: "off", address: "" },
    },
  };

  function renderPanel() {
    __stubResponse("/api/admin/settings/test-email", null, 204);
    __stubResponse("/api/admin/settings", SETTINGS);
    __stubResponse("/api/admin/feedback", { total: 0, items: [] });
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <FeedbackAdminPanel />
      </QueryClientProvider>,
    );
  }

  it("shows one row per type with its destination, address and test button", async () => {
    renderPanel();
    const problem = await screen.findByTestId("feedback-route-problem");
    expect(within(problem).getByRole("radio", { name: "Email" })).toHaveAttribute("aria-checked", "true");
    expect(within(problem).getByLabelText("Problems address")).toHaveValue("bugs@example.com");
    expect(within(problem).getByRole("button", { name: "Send a test email for problems" })).toBeEnabled();

    const suggestion = screen.getByTestId("feedback-route-suggestion");
    expect(within(suggestion).getByRole("radio", { name: "Store only" })).toHaveAttribute("aria-checked", "true");
    expect(within(suggestion).queryByRole("button", { name: /test email/ })).not.toBeInTheDocument();
    const question = screen.getByTestId("feedback-route-question");
    expect(within(question).getByRole("radio", { name: "Off" })).toHaveAttribute("aria-checked", "true");
  });

  it("sends a test email for one type", async () => {
    renderPanel();
    const problem = await screen.findByTestId("feedback-route-problem");
    const fetchSpy = vi.mocked(globalThis.fetch);
    await act(async () =>
      fireEvent.click(within(problem).getByRole("button", { name: "Send a test email for problems" })),
    );
    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(([input]) => (input as Request).url?.includes("/api/admin/settings/test-email?route=problem")),
      ).toBe(true),
    );
  });

  it("saves every type's destination", async () => {
    renderPanel();
    const suggestion = await screen.findByTestId("feedback-route-suggestion");
    fireEvent.click(within(suggestion).getByRole("radio", { name: "Email" }));
    fireEvent.change(within(suggestion).getByLabelText("Suggestions address"), {
      target: { value: " ideas@example.com " },
    });
    // Unsaved changes: the test buttons wait for a save.
    expect(screen.getByRole("button", { name: "Send a test email for problems" })).toBeDisabled();
    const fetchSpy = vi.mocked(globalThis.fetch);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    const call = await waitFor(() => {
      const found = fetchSpy.mock.calls.find(([input]) => (input as Request).method === "PUT");
      expect(found).toBeTruthy();
      return found!;
    });
    const body = JSON.parse(await (call[0] as Request).clone().text());
    expect(body).toEqual({
      feedback_email: "team@example.com",
      routes: {
        problem: { destination: "email", address: "bugs@example.com" },
        suggestion: { destination: "email", address: "ideas@example.com" },
        question: { destination: "off", address: "" },
      },
    });
  });
});
