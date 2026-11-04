import { cn } from "../lib/utils";
import { ChartCard } from "../components/ui/chart-card";
import { LoadError } from "../components/LoadError";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ClipboardList,
  CalendarCheck,
  MapPin,
  ArrowRight,
  BarChart3,
  RefreshCw,
} from "lucide-react";

import { useSites } from "../hooks/useSites";
import { useSurveys } from "../hooks/useSurveys";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/ui/stat-card";
import { RelativeTime } from "../components/RelativeTime";
import { ManagedDataTable } from "../components/ui/ManagedDataTable";
import type { components } from "../types/openapi";
import { EmptyState } from "../components/ui/empty-state";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "../components/ui/button";
import { IconButton } from "../components/ui/icon-button";
import { Skeleton } from "../components/ui/skeleton";
import { TableSkeleton } from "../components/ui/table-skeleton";
import type { ChartPoint } from "../components/dashboard-charts";

// recharts is the heaviest thing on this page; the KPI tiles and table render
// while the two charts' chunk loads.
const SurveysTrendChart = lazy(() =>
  import("../components/dashboard-charts").then((m) => ({ default: m.SurveysTrendChart })),
);
const SurveysStatusChart = lazy(() =>
  import("../components/dashboard-charts").then((m) => ({ default: m.SurveysStatusChart })),
);
import { useRegisterHelpTopics } from "../help/useRegisterHelpTopics";
import { DASHBOARD_HELP_TOPICS } from "../help/pageTopics";
import { formatDate, formatDelta, formatWeekday } from "../lib/format";
import { vocabularyLabel } from "../lib/vocabularies";
import { Card } from "../components/ui/card";

type Survey = components["schemas"]["SurveyRead"];
type RecentSurveyRow = Survey & { siteName: string | null };

/** shown instead of a fabricated all-zero chart. */
function ChartEmptyState({ message }: { message: string }) {
  return (
    <EmptyState
      icon={<BarChart3 className="size-8" />}
      title="Nothing to chart yet"
      description={message}
      className="h-[200px] rounded-lg border border-dashed"
    />
  );
}

/** Chart points for an aggregate, or **null** when there is no data.
 *
 *  this used to return `fallbackLabels.map(l => ({l, value: 0}))`
 *  for an empty aggregate, so "no data yet" was drawn as a **real chart with
 *  every bar at zero** — fabricated data, indistinguishable from "we measured
 *  and the answer is zero". The fallback label list was also only 3 of the 7
 *  category values, so it was not even the right axis. `null` now means "no
 *  data", and the caller renders an explicit empty state.
 *
 *  A record whose values are all zero is NOT empty: the backend now returns
 *  every vocabulary value with an explicit 0, and that genuinely is
 *  "we measured, and there are none".
 */
export function toPoints(
  record: Record<string, number> | undefined,
): ChartPoint[] | null {
  if (!record) return null;
  const keys = Object.keys(record);
  if (keys.length === 0) return null;
  return keys.map((key) => ({
    // Only reformat genuine ISO dates (YYYY-MM-DD). A length check alone
    // mislabels 10-character category names like "structural"/"electrical"
    // as dates, producing "Invalid Date" axis labels.
    label: /^\d{4}-\d{2}-\d{2}$/.test(key) ? formatWeekday(key) : vocabularyLabel(key),
    value: record[key],
  }));
}


