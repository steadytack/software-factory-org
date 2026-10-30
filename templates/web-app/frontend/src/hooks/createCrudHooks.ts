import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isNetworkError, isQueued } from "../lib/outbox";
import { findCachedRecord } from "../lib/offlineData";
import { newId, withPendingRecord, type Resource } from "../lib/pendingRecords";

/**
 * Factory for the four structurally-identical CRUD hooks
 * (useSites/useSurveys): list/get/create/update/delete
 * with expectData + query invalidation.
 *
 * The per-resource call sites stay fully typed because each hook file passes
 * narrow lambdas that close over the typed `api` client — the factory only
 * owns the react-query wiring (keys, invalidation, refresh-retry), which is
 * what was previously copy-pasted four times.
 */

export interface CrudConfig<C, U, R, L> {
  /** Query-key root and API resource, e.g. "sites" */
  key: Resource;
  list: (parentId: string | undefined, offset: number, limit: number) => Promise<L>;
  get: (id: string) => Promise<R>;
  create: (body: C) => Promise<R>;
  update: (id: string, body: U) => Promise<R>;
  remove: (id: string) => Promise<void>;
  /** Other query roots whose data derives from this resource (e.g. a survey's
   *  site name from sites), refreshed after every write. */
  alsoInvalidate?: string[];
}

export function createCrudHooks<C, U, R, L extends { total: number; items: R[] }>(
  config: CrudConfig<C, U, R, L>,
) {
  const key = config.key;
  const invalidateRelated = (queryClient: ReturnType<typeof useQueryClient>) =>
    Promise.all(
      (config.alsoInvalidate ?? []).map((k) => queryClient.invalidateQueries({ queryKey: [k] })),
    );

  function useList(parentId?: string | number, offset = 0, limit = 50) {
    return useQuery({
      queryKey: [key, parentId ?? "all", offset, limit],
      queryFn: () => config.list(parentId != null ? String(parentId) : undefined, offset, limit),
    });
  }

  function useGet(id: string) {
    return useQuery({
      queryKey: [key, id],
      queryFn: async ({ client }) => {
        let record: R | undefined;
        try {
          record = await config.get(id);
        } catch (error) {
          // Made offline and not uploaded yet (lib/pendingRecords.ts), or,
          // with no signal, found in the synced lists.
          record =
            withPendingRecord<R>(client, key, id, undefined) ??
            (isNetworkError(error) ? findCachedRecord<R & { id: string }>(client, key, id) : undefined);
          if (!record) throw error;
        }
        // With any edits still waiting to upload.
        return withPendingRecord(client, key, id, record) as R;
      },
      enabled: Boolean(id),
    });
  }

  function useCreate() {
    const queryClient = useQueryClient();
    return useMutation({
      // The id is chosen here, so a record made offline can be opened and
      // built on before it uploads.
      mutationFn: async (body: C) => {
        const id = (body as { id?: string | null }).id ?? newId();
        const created = await config.create({ ...body, id });
        if (!isQueued(created)) return created;
        // Queued offline (lib/outbox.ts): answer with the waiting record,
        // still marked queued.
        return { ...withPendingRecord<R>(queryClient, key, id, undefined), ...created } as R;
      },
      onSuccess: (created) => {
        if (isQueued(created)) {
          // Show it in lists now. Not awaited: offline, a refetch can wait
          // for the connection, leaving the form on "Saving…".
          queryClient.setQueryData([key, (created as { id: string }).id], created);
          void queryClient.invalidateQueries({ queryKey: [key] });
          return;
        }
        return Promise.all([queryClient.invalidateQueries({ queryKey: [key] }), invalidateRelated(queryClient)]);
      },
    });
  }

  function useUpdate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, body }: { id: string; body: U }) => config.update(id, body),
      onSuccess: (updated, vars) => {
        // Queued offline (lib/outbox.ts): lists and pages show the waiting
        // edit (lib/pendingRecords.ts). Not awaited, as for a create.
        if (isQueued(updated)) {
          void queryClient.invalidateQueries({ queryKey: [key] });
          return;
        }
        // Write the saved record straight into the detail cache and every
        // cached list containing it, so a list page shows the edit the moment
        // it's revisited — not only after a background refetch lands.
        queryClient.setQueryData([key, vars.id], updated);
        queryClient.setQueriesData<L>({ queryKey: [key] }, (old) =>
          old && Array.isArray(old.items)
            ? {
                ...old,
                items: old.items.map((item) =>
                  (item as { id?: string }).id === vars.id ? updated : item,
                ),
              }
            : old,
        );
        // Then confirm with the server — inactive lists too, so they're
        // already fresh by the time the user navigates back.
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: [key], refetchType: "all" }),
          invalidateRelated(queryClient),
        ]);
      },
    });
  }

  function useDelete() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => config.remove(id),
      onSuccess: (removed) => {
        const refresh = queryClient.invalidateQueries({ queryKey: [key] });
        // Queued offline: hidden from lists now, deleted when it uploads.
        if (isQueued(removed)) return;
        return Promise.all([refresh, invalidateRelated(queryClient)]);
      },
    });
  }

  return { useList, useGet, useCreate, useUpdate, useDelete };
}
