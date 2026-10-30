/**
 * Offline outbox: writes made without a connection are kept on the device
 * and sent, in order, when it comes back.
 *
 * On site the signal comes and goes. A save that hit a network error used
 * to be lost (an error toast, the form closed, the work gone). Now a write
 * (POST/PATCH/DELETE, including photo uploads) that fails *because the
 * network is down* is stored in IndexedDB and the caller gets a 202
 * "queued" answer; the outbox replays it later with the same method, path
 * and body.
 *
 * Rules that keep this safe:
 *  - Only network failures are queued. A request the server answered (4xx,
 *    5xx) is never queued — that's a real error to show.
 *  - Entries remember who made them and are only sent while that user is
 *    signed in, so a shared device never uploads one person's work under
 *    another's name.
 *  - Order is kept, and a failing entry is marked, not dropped: the header
 *    chip lists it with Send now / Discard. A refused write (a 4xx answer) is
 *    not sent again on its own — it would only be refused again — until "Send
 *    now"; a server hiccup (5xx, 408, 429) or an unexpected failure is retried
 *    automatically.
 *  - New records get their id on the device (lib/pendingRecords.ts), so
 *    later writes can point at a queued create; sending in order means the
 *    parent always reaches the server first, and a create sent twice
 *    returns the record already saved.
 */
import type { QueryClient } from "@tanstack/react-query";
import { createStore, del, entries, get, set } from "idb-keyval";

// Bound at startup (bindQueryClient) rather than imported: api/client
// imports this module, so a static import back would be a cycle.
let queryClient: QueryClient | null = null;
export function bindQueryClient(client: QueryClient) {
  queryClient = client;
}

export interface OutboxEntry {
  id: string;
  createdAt: string;
  owner: string;
  method: string;
  url: string;
  label: string;
  /** JSON body text, or a file for multipart uploads. */
  body?: string;
  file?: { blob: Blob; name: string; field: string };
  error?: string;
  /** With `error`: worth sending again automatically (a server hiccup),
   *  rather than waiting for the user (the server refused this write). */
  transient?: boolean;
}

const store = typeof indexedDB !== "undefined" ? createStore("webapp-outbox", "entries") : null;
const listeners = new Set<() => void>();
let cache: OutboxEntry[] = [];
let flushing = false;
const FLUSH_LOCK = "webapp-outbox-flush";

function notify() {
  for (const fn of listeners) fn();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function snapshot(): OutboxEntry[] {
  return cache;
}

async function reload() {
  if (!store) return;
  const all = (await entries<string, OutboxEntry>(store)).map(([, v]) => v);
  cache = all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  notify();
}

/** Whether an error means "couldn't reach the server" (vs a server answer). */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return error instanceof TypeError;
}

function currentUser(): string | undefined {
  const me = queryClient?.getQueryData<{ email?: string }>(["me"]);
  return me?.email?.toLowerCase();
}

const NOUNS: Record<string, string> = {
  sites: "site",
  surveys: "survey",
  comments: "comment",
  attachments: "file",
};

function describe(method: string, url: string, fileName?: string): string {
  const resource = new URL(url, "http://x").pathname.split("/")[2] ?? "record";
  const noun = NOUNS[resource] ?? resource;
  if (fileName) return `Upload ${fileName}`;
  if (method === "POST") return `New ${noun}`;
  if (method === "DELETE") return `Delete ${noun}`;
  return `Change to ${noun}`;
}

export async function enqueue(
  entry: Omit<OutboxEntry, "id" | "createdAt" | "owner" | "label"> & { label?: string },
): Promise<OutboxEntry | null> {
  const owner = currentUser();
  if (!store || !owner) return null;
  const full: OutboxEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    owner,
    label: entry.label ?? describe(entry.method, entry.url, entry.file?.name),
  };
  await set(full.id, full, store);
  await reload();
  window.dispatchEvent(new CustomEvent("outbox-queued", { detail: full.label }));
  return full;
}

export async function discard(id: string) {
  if (!store) return;
  await del(id, store);
  await reload();
}

async function send(entry: OutboxEntry): Promise<Response> {
  const init: RequestInit = { method: entry.method, credentials: "same-origin" };
  if (entry.file) {
    const form = new FormData();
    form.append(entry.file.field, entry.file.blob, entry.file.name);
    init.body = form;
  } else if (entry.body !== undefined) {
    init.body = entry.body;
    init.headers = { "Content-Type": "application/json" };
  }
  return fetch(entry.url, init);
}

/** Send what's waiting, oldest first. Stops at the first network failure
 *  (still offline); a server error marks that entry and moves on. Only one
 *  tab sends at a time: the queue is shared between tabs, so each would
 *  otherwise send the same entries (a Web Lock, where the browser has one). */
