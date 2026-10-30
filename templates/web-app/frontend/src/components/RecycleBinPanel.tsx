import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api, expectData } from "../api/client";
import { formatDateTime } from "../lib/format";
import { vocabularyLabel } from "../lib/vocabularies";
import type { components } from "../types/openapi";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { RelativeTime } from "./RelativeTime";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { RowActionButton, RowActions } from "./ui/row-actions";
import { Skeleton } from "./ui/skeleton";
import { LoadError } from "./LoadError";

type BinItem = components["schemas"]["BinItemRead"];

/** Admin › Recycle bin: deleted surveys (one row per
 *  delete, with what went with it). Restore puts them back; Delete
 *  permanently removes them and their files. */
export function RecycleBinPanel() {
  const queryClient = useQueryClient();
  const [purging, setPurging] = useState<BinItem | null>(null);
  const bin = useQuery({
    queryKey: ["recycle-bin"],
    queryFn: () => expectData(() => api.GET("/api/admin/recycle-bin", {})),
  });

  const refreshAll = () =>
    Promise.all(
      ["recycle-bin", "surveys", "stats", "admin-stats"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );

  const restore = useMutation({
    mutationFn: (item: BinItem) =>
      expectData(() =>
        api.POST("/api/admin/recycle-bin/{entity}/{record_id}/restore", {
          params: { path: { entity: item.entity as "survey", record_id: item.id } },
        }),
      ),
    onSuccess: (_d, item) => {
      toast.success(`Restored ${vocabularyLabel(item.entity).toLowerCase()}.`);
      void refreshAll();
    },
  });

  const purge = useMutation({
    mutationFn: (item: BinItem) =>
      expectData(() =>
        api.DELETE("/api/admin/recycle-bin/{entity}/{record_id}", {
          params: { path: { entity: item.entity as "survey", record_id: item.id } },
        }),
      ),
    onSuccess: () => {
      setPurging(null);
      toast.success("Deleted permanently.");
      void refreshAll();
    },
  });

  const items = bin.data?.items ?? [];
  const retention = bin.data?.retention_days;

  return (
    <div className="space-y-3">
      {bin.isPending ? (
        <Skeleton className="h-24 rounded-lg" />
      ) : bin.isError ? (
        <LoadError error={bin.error} what="recycle bin" onRetry={() => void bin.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Trash2 className="size-8" />}
          title="The recycle bin is empty"
          className="py-6"
          description={
            retention
              ? `Deleted surveys stay here for ${retention} days.`
              : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {items.map((item) => (
            <li key={`${item.entity}-${item.id}`} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-dense text-foreground">
                  <span className="text-muted-foreground">{vocabularyLabel(item.entity)}:</span> {item.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.site_id ? (
                    <Link to={`/sites/${item.site_id}`} className="hover:text-primary hover:underline tap-area">
                      {item.site_name}
                    </Link>
                  ) : (
                    item.site_name
                  )}
                  {item.with_count > 0 && ` · with ${item.with_count} related record(s)`}
                  {" · deleted "}
                  <span title={formatDateTime(item.deleted_at)}>
                    <RelativeTime value={item.deleted_at} />
                  </span>
                  {item.deleted_by && ` by ${item.deleted_by}`}
                </p>
              </div>
              <RowActions>
                <RowActionButton
                  label="Restore"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(item)}
                >
                  <ArchiveRestore />
                </RowActionButton>
                <RowActionButton
                  label="Delete permanently"
                  tone="destructive"
                  onClick={() => setPurging(item)}
                >
                  <Trash2 />
                </RowActionButton>
              </RowActions>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && retention ? (
        <p className="text-xs text-muted-foreground">
          Items are deleted permanently after {retention} days.
        </p>
      ) : null}

      <DeleteConfirmDialog
        open={purging !== null}
        onClose={() => setPurging(null)}
        onConfirm={() => purging && purge.mutate(purging)}
        name={purging?.label}
        entityLabel={purging ? vocabularyLabel(purging.entity).toLowerCase() : "item"}
        loading={purge.isPending}
      />
    </div>
  );
}

/** Admin › Export: every table as CSV in one ZIP, optionally with files. */
export function ExportButtons() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size="sm" variant="outline">
        <a href="/api/admin/export" download>
          <Download />
          Export data (CSV)
        </a>
      </Button>
      <Button asChild size="sm" variant="outline">
        <a href="/api/admin/export?files=true" download>
          <Download />
          Export data and files
        </a>
      </Button>
    </div>
  );
}
