import { Suspense, lazy } from "react";

import { Skeleton } from "./ui/skeleton";

const LocationPickerMap = lazy(() => import("./map/LocationPickerMap"));

/** A small read-only map with one pin, for a record page's Details card.
 *  Lazy, so MapLibre only loads on pages that show one. */
export function MiniMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full rounded-md" />}>
      <LocationPickerMap position={{ lat: latitude, lng: longitude }} readOnly className="h-40" />
    </Suspense>
  );
}
