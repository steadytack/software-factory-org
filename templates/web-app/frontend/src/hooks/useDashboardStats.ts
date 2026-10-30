import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "../api/client";
import type { components } from "../types/openapi";

/** Shape returned by GET /api/stats/dashboard (backend app/api/endpoints/stats.py). */
export type DashboardStats = components["schemas"]["DashboardStats"];

/** Aggregate dashboard KPIs — computed in SQL server-side so counts are
 *  correct regardless of row count (no page-cap bias). */
export function useDashboardStats(days = 7) {
  return useQuery({
    queryKey: ["stats", "dashboard", days],
    queryFn: () =>
      fetchJson<DashboardStats>(`/api/stats/dashboard?days=${days}`, {}, "Dashboard stats failed"),
  });
}
