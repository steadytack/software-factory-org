import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2, Mail, MessageSquareWarning, Save } from "lucide-react";
import { toast } from "sonner";

import { api, expectData } from "../api/client";
import { cn } from "../lib/utils";
import type { components } from "../types/openapi";
import { RelativeTime } from "./RelativeTime";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { LoadError } from "./LoadError";
import { Segmented } from "./ui/segmented";
import { Skeleton } from "./ui/skeleton";

const KIND_LABEL: Record<string, string> = {
  bug: "Problem",
  confusing: "Confusing",
  idea: "Suggestion",
  other: "Question",
};

type Routes = components["schemas"]["FeedbackRoutes"];
type RouteName = keyof Routes;
type Destination = Routes[RouteName]["destination"];

const ROUTES: { name: RouteName; label: string }[] = [
  { name: "problem", label: "Problems" },
  { name: "suggestion", label: "Suggestions" },
  { name: "question", label: "Questions" },
];
const DESTINATIONS: { value: Destination; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "store", label: "Store only" },
  { value: "off", label: "Off" },
];

function sameRoutes(a: Routes, b: Routes): boolean {
  return ROUTES.every(
    ({ name }) =>
      a[name].destination === b[name].destination && (a[name].address ?? "").trim() === (b[name].address ?? ""),
  );
}

function rows(context: Record<string, unknown>, prefix = ""): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(context)) {
    const name = prefix ? `${prefix} · ${k}` : k;
    if (Array.isArray(v)) out.push([name, v.length ? v.join("\n") : "None"]);
    else if (v && typeof v === "object") out.push(...rows(v as Record<string, unknown>, name));
    else out.push([name, v == null || v === "" ? "—" : String(v)]);
  }
  return out;
}

/** Admin → Feedback: where each type of feedback from Help & feedback goes (emailed, kept here
 *  only, or turned off), a test email per type, and every report received (sent or not). */
