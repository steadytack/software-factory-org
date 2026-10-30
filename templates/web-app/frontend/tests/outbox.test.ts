import "fake-indexeddb/auto";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Import after fake-indexeddb so the outbox store is backed by it.
const outbox = await import("../src/lib/outbox");

function signedInAs(email: string) {
  const client = new QueryClient();
  client.setQueryData(["me"], { email });
  outbox.bindQueryClient(client);
  return client;
}

describe("outbox", () => {
  beforeEach(async () => {
    for (const e of outbox.snapshot()) await outbox.discard(e.id);
  });

  it("only queues data writes, never sign-in or admin calls", () => {
    expect(outbox.shouldQueue("POST", "http://x/api/surveys")).toBe(true);
    expect(outbox.shouldQueue("PATCH", "/api/sites/1")).toBe(true);
    expect(outbox.shouldQueue("GET", "/api/surveys")).toBe(false);
    expect(outbox.shouldQueue("POST", "/api/auth/login")).toBe(false);
    expect(outbox.shouldQueue("DELETE", "/api/admin/recycle-bin/survey/1")).toBe(false);
  });

  it("keeps a failed write and sends it, in order, when back online", async () => {
    signedInAs("sam@example.com");
    await outbox.enqueue({ method: "POST", url: "/api/surveys", body: '{"description":"a"}' });
    await outbox.enqueue({ method: "PATCH", url: "/api/sites/1", body: '{"status":"done"}' });
    expect(outbox.snapshot().map((e) => e.label)).toEqual(["New survey", "Change to site"]);

    // Still offline: nothing is lost.
    const offline = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", offline);
    await outbox.flush();
    expect(outbox.snapshot()).toHaveLength(2);

    const online = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", online);
    await outbox.flush();
    expect(online.mock.calls.map((c) => [c[0], (c[1] as RequestInit).method])).toEqual([
      ["/api/surveys", "POST"],
      ["/api/sites/1", "PATCH"],
    ]);
    expect(outbox.snapshot()).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("marks a write the server refuses instead of dropping it", async () => {
    signedInAs("sam@example.com");
    await outbox.enqueue({ method: "POST", url: "/api/surveys", body: "{}" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Survey not found" }), { status: 404 }),
      ),
    );
    await outbox.flush();
    expect(outbox.snapshot()[0].error).toBe("Survey not found");
    vi.unstubAllGlobals();
  });

  // Audit R2-OFF-3 (2026-09-29): a write the server refused (4xx) is
  // not sent again on its own — it would only be refused again — until the
  // user chooses "Send now" (flush with retryFailed).
  it("does not re-send a write the server refused, until Send now", async () => {
    signedInAs("sam@example.com");
    await outbox.enqueue({ method: "POST", url: "/api/surveys", body: "{}" });
    const refuse = vi.fn().mockImplementation(() => Promise.resolve(new Response("{}", { status: 422 })));
    vi.stubGlobal("fetch", refuse);
    await outbox.flush();
    await outbox.flush();
    expect(refuse).toHaveBeenCalledTimes(1);
    expect(outbox.snapshot()[0].error).toBe("HTTP 422");

    await outbox.flush({ retryFailed: true });
    expect(refuse).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("keeps retrying by itself after a server hiccup", async () => {
    signedInAs("sam@example.com");
    await outbox.enqueue({ method: "POST", url: "/api/surveys", body: "{}" });
    const unavailable = vi.fn().mockImplementation(() => Promise.resolve(new Response("{}", { status: 503 })));
    vi.stubGlobal("fetch", unavailable);
    await outbox.flush();
    expect(outbox.snapshot()[0].transient).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 201 })));
    await outbox.flush();
    expect(outbox.snapshot()).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  // Audit R2-OFF-4: an unexpected failure (not the connection) used to
  // stop the queue silently as if offline; it is now shown on the entry.
  it("marks an entry that failed for a non-network reason and carries on", async () => {
    signedInAs("sam@example.com");
    await outbox.enqueue({ method: "POST", url: "/api/surveys", body: "{}" });
    await outbox.enqueue({ method: "POST", url: "/api/sites", body: "{}" });
    const boom = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("bad body"))
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await outbox.flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(outbox.snapshot().map((e) => e.error)).toEqual(["bad body"]);
    expect(boom).toHaveBeenCalled();
    boom.mockRestore();
    vi.unstubAllGlobals();
  });

  // Audit R2-OFF-1 (2026-09-29): the queue is shared between tabs, so
  // two tabs used to send the same entry. A Web Lock now serialises them; the
  // second tab reads the queue after the first has emptied it. jsdom has no
  // Web Locks, so a minimal first-come mutex stands in for the browser's.
  it("lets only one tab send an entry", async () => {
    let tail: Promise<unknown> = Promise.resolve();
    vi.stubGlobal("navigator", {
      ...navigator,
      onLine: true,
      locks: {
        request: (_name: string, callback: () => Promise<unknown>) => {
          const run = tail.then(callback);
          tail = run.catch(() => undefined);
          return run;
        },
      },
    });
    signedInAs("sam@example.com");
    await outbox.enqueue({ method: "POST", url: "/api/surveys", body: "{}" });

    vi.resetModules();
    const otherTab = await import("../src/lib/outbox");
    const client = new QueryClient();
    client.setQueryData(["me"], { email: "sam@example.com" });
    otherTab.bindQueryClient(client);

    const slowOk = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(new Response("{}", { status: 201 })), 20)),
      );
    vi.stubGlobal("fetch", slowOk);
    await Promise.all([outbox.flush(), otherTab.flush()]);
    expect(slowOk).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  // Same case: a refused entry that was discarded while its request was in
  // flight must not be written back as a phantom failure.
  it("does not resurrect an entry that was discarded during its send", async () => {
    signedInAs("sam@example.com");
    const queued = await outbox.enqueue({ method: "POST", url: "/api/surveys", body: "{}" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        await outbox.discard(queued!.id);
        return new Response("{}", { status: 409 });
      }),
    );
    await outbox.flush();
    expect(outbox.snapshot()).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("never sends one person's changes under another's session", async () => {
    signedInAs("sam@example.com");
    await outbox.enqueue({ method: "POST", url: "/api/surveys", body: "{}" });
    signedInAs("alex@example.com");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await outbox.flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(outbox.snapshot()).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});
