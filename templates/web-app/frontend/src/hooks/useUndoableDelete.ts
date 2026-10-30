import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/** Single delete = hide now, delete later (the Sites table pattern): the row
 *  disappears at once and a toast offers Undo; the DELETE only goes out when
 *  the toast closes without Undo. Leaving the page commits pending deletes. */
export function useUndoableDelete(remove: (id: string, onError: () => void) => void) {
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  const pending = useRef(new Map<string, { commit: () => void; toastId: string | number }>());
  const removeRef = useRef(remove);
  removeRef.current = remove;

  const unhide = (id: string) =>
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const softDelete = useRef((id: string, message: string) => {
    setHiddenIds((prev) => new Set(prev).add(id));
    let settled = false;
    const commit = () => {
      if (settled) return;
      settled = true;
      pending.current.delete(id);
      removeRef.current(id, () => unhide(id));
    };
    const restore = () => {
      if (settled) return;
      settled = true;
      pending.current.delete(id);
      unhide(id);
    };
    const toastId = toast(message, {
      duration: 6000,
      action: { label: "Undo", onClick: restore },
      onAutoClose: commit,
      onDismiss: commit,
    });
    pending.current.set(id, { commit, toastId });
  }).current;

  useEffect(() => {
    const map = pending.current;
    return () => {
      for (const { commit, toastId } of [...map.values()]) {
        commit();
        toast.dismiss(toastId);
      }
    };
  }, []);

  return useMemo(
    () => ({
      softDelete,
      hide: <T extends { id: string }>(rows: T[] | undefined) =>
        rows && hiddenIds.size > 0 ? rows.filter((r) => !hiddenIds.has(r.id)) : rows,
    }),
    [softDelete, hiddenIds],
  );
}

/** Bulk delete one at a time (concurrent mutateAsync calls on one mutation
 *  raced each other — see SitesPage) with one summary toast. */
export async function deleteSequentially(
  ids: string[],
  remove: (id: string) => Promise<unknown>,
  noun: string,
): Promise<void> {
  let succeeded = 0;
  for (const id of ids) {
    try {
      await remove(id);
      succeeded += 1;
    } catch {
      // surfaced by the global mutation-error toast
    }
  }
  if (succeeded === ids.length) {
    toast.success(`Deleted ${succeeded} ${noun}${succeeded === 1 ? "" : "s"}.`);
  } else {
    toast.error(`Deleted ${succeeded} of ${ids.length} ${noun}${ids.length === 1 ? "" : "s"}. The rest failed.`);
  }
}
