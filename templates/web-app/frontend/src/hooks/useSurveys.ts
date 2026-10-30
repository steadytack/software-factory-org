import { useQuery, type QueryClient } from "@tanstack/react-query";

import { createCrudHooks } from "./createCrudHooks";
import { fetchAllPages } from "./fetchAllPages";
import { api, expectData } from "../api/client";
import { filterCachedList, withOfflineFallback } from "../lib/offlineData";
import { withPendingList } from "../lib/pendingRecords";
import type { components } from "../types/openapi";

type SurveyCreate = components["schemas"]["SurveyCreate"];
type SurveyUpdate = components["schemas"]["SurveyUpdate"];
type SurveyRead = components["schemas"]["SurveyRead"];
type SurveyList = components["schemas"]["SurveyList"];

const surveyHooks = createCrudHooks<SurveyCreate, SurveyUpdate, SurveyRead, SurveyList>({
  key: "surveys",
  list: (siteId, offset, limit) => {
    const call = () =>
      api.GET("/api/surveys", {
        params: { query: { offset, limit, site_id: siteId } },
      });
    return expectData(call(), call);
  },
  get: (id) => {
    const call = () =>
      api.GET("/api/surveys/{entity_id}", { params: { path: { entity_id: id } } });
    return expectData(call(), call);
  },
  create: (body) => expectData(() => api.POST("/api/surveys", { body })),
  update: (id, body) =>
    expectData(
      () => api.PATCH("/api/surveys/{entity_id}", { params: { path: { entity_id: id } }, body }),
    ),
  remove: (id) =>
    expectData(
      () => api.DELETE("/api/surveys/{entity_id}", { params: { path: { entity_id: id } } }),
    ),
});

export interface SurveyFilters {
  siteId?: string;
  status?: "draft" | "completed";
  dateFrom?: string;
  dateTo?: string;
  q?: string;
}

/** Every survey matching the filters (paged under the hood, see fetchAllPages). */
export function useAllSurveys(filters: SurveyFilters = {}, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ ...allSurveysQuery(filters), enabled });
}

const surveysKey = ({ siteId, status, dateFrom, dateTo, q }: SurveyFilters) =>
  ["surveys", "all-pages", siteId ?? "any", status, dateFrom, dateTo, q] as const;

/** Also used by the background sync (lib/backgroundSync.ts). */
export function allSurveysQuery(filters: SurveyFilters = {}) {
  const { siteId, status, dateFrom, dateTo, q } = filters;
  // Offline, a site's surveys come from the synced list of every survey.
  const offline = (client: QueryClient) =>
    siteId && !status && !dateFrom && !dateTo && !q
      ? filterCachedList<SurveyRead>(client, surveysKey({}), (s) => s.site_id === siteId)
      : undefined;
  // Which surveys made offline belong in this list (lib/pendingRecords.ts).
  const keep = (s: SurveyRead) =>
    (!siteId || s.site_id === siteId) && (!status || s.status === status) && !dateFrom && !dateTo && !q;
  const request = () =>
    fetchAllPages((offset, limit) => {
        const call = () =>
          api.GET("/api/surveys", {
            params: {
              query: {
                offset,
                limit,
                site_id: siteId,
                status,
                date_from: dateFrom,
                date_to: dateTo,
                q: q || undefined,
              },
            },
          });
        return expectData(call(), call);
      });
  return {
    queryKey: surveysKey(filters),
    queryFn: async ({ client }: { client: QueryClient }) =>
      withPendingList(client, "surveys", await withOfflineFallback(request, () => offline(client)), keep),
  };
}

export const useSurveys = surveyHooks.useList;
export const useSurvey = surveyHooks.useGet;
export const useCreateSurvey = surveyHooks.useCreate;
export const useUpdateSurvey = surveyHooks.useUpdate;
export const useDeleteSurvey = surveyHooks.useDelete;