export function FeedbackAdminPanel() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["admin-feedback-settings"],
    queryFn: () => expectData(() => api.GET("/api/admin/settings", {})),
  });
  const reports = useQuery({
    queryKey: ["admin-feedback"],
    queryFn: () => expectData(() => api.GET("/api/admin/feedback", { params: { query: { limit: 50 } } })),
  });
  const [email, setEmail] = useState("");
  const [routes, setRoutes] = useState<Routes | null>(null);
  useEffect(() => {
    if (settings.data) {
      setEmail(settings.data.feedback_email);
      setRoutes(settings.data.routes);
    }
  }, [settings.data]);
  const [open, setOpen] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      expectData(() =>
        api.PUT("/api/admin/settings", {
          body: {
            feedback_email: email.trim(),
            routes: routes
              ? (Object.fromEntries(
                  ROUTES.map(({ name }) => [name, { ...routes[name], address: (routes[name].address ?? "").trim() }]),
                ) as Routes)
              : null,
          },
        }),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin-feedback-settings"], data);
      void queryClient.invalidateQueries({ queryKey: ["feedback-config"] });
      toast.success("Feedback settings saved.");
    },
  });
  const test = useMutation({
    mutationFn: ({ route }: { route: RouteName; to: string }) =>
      expectData(() => api.POST("/api/admin/settings/test-email", { params: { query: { route } } })),
    onSuccess: (_data, { to }) => toast.success(`Test email sent to ${to}.`),
  });

  const saved = settings.data?.feedback_email ?? "";
  const dirty =
    email.trim() !== saved || (routes != null && settings.data != null && !sameRoutes(routes, settings.data.routes));
  const smtp = settings.data?.smtp_configured ?? false;

  function setRoute(name: RouteName, change: Partial<Routes[RouteName]>) {
    setRoutes((r) => (r ? { ...r, [name]: { ...r[name], ...change } } : r));
  }

  return (
    <div className="space-y-5">
      <form
        className="space-y-(--field-gap)"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Label htmlFor="feedback-email">Default address</Label>
        <Input
          id="feedback-email"
          type="email"
          value={email}
          placeholder="e.g. support@example.com"
          onChange={(e) => setEmail(e.target.value)}
          className="max-w-sm"
        />
        <p className="text-xs text-muted-foreground">Used by any type set to Email without its own address.</p>

        {routes && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {ROUTES.map(({ name, label }) => {
              const route = routes[name];
              const savedRoute = settings.data?.routes[name];
              const to = (savedRoute?.address || saved).trim();
              const labelId = `feedback-route-${name}`;
              return (
                <li key={name} data-testid={`feedback-route-${name}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span id={labelId} className="w-24 text-dense font-medium text-foreground">
                    {label}
                  </span>
                  <Segmented
                    labelId={labelId}
                    options={DESTINATIONS}
                    value={route.destination}
                    onChange={(destination) => setRoute(name, { destination })}
                  />
                  {route.destination === "email" && (
                    <>
                      <Input
                        type="email"
                        aria-label={`${label} address`}
                        value={route.address ?? ""}
                        placeholder={saved || "Default address"}
                        onChange={(e) => setRoute(name, { address: e.target.value })}
                        className="h-8 max-w-56 flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Send a test email for ${label.toLowerCase()}`}
                        disabled={savedRoute?.destination !== "email" || !to || dirty || test.isPending || !smtp}
                        onClick={() => test.mutate({ route: name, to })}
                      >
                        {test.isPending && test.variables?.route === name ? <Loader2 className="animate-spin" /> : <Mail />}
                        Test
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <Button type="submit" size="sm" disabled={!dirty || save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          Save
        </Button>
        {/* Only worth saying when it explains why the test buttons are off. */}
        {!smtp && (
          <p className="text-xs text-muted-foreground">Email isn&apos;t set up on the server, so reports are kept here only.</p>
        )}
      </form>

      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          Reports{reports.data ? ` (${reports.data.total})` : ""}
        </h3>
        {reports.isPending ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : reports.isError ? (
          <LoadError error={reports.error} what="reports" onRetry={() => void reports.refetch()} />
        ) : reports.data?.items.length === 0 ? (
          <EmptyState
            icon={<MessageSquareWarning className="size-8" />}
            title="No reports yet"
            className="py-6"
          />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {reports.data?.items.map((r) => {
              const isOpen = open === r.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : r.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                  >
                    <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                    <Badge variant="secondary">{KIND_LABEL[r.kind] ?? r.kind}</Badge>
                    <span className="min-w-0 flex-1 truncate text-dense text-foreground">{r.summary}</span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">{r.reporter_email}</span>
                    <span className="text-xs text-muted-foreground">
                      <RelativeTime value={r.created_at} />
                    </span>
                    <span
                      title={r.emailed ? "Emailed" : (r.email_error ?? "Kept here only")}
                      className={cn(
                        "text-xs font-medium",
                        r.emailed ? "text-success" : r.email_error ? "text-warning" : "text-muted-foreground",
                      )}
                    >
                      {r.emailed ? "Emailed" : r.email_error ? "Not emailed" : "Stored"}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="space-y-3 px-3 pb-3 pl-9 text-dense">
                      {r.details && <p className="whitespace-pre-wrap text-foreground">{r.details}</p>}
                      <p className="text-xs text-muted-foreground">
                        From {r.reporter_email} ({r.reporter_role})
                        {!r.emailed && r.email_error ? ` · Not emailed: ${r.email_error}` : ""}
                      </p>
                      {r.has_screenshot && (
                        <a href={`/api/admin/feedback/${r.id}/screenshot`} target="_blank" rel="noreferrer">
                          <img
                            src={`/api/admin/feedback/${r.id}/screenshot`}
                            alt={`Screenshot sent with “${r.summary}”`}
                            className="max-h-64 rounded-md border border-border"
                          />
                        </a>
                      )}
                      <dl className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-0.5 text-xs">
                        {rows(r.context).map(([k, v]) => (
                          <div key={k} className="contents">
                            <dt className="text-muted-foreground">{k}</dt>
                            <dd className="whitespace-pre-wrap break-words text-foreground">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
