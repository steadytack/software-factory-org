import { useQuery, type QueryClient } from "@tanstack/react-query";

import { createCrudHooks } from "./createCrudHooks";
import { fetchAllPages } from "./fetchAllPages";
import { api, expectData } from "../api/client";
import { withPendingList } from "../lib/pendingRecords";
import type { components } from "../types/openapi";

type SiteCreate = components["schemas"]["SiteCreate"];
type SiteUpdate = components["schemas"]["SiteUpdate"];
type SiteRead = components["schemas"]["SiteRead"];
type SiteList = components["schemas"]["SiteList"];

const siteHooks = createCrudHooks<SiteCreate, SiteUpdate, SiteRead, SiteList>({
  key: "sites",
  // Surveys show the site name, and a delete cascades to them.
  alsoInvalidate: ["surveys"],
  list: (_parentId, offset, limit) => {
    const call = () =>
      api.GET("/api/sites", { params: { query: { offset, limit } } });
    return expectData(call(), call);
  },
  get: (id) => {
    const call = () =>
      api.GET("/api/sites/{site_id}", { params: { path: { site_id: id } } });
    return expectData(call(), call);
  },
  create: (body) => expectData(() => api.POST("/api/sites", { body })),
  update: (id, body) =>
    expectData(
      () => api.PATCH("/api/sites/{site_id}", { params: { path: { site_id: id } }, body }),
    ),
  remove: (id) =>
    expectData(() => api.DELETE("/api/sites/{site_id}", { params: { path: { site_id: id } } })),
});

// Sites are a flat (non-parented) resource: callers pass (offset, limit).
// Wrap the factory's useList (parentId, offset, limit) to match that contract.
function useSites(offset = 0, limit = 50) {
  return siteHooks.useList(undefined, offset, limit);
}

export { useSites };

/** Every site (paged under the hood, see fetchAllPages) for the Sites table. */
export function useAllSites() {
  return useQuery(allSitesQuery());
}

export const ALL_SITES_KEY = ["sites", "all-pages"] as const;

/** Also used by the background sync (lib/backgroundSync.ts). */
export function allSitesQuery() {
  return {
    queryKey: ALL_SITES_KEY,
    // With sites made offline and not uploaded yet (lib/pendingRecords.ts).
    queryFn: async ({ client }: { client: QueryClient }) =>
      withPendingList(
        client,
        "sites",
        await fetchAllPages((offset, limit) => {
          const call = () => api.GET("/api/sites", { params: { query: { offset, limit } } });
          return expectData(call(), call);
        }),
        () => true,
      ),
  };
}

/** Every site as a point (id, name, type, status, address, coordinates) in
 *  one request — for the map, global search and site pickers, which used
 *  to see only the first 200 sites. */
export function useSiteLocations() {
  return useQuery(siteLocationsQuery());
}

export function siteLocationsQuery() {
  return {
    queryKey: ["sites", "geo"],
    // Sites made offline can be picked and mapped before they upload.
    queryFn: async ({ client }: { client: QueryClient }) =>
      withPendingList(client, "sites", await expectData(() => api.GET("/api/sites/geo", {})), () => true),
  };
}
export const useSite = siteHooks.useGet;
export const useCreateSite = siteHooks.useCreate;
export const useUpdateSite = siteHooks.useUpdate;
export const useDeleteSite = siteHooks.useDelete;
