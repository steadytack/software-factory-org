import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, expectData } from "../api/client";
import { formatSize } from "../lib/utils";
import { PageHeader } from "../components/PageHeader";
import { ExportButtons, RecycleBinPanel } from "../components/RecycleBinPanel";
import { UsersPanel } from "../components/UsersPanel";
// feature:help.feedback:start
import { FeedbackAdminPanel } from "../components/FeedbackAdminPanel";
// feature:help.feedback:end
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/button";
import { ShieldCheck } from "lucide-react";
import { PanelCard } from "../components/PanelCard";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/ui/empty-state";
import { Skeleton } from "../components/ui/skeleton";
import { LoadError } from "../components/LoadError";
import { WithTooltip } from "../components/ui/with-tooltip";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { SETTINGS_COLUMNS } from "../components/SettingsLayout";

/** Admin page: environment info + real maintenance actions (DB stats,
 *  PostGIS health, demo-data reseed, orphan cleanup). All endpoints are
 *  admin-only server-side. Response shapes come from the generated OpenAPI
 *  types (the backend now declares response models), so no local interfaces
 *  or `as` casts are needed. */

export function AdminPage() {
  const { email: myEmail, multiUser, isAdmin } = useAuth();

  // Non-admins have no business here (the server enforces this per request;
  // this is client-side convenience so the page doesn't render as a wall of
  // 403 errors). Single-user mode always reports isAdmin=true.
  //
  // The guard is a separate component so the data hooks below are never
  // called conditionally (react-hooks/rules-of-hooks).
  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-(--page-gap)">
        <PageHeader title="Admin" />
        <EmptyState
          icon={<ShieldCheck className="size-8" />}
          title="Admin access required"
          description="Ask an administrator to grant you access."
        />
      </div>
    );
  }

  return <AdminContent myEmail={myEmail ?? ""} multiUser={multiUser} />;
}

