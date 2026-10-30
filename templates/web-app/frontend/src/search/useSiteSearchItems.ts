import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { registerSearchItem, unregisterSearchItem } from "./registry";
import { useSiteLocations } from "../hooks/useSites";

const GROUP = "Sites";

/** Registers each loaded site as a searchable item (name → site detail).
 *  Mount once inside the app shell; items update as the sites query
 *  refetches and are unregistered on unmount. */
export function useSiteSearchItems() {
  const navigate = useNavigate();
  const { data } = useSiteLocations();

  useEffect(() => {
    if (!data) return;
    for (const site of data.items) {
      registerSearchItem({
        id: `site-${site.id}`,
        label: site.name,
        group: GROUP,
        keywords: ["site", "survey", site.site_type, site.postcode ?? "", site.address ?? ""],
        hint: site.site_type,
        action: () => navigate(`/sites/${site.id}`),
      });
    }
    return () => {
      for (const site of data.items) unregisterSearchItem(`site-${site.id}`);
    };
  }, [data, navigate]);
}
