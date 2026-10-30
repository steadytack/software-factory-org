import type { QueryClient } from "@tanstack/react-query";

import { findCachedRecord } from "./offlineData";
import { snapshot } from "./outbox";

/** Offline changes shown before they upload. The outbox (lib/outbox.ts)
 *  holds every create, edit and delete made without a signal; lists and
 *  record pages overlay them on what the server last sent, so a new site
 *  appears at once, opens, and can take a survey and photos while
 *  it waits. Since the outbox is on the device, this survives a reload.
 *  Once it uploads, the server's copy replaces the overlay. */

export type Resource = "sites" | "surveys" | "comments";
type Row = { id: string } & Record<string, unknown>;
type List<T> = { total: number; items: T[] };

/** Marks a record that hasn't reached the server yet. */
export function isPending(record: unknown): boolean {
  return Boolean(record && (record as { pending?: unknown }).pending === true);
}

/** A new id, chosen here so offline work can point at a record before the
 *  server has it (the API accepts it on create). */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // randomUUID needs a secure context; build a v4 UUID by hand otherwise.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

interface Changes {
  created: Row[];
  updated: Map<string, Record<string, unknown>>;
  deleted: Set<string>;
}

function parse(body: string | undefined): Record<string, unknown> | null {
  try {
    return body ? (JSON.parse(body) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The waiting changes to one kind of record, oldest first. */
function changesTo(resource: Resource): Changes {
  const changes: Changes = { created: [], updated: new Map(), deleted: new Set() };
  for (const entry of snapshot()) {
    if (entry.file) continue;
    const [, api, name, id] = new URL(entry.url, "http://x").pathname.split("/");
    if (api !== "api" || name !== resource) continue;
    const body = parse(entry.body);
    if (entry.method === "POST" && !id && typeof body?.id === "string") {
      changes.created.push({ ...body, id: body.id, created_at: entry.createdAt, updated_at: entry.createdAt, author: entry.owner });
    } else if (entry.method === "PATCH" && id && body) {
      changes.updated.set(id, { ...changes.updated.get(id), ...body, updated_at: entry.createdAt });
    } else if (entry.method === "DELETE" && id) {
      changes.deleted.add(id);
    }
  }
  return changes;
}

/** Fields the server would add to a new record (parent names, counts),
 *  filled from what's on the device. */
function complete(resource: Resource, row: Row, client: QueryClient): Row {
  const parent = (root: string, id: unknown) =>
    typeof id === "string" ? findCachedRecord<Row>(client, root, id) : undefined;
  switch (resource) {
    case "sites":
      return { site_type: "other", status: "active", address: null, postcode: null, notes: null, ...row };
    case "surveys":
      return {
        status: "draft",
        summary: null,
        site_name: parent("sites", row.site_id)?.name ?? null,
        ...row,
      };
    case "comments":
      return row;
  }
}

/** `list` with the waiting changes applied: deletions hidden, edits merged,
 *  and new records that `keep` accepts added at the top. `keep` returning
 *  false for everything (a filter this can't judge) adds none. */
export function withPendingList<T>(
  client: QueryClient,
  resource: Resource,
  list: List<T>,
  keep: (row: T) => boolean,
): List<T> {
  const { created, updated, deleted } = changesTo(resource);
  if (!created.length && !updated.size && !deleted.size) return list;
  const present = new Set<string>();
  const items: T[] = [];
  for (const item of list.items) {
    const id = (item as Row).id;
    present.add(id);
    if (deleted.has(id)) continue;
    const edit = updated.get(id);
    items.push(edit ? ({ ...item, ...edit, pending: true } as T) : item);
  }
  const added = created
    .filter((row) => !present.has(row.id) && !deleted.has(row.id))
    .map((row) => ({ ...complete(resource, row, client), ...updated.get(row.id), pending: true }) as unknown as T)
    .filter(keep);
  return { ...list, total: list.total + added.length - (list.items.length - items.length), items: [...added.reverse(), ...items] };
}

/** One record with its waiting edits, or the waiting new record itself. */
export function withPendingRecord<T>(
  client: QueryClient,
  resource: Resource,
  id: string,
  record: T | undefined,
): T | undefined {
  const { created, updated } = changesTo(resource);
  const edit = updated.get(id);
  if (record) return edit ? ({ ...record, ...edit, pending: true } as T) : record;
  const row = created.find((r) => r.id === id);
  return row ? ({ ...complete(resource, row, client), ...edit, pending: true } as unknown as T) : undefined;
}

const RESOURCE_OF: Record<string, Resource> = {
  site: "sites",
  survey: "surveys",
};

/** Whether a record so far exists only on this device, so the server has
 *  no comments, files or history for it yet. */
export function isPendingCreate(entity: string, id: string): boolean {
  const resource = RESOURCE_OF[entity];
  return Boolean(resource && changesTo(resource).created.some((row) => row.id === id));
}