/** Re-render periodically so "Updated 2m ago" stays truthful. */
function useTick(ms: number) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function DashboardPage() {
  useRegisterHelpTopics(DASHBOARD_HELP_TOPICS);
  useTick(30_000);
  const statsQuery = useDashboardStats(7);
  const sitesQuery = useSites(0, 50);
  const surveysQuery = useSurveys(undefined, 0, 50);
  const stats = statsQuery.data;
  const isPending = statsQuery.isPending || sitesQuery.isPending || surveysQuery.isPending;
  const isFetching = statsQuery.isFetching || sitesQuery.isFetching || surveysQuery.isFetching;
  // Freshness = the oldest of the three sources, so the label never overclaims.
  const updatedAt = Math.min(
    ...[statsQuery.dataUpdatedAt, sitesQuery.dataUpdatedAt, surveysQuery.dataUpdatedAt].filter(Boolean),
  );

  function refresh() {
    void statsQuery.refetch();
    void sitesQuery.refetch();
    void surveysQuery.refetch();
  }

  const navigate = useNavigate();
  const sites = sitesQuery.data?.items;
  const recentSurveys = useMemo<RecentSurveyRow[]>(
    () =>
      (surveysQuery.data?.items ?? []).slice(0, 6).map((s) => ({
        ...s,
        siteName: sites?.find((x) => x.id === s.site_id)?.name ?? null,
      })),
    [surveysQuery.data, sites],
  );
  const recentColumns = useMemo<ColumnDef<RecentSurveyRow, unknown>[]>(
    () => [
      {
        id: "site",
        accessorKey: "siteName",
        header: "Site",
        meta: { maxWidth: "20rem" },
        cell: ({ row }) =>
          row.original.siteName ? (
            <Link
              to={`/sites/${row.original.site_id}`}
              className="text-foreground hover:text-primary hover:underline tap-area"
            >
              {row.original.siteName}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "surveyor",
        accessorKey: "surveyor",
        header: "Surveyor",
        cell: (info) => <span className="text-muted-foreground">{info.getValue<string>()}</span>,
      },
      {
        id: "survey_date",
        accessorKey: "survey_date",
        header: "Date",
        // one formatter everywhere.
        cell: (info) => <span className="text-muted-foreground">{formatDate(info.getValue<string>())}</span>,
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        cell: (info) => (
          <StatusBadge
            value={info.getValue<string>()}
            kind="survey"
            label={vocabularyLabel(info.getValue<string>())}
          />
        ),
      },
    ],
    [],
  );

  const draftSurveys = stats?.draft_surveys ?? 0;
  const totalSurveys = stats?.total_surveys ?? 0;
  const surveyDelta =
    (stats?.surveys_this_week ?? 0) - (stats?.surveys_prev_week ?? 0);

  const trendPoints = toPoints(stats?.surveys_per_day);
  const statusPoints = toPoints(stats?.surveys_by_status);
  // never a fabricated percentage — only when there is a total.
  const draftShare = totalSurveys
    ? `${Math.round((draftSurveys / totalSurveys) * 100)}%`
    : undefined;

  const pageHeader = (
    <PageHeader
      title="Dashboard"
      // One muted line: the date, then how fresh the numbers are.
      meta={
        <>
          <span>
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
          {Number.isFinite(updatedAt) && (
            <>
              <span aria-hidden className="hidden sm:inline">·</span>
              <span className="flex items-center gap-2" role="status">
                <span aria-hidden className="size-1.5 rounded-full bg-success" />
                <span>
                  Updated <RelativeTime value={new Date(updatedAt).toISOString()} />
                </span>
                {/* Data refreshes itself; this is for when you want it now. */}
                <IconButton label="Refresh" variant="ghost" size="icon-xs" onClick={refresh} disabled={isFetching}>
                  <RefreshCw className={isFetching ? "motion-safe:animate-spin" : undefined} />
                </IconButton>
              </span>
            </>
          )}
        </>
      }
    />
  );

  const loadError = statsQuery.error ?? sitesQuery.error ?? surveysQuery.error;
  if (!isPending && loadError) {
    return (
      <div className="flex flex-col gap-(--page-gap)">
        {pageHeader}
        <LoadError error={loadError} what="dashboard" onRetry={refresh} />
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex flex-col gap-(--page-gap)">
        {pageHeader}
        <div className="grid grid-cols-2 gap-(--page-gap) sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm",
                i === 2 && "col-span-2 sm:col-span-1",
              )}
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="size-4" />
              </div>
              <Skeleton className="h-8 w-14" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>
        <div className="grid gap-(--page-gap) lg:grid-cols-2">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
        <TableSkeleton rows={4} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-(--page-gap)">
      {pageHeader}

      {/* KPI row: each tile states its time basis in the meta line. */}
      <div className="grid grid-cols-2 gap-(--page-gap) sm:grid-cols-3">
        <Link
          to="/surveys?filters=status.is.draft"
          className="rounded-lg [&>div]:transition-colors hover:[&>div]:border-primary/40"
        >
          <StatCard
            label="Draft surveys"
            value={draftSurveys}
            delta={draftShare}
            // Neutral: a share of the total is not an improvement.
            trend="flat"
            meta={totalSurveys ? "of all surveys, as of now" : "none recorded yet"}
            icon={<ClipboardList />}
            className="h-full"
          />
        </Link>
        <StatCard
          label="Surveys this week"
          value={stats?.surveys_this_week ?? 0}
          delta={formatDelta(surveyDelta)}
          // A zero delta is flat, not up.
          trend={surveyDelta > 0 ? "up" : surveyDelta < 0 ? "down" : "flat"}
          meta="vs the previous week"
          icon={<CalendarCheck />}
        />
        <Link
          to="/sites"
          className="col-span-2 rounded-lg sm:col-span-1 [&>div]:transition-colors hover:[&>div]:border-primary/40"
        >
          <StatCard
            label="Total sites"
            value={stats?.total_sites ?? sites?.length ?? 0}
            meta={
              <>
                active + archived · <span className="text-primary">view all</span>
              </>
            }
            icon={<MapPin />}
            className="h-full"
          />
        </Link>
      </div>

      {/* Charts */}
      <div className="grid gap-(--page-gap) lg:grid-cols-2">
        <ChartCard title="Surveys, last 7 days" description="Recorded per day">
          {/* DSP-3: an explicit empty state, not a chart of zeros. */}
          {trendPoints ? (
            <Suspense fallback={<Skeleton className="h-[200px] rounded-lg" />}>
              <SurveysTrendChart points={trendPoints} />
            </Suspense>
          ) : (
            <ChartEmptyState message="No surveys recorded in the last 7 days." />
          )}
        </ChartCard>
        <ChartCard title="Surveys by status" description="All surveys, as of now">
          {statusPoints ? (
            <Suspense fallback={<Skeleton className="h-[200px] rounded-lg" />}>
              <SurveysStatusChart points={statusPoints} />
            </Suspense>
          ) : (
            <ChartEmptyState message="No surveys recorded yet." />
          )}
        </ChartCard>
      </div>

      {/* Recent surveys: a card like the others, its table running edge to edge under the header. */}
      <Card className="gap-0 py-0">
        <div className="flex items-center justify-between gap-4 border-b border-border py-2 pr-2 pl-3">
          <h2 className="text-sm leading-5 font-semibold text-foreground">Recent surveys</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/surveys">
              View all surveys
              <ArrowRight />
            </Link>
          </Button>
        </div>
        {recentSurveys.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-8" />}
            title="No surveys yet"
            description="Surveys recorded against any site will appear here."
          />
        ) : (
          <ManagedDataTable
            data={recentSurveys}
            columns={recentColumns}
            hideToolbar
            autoHeight
            bare
            onRowOpen={(r) => navigate(`/surveys/${r.id}`)}
          />
        )}
      </Card>
    </div>
  );
}
