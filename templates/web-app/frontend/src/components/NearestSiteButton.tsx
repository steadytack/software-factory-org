import { useState } from "react";
import { LocateFixed, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { accuracyNote, canLocate, formatDistance, getHere, NEAR_SITE_METRES, nearestSite, type LocatedSite } from "../lib/geolocate";

/** "Nearest site" beside a site picker: asks for the device's position only when tapped (no prompt just for opening a
 *  form), then picks the site within 500 m, saying how far it is so a wrong guess is easy to spot. With none that close
 *  it picks nothing and says how far the nearest one is. */
export function NearestSiteButton({
  sites,
  onPick,
}: {
  sites: LocatedSite[];
  onPick: (siteId: string) => void;
}) {
  const [locating, setLocating] = useState(false);
  if (!canLocate() || sites.length === 0) return null;

  async function locate() {
    setLocating(true);
    try {
      const here = await getHere();
      const nearest = nearestSite(here, sites);
      if (!nearest) return;
      const acc = accuracyNote(here.accuracy);
      if (nearest.close) {
        onPick(nearest.site.id);
        toast.success(`Nearest site: ${nearest.site.name}.`, {
          description: `${formatDistance(nearest.metres)} away (location ${acc.text}${acc.poor ? ", rough" : ""})`,
        });
      } else {
        toast.warning(`No site within ${NEAR_SITE_METRES} m.`, {
          description: `The nearest is ${nearest.site.name}, ${formatDistance(nearest.metres)} away. Choose a site from the list.`,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't get your location.");
    } finally {
      setLocating(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void locate()}
      disabled={locating}
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-primary hover:bg-accent disabled:opacity-60"
    >
      {locating ? <Loader2 className="size-3.5 animate-spin" /> : <LocateFixed className="size-3.5" />}
      Nearest site
    </button>
  );
}
