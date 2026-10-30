import { useMemo, useState } from "react";
import { Info } from "lucide-react";

import { sanitizeAttributionHtml } from "../../lib/utils";
import { cn } from "../../lib/utils";

/** Status bar (bottom-left): live zoom + cursor coordinates + attribution.
 *  On a phone it folds into an ⓘ button so it doesn't sit on the map bar;
 *  tap it for the same details. Styled with theme tokens. */
export interface MapStatus {
  zoom: number;
  lat: number;
  lng: number;
}

export function MapStatusBar({
  status,
  attribution,
  compact = false,
  className,
  rightInset = 10,
}: {
  status: MapStatus | null;
  attribution: string;
  compact?: boolean;
  className?: string;
  /** Distance of the attribution chip from the right edge, so it clears the side panel. */
  rightInset?: number;
}) {
  const safeAttribution = useMemo(() => sanitizeAttributionHtml(attribution), [attribution]);
  const [open, setOpen] = useState(false);
  const details = (
    <>
      <span className="font-medium tabular-nums">z{status?.zoom.toFixed(1) ?? "—"}</span>
      <span className="tabular-nums">
        {status ? `${status.lat.toFixed(5)}, ${status.lng.toFixed(5)}` : "—"}
      </span>
    </>
  );

  if (compact) {
    return (
      // One frosted capsule: the info button, and the details open inside it.
      <div
        className={cn(
          "glass absolute left-2.5 z-(--z-sticky) flex max-w-[calc(100vw-5rem)] items-center rounded-xl text-xs text-foreground/80",
          className,
        )}
      >
        <button
          type="button"
          aria-label="Map details and attribution"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid size-11 shrink-0 place-items-center rounded-xl"
        >
          <Info className="size-4" />
        </button>
        {open && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 py-1 pr-4">
            {details}
            <span className="text-muted-foreground" dangerouslySetInnerHTML={{ __html: safeAttribution }} />
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Zoom and cursor position: bottom-left, never in the way of the pointer. */}
      <div
        className={cn(
          "map-panel pointer-events-none absolute bottom-2.5 left-2.5 z-(--z-sticky) flex h-6 items-center gap-3 px-3 text-xs text-muted-foreground",
          className,
        )}
      >
        {details}
      </div>
      {/* Attribution: small, in the opposite corner, and clickable (it links to the data licences). */}
      <div
        style={{ right: rightInset }}
        className="map-panel absolute bottom-2.5 z-(--z-sticky) flex h-6 items-center px-2 text-micro text-muted-foreground transition-[right] duration-(--duration-slow) ease-(--ease-out) [&_a]:underline-offset-2 hover:[&_a]:underline"
        dangerouslySetInnerHTML={{ __html: safeAttribution }}
      />
    </>
  );
}
