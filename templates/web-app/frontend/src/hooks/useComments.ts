import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, expectData, fetchJson } from "../api/client";
import { withOfflineFallback } from "../lib/offlineData";
import { isQueued } from "../lib/outbox";
import { isPendingCreate, newId, withPendingList } from "../lib/pendingRecords";
import type { EntityName } from "../lib/vocabularies";

export interface CommentItem {
  id: string;
  entity: string;
  entity_id: string;
  author: string;
  text: string;
  created_at: string;
}

export interface AttachmentItem {
  id: string;
  entity: string;
  entity_id: string;
  name: string;
  size_bytes: number;
  content_type: string | null;
  uploaded_by: string;
  url: string | null;
  created_at: string;
}

export function useComments(entity: EntityName, entityId: string) {
  return useQuery({
    queryKey: ["comments", entity, entityId],
    // With comments made offline and not uploaded yet (lib/pendingRecords.ts).
    queryFn: async ({ client }) => {
      const keep = (c: CommentItem) => c.entity === entity && c.entity_id === entityId;
      const call = () =>
        api.GET("/api/comments", {
          params: { query: { entity, entity_id: entityId } },
        });
      // Offline, a record's waiting comments still show (none may be
      // on the device from the server).
      const list = await withOfflineFallback(
        () => expectData(call(), call),
        () => {
          const waiting = withPendingList(client, "comments", { total: 0, items: [] }, keep);
          return waiting.items.length || isPendingCreate(entity, entityId) ? waiting : undefined;
        },
      );
      return withPendingList(client, "comments", list, keep);
    },
    enabled: Boolean(entityId),
  });
}

export function useCreateComment(entity: EntityName, entityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      expectData(
        () => api.POST("/api/comments", { body: { id: newId(), entity, entity_id: entityId, text } }),
      ),
    onSuccess: (created) => {
      const refresh = queryClient.invalidateQueries({ queryKey: ["comments", entity, entityId] });
      // Queued offline: shown from the outbox; don't wait on a refetch.
      return isQueued(created) ? undefined : refresh;
    },
  });
}

export function useDeleteComment(entity: EntityName, entityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      expectData(
        () => api.DELETE("/api/comments/{comment_id}", {
          params: { path: { comment_id: id } },
        }),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["comments", entity, entityId] }),
  });
}

export function useAttachments(entity: EntityName, entityId: string) {
  return useQuery({
    queryKey: ["attachments", entity, entityId],
    queryFn: () =>
      withOfflineFallback(
        () =>
          expectData(
            () => api.GET("/api/attachments", {
              params: { query: { entity, entity_id: entityId } },
            }),
            () =>
              api.GET("/api/attachments", {
                params: { query: { entity, entity_id: entityId } },
              }),
          ),
        // A record made offline has no files on the server yet.
        () => (isPendingCreate(entity, entityId) ? { total: 0, items: [] } : undefined),
      ),
    enabled: Boolean(entityId),
  });
}

/** What the upload endpoint reports back: the stored file, plus a photo's
 *  GPS position once (the server strips it from the file). Offline, the
 *  outbox queues the upload and answers `{ queued: true }` instead. */
export interface UploadResult {
  id?: string;
  queued?: boolean;
  photo_location?: { latitude: number; longitude: number } | null;
}

/** Multipart upload of one file to a record. openapi-fetch is JSON-only, so
 *  this uses the shared fetchJson helper (same ApiError shape + backend
 *  `detail` surfacing, and offline queueing). */
export function uploadAttachment(entity: EntityName, entityId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return fetchJson<UploadResult>(
    `/api/attachments?entity=${encodeURIComponent(entity)}&entity_id=${encodeURIComponent(entityId)}`,
    { method: "POST", body: form, signal: AbortSignal.timeout(30_000) },
    "Upload failed",
  );
}

export function useCreateAttachment(entity: EntityName, entityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadAttachment(entity, entityId, file),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["attachments", entity, entityId],
      }),
  });
}

export function useDeleteAttachment(entity: EntityName, entityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      expectData(
        () => api.DELETE("/api/attachments/{attachment_id}", {
          params: { path: { attachment_id: id } },
        }),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["attachments", entity, entityId],
      }),
  });
}