export async function flush(options: { retryFailed?: boolean } = {}): Promise<void> {
  if (!store || flushing) return;
  const me = currentUser();
  if (!me) return;
  flushing = true;
  try {
    if (typeof navigator !== "undefined" && navigator.locks) {
      await navigator.locks.request(FLUSH_LOCK, () => sendWaiting(me, store, options));
    } else {
      await sendWaiting(me, store, options);
    }
  } finally {
    flushing = false;
  }
}

/** Record why an entry didn't go, keeping it in the queue — unless it's gone:
 *  a discard (or another tab's send) may have removed it while this request
 *  was in flight, and writing it back would resurrect a phantom failure. */
async function markFailed(
  entry: OutboxEntry,
  db: NonNullable<typeof store>,
  detail: string,
  transient: boolean,
): Promise<void> {
  if ((await get(entry.id, db)) !== undefined) {
    await set(entry.id, { ...entry, error: detail, transient }, db);
  }
}

async function sendWaiting(
  me: string,
  db: NonNullable<typeof store>,
  { retryFailed = false }: { retryFailed?: boolean },
): Promise<void> {
  let sent = 0;
  try {
    // Read inside the lock: another tab may have sent these while we waited.
    await reload();
    const waiting = cache.filter(
      (e) => e.owner === me && (retryFailed || !e.error || e.transient),
    );
    for (const entry of waiting) {
      let response: Response;
      try {
        response = await send(entry);
        if (response.status === 401) {
          const { refreshSession } = await import("../api/refresh");
          if (await refreshSession()) response = await send(entry);
        }
      } catch (error) {
        if (isNetworkError(error)) break; // still offline
        // Something else went wrong (not the connection): say so on the entry
        // instead of silently stopping the queue.
        console.error("Outbox send failed:", error);
        await markFailed(
          entry,
          db,
          error instanceof Error ? error.message : "Couldn't send this change",
          true,
        );
        continue;
      }
      if (response.ok) {
        await del(entry.id, db);
        sent += 1;
      } else {
        let detail = `HTTP ${response.status}`;
        try {
          const body = (await response.json()) as { detail?: unknown };
          if (typeof body.detail === "string") detail = body.detail;
        } catch {
          // non-JSON error body
        }
        const transient =
          response.status >= 500 || response.status === 408 || response.status === 429;
        await markFailed(entry, db, detail, transient);
      }
    }
  } finally {
    await reload();
  }
  if (sent > 0) {
    await queryClient?.invalidateQueries();
    window.dispatchEvent(new CustomEvent("outbox-sent", { detail: sent }));
  }
}

/** The placeholder a queued write resolves with. */
export function queuedResponse(entry: OutboxEntry): Response {
  return new Response(JSON.stringify({ queued: true, outbox_id: entry.id }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
}

export function isQueued(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as { queued?: unknown }).queued === true;
}

let started = false;
/** Load the queue and send it whenever the connection or the tab comes back. */
export function startOutbox() {
  if (started || typeof window === "undefined") return;
  started = true;
  void reload().then(() => flush());
  window.addEventListener("online", () => void flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flush();
  });
  window.setInterval(() => {
    if (cache.length > 0 && navigator.onLine) void flush();
  }, 30_000);
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// Sign-in, session and admin calls are never queued: they only make sense
// online, and replaying them later would be surprising.
const NEVER_QUEUE = /^\/api\/(auth|admin|users|notifications)(\/|$)/;

export function shouldQueue(method: string, url: string): boolean {
  return MUTATING.has(method.toUpperCase()) && !NEVER_QUEUE.test(new URL(url, "http://x").pathname);
}

/** openapi-fetch middleware: a mutating request that fails because the
 *  network is down is queued, and the caller gets a 202 "queued" answer. */
export function outboxMiddleware() {
  const copies = new Map<string, Request>();
  return {
    onRequest({ request, id }: { request: Request; id: string }) {
      if (shouldQueue(request.method, request.url)) copies.set(id, request.clone());
      return undefined;
    },
    onResponse({ id }: { id: string }) {
      copies.delete(id);
      return undefined;
    },
    async onError({ error, id }: { error: unknown; id: string }) {
      const copy = copies.get(id);
      copies.delete(id);
      if (!copy || !isNetworkError(error)) return undefined;
      const body = await copy.text();
      const url = new URL(copy.url);
      const entry = await enqueue({
        method: copy.method,
        url: url.pathname + url.search,
        body: body || undefined,
      });
      return entry ? queuedResponse(entry) : undefined;
    },
  };
}