function AdminContent({ myEmail, multiUser }: { myEmail: string; multiUser: boolean }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"reseed" | "orphans" | null>(null);

  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => {
      const call = () => api.GET("/api/admin/stats", {});
      return expectData(call(), call);
    },
    refetchOnWindowFocus: false,
  });
  const health = useQuery({
    queryKey: ["admin-health"],
    queryFn: () => {
      const call = () => api.GET("/api/admin/db-health", {});
      return expectData(call(), call);
    },
    refetchOnWindowFocus: false,
  });

  const reseed = useMutation({
    mutationFn: () => expectData(() => api.POST("/api/admin/reseed", {})),
    onSuccess: (result) => {
      setMessage(result.detail ?? "Done");
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["sites"] });
    },
    onError: () => setMessage("Reseed failed"),
  });

  const cleanOrphans = useMutation({
    mutationFn: () => expectData(() => api.DELETE("/api/admin/orphans", {})),
    onSuccess: (result) => {
      const parts = Object.entries(result.removed)
        .filter(([, n]) => n > 0)
        .map(([name, n]) => `${n} ${name}`);
      setMessage(parts.length ? `Removed ${parts.join(", ")}` : "No orphans found");
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: () => setMessage("Cleanup failed"),
  });

  return (
    <>
      <PageHeader title="Admin" />
      {multiUser && (
        <PanelCard title="Users">
          <UsersPanel myEmail={myEmail} />
        </PanelCard>
      )}
      <div className={SETTINGS_COLUMNS}>
        <PanelCard title="Environment" collapsible={{ defaultOpen: false, key: "admin-environment" }}>
          <dl className="divide-y divide-border text-dense">
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-muted-foreground">API base</dt>
              <dd className="text-right text-foreground">/api</dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-muted-foreground">Auth model</dt>
              <dd className="text-right text-foreground">
                {multiUser ? "Multi-user" : "Single admin"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-muted-foreground">Database</dt>
              <dd className="text-right text-foreground">
                PostgreSQL + PostGIS
                {health.data?.postgis_version ? ` ${health.data.postgis_version.split(" ")[0]}` : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-muted-foreground">DB status</dt>
              <dd>
                {health.data ? (
                  <StatusBadge
                    value={health.data.status}
                    tone={health.data.status === "ok" ? "success" : "destructive"}
                    label={health.data.status === "ok" ? "Healthy" : health.data.status}
                  />
                ) : health.isError ? (
                  <StatusBadge value="unavailable" tone="destructive" label="Unavailable" />
                ) : (
                  <span className="text-muted-foreground">Checking…</span>
                )}
              </dd>
            </div>
          </dl>
        </PanelCard>
        <PanelCard title="Data">
          {stats.isError && <LoadError error={stats.error} what="data counts" onRetry={() => void stats.refetch()} />}
          <dl className="grid grid-cols-2 gap-x-6 text-dense">
            {stats.isPending
              ? Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="my-2 h-4 w-full" />
                ))
              : Object.entries(stats.data?.counts ?? {}).map(([label, count]) => (
                  <div key={label} className="flex justify-between gap-4 border-b border-border py-2">
                    <dt className="text-muted-foreground capitalize">{label}</dt>
                    <dd className="text-foreground tnum">{count}</dd>
                  </div>
                ))}
          </dl>
          {stats.data?.storage && (
            <div className="space-y-2 text-dense">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">File storage</span>
                <span className="text-foreground tnum">
                  {formatSize(stats.data.storage.used_bytes)} of{" "}
                  {formatSize(stats.data.storage.quota_bytes)}
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="meter"
                aria-label="File storage used"
                aria-valuemin={0}
                aria-valuemax={stats.data.storage.quota_bytes}
                aria-valuenow={stats.data.storage.used_bytes}
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${Math.min(100, (100 * stats.data.storage.used_bytes) / Math.max(1, stats.data.storage.quota_bytes))}%`,
                  }}
                />
              </div>
              {Object.keys(stats.data.storage.by_user).length > 0 && (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {Object.entries(stats.data.storage.by_user).map(([email, bytes]) => (
                    <li key={email} className="flex justify-between gap-4">
                      <span className="truncate">{email}</span>
                      <span className="tnum">
                        {formatSize(bytes)} / {formatSize(stats.data.storage.per_user_quota_bytes)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </PanelCard>
        <PanelCard title="Maintenance">
          <div className="flex flex-wrap items-center gap-2">
            <WithTooltip label="Runs the demo seeder; does nothing when sites already exist.">
              <Button size="sm" onClick={() => setConfirm("reseed")} disabled={reseed.isPending}>
                {reseed.isPending ? "Seeding…" : "Re-seed demo data"}
              </Button>
            </WithTooltip>
            <WithTooltip label="Removes comments and attachments whose record was deleted.">
              <Button size="sm" variant="outline" onClick={() => setConfirm("orphans")} disabled={cleanOrphans.isPending}>
                {cleanOrphans.isPending ? "Cleaning…" : "Clean orphaned records"}
              </Button>
            </WithTooltip>
            {message && (
              <span role="status" className="text-xs text-muted-foreground">
                {message}
              </span>
            )}
          </div>
        </PanelCard>
        <PanelCard title="Recycle bin">
          <RecycleBinPanel />
        </PanelCard>
        {/* feature:help.feedback:start */}
        <PanelCard title="Feedback">
          <FeedbackAdminPanel />
        </PanelCard>
        {/* feature:help.feedback:end */}
        <PanelCard title="Export">
          <ExportButtons />
        </PanelCard>
      </div>
      <ConfirmDialog
        open={confirm === "reseed"}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          reseed.mutate();
        }}
        title="Re-seed demo data?"
        description="Adds the demo sites and surveys. Sites that are already there are left alone."
        confirmLabel="Re-seed"
      />
      <ConfirmDialog
        open={confirm === "orphans"}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          cleanOrphans.mutate();
        }}
        title="Clean orphaned records?"
        description="Permanently removes comments and files whose record was deleted. This cannot be undone."
        confirmLabel="Clean up"
        destructive
      />
    </>
  );
}
