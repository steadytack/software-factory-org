/**
 * useMapUrlState — reflects the map's viewport in the URL as BNG
 * easting/northing + zoom (`?e=433700&n=336800&z=14`), so a location can be
 * linked to or bookmarked directly, and the map opens there on load.
 *
 * Follows the same read-once-on-mount / publish-with-replace pattern as
 * useTableUrlState: the map owns viewport state after mount, and every
 * update replaces the history entry rather than pushing one (panning must
 * not fill up Back).
 */
import { useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { enToLatLng, latLngToEN } from "../utils/coordinates";
import { HOME_VIEW } from "../mapLayers";

const EASTING_PARAM = "e";
const NORTHING_PARAM = "n";
const ZOOM_PARAM = "z";

export interface MapUrlView {
  center: [number, number]; // [lng, lat]
  zoom: number;
}

function parseInitialView(params: URLSearchParams): MapUrlView {
  const eStr = params.get(EASTING_PARAM);
  const nStr = params.get(NORTHING_PARAM);
  const zStr = params.get(ZOOM_PARAM);

  const e = eStr !== null ? Number(eStr) : NaN;
  const n = nStr !== null ? Number(nStr) : NaN;
  const z = zStr !== null ? Number(zStr) : NaN;

  if (!isFinite(e) || !isFinite(n)) return HOME_VIEW as MapUrlView;

  const ll = enToLatLng(e, n);
  if (!ll) return HOME_VIEW as MapUrlView;

  return {
    center: [ll.lng, ll.lat],
    zoom: isFinite(z) ? z : HOME_VIEW.zoom,
  };
}

export function useMapUrlState(): {
  initial: MapUrlView;
  publish: (center: { lng: number; lat: number }, zoom: number) => void;
} {
  const [params, setParams] = useSearchParams();

  const initialRef = useRef<MapUrlView | null>(null);
  if (!initialRef.current) {
    initialRef.current = parseInitialView(params);
  }

  const publish = useCallback(
    (center: { lng: number; lat: number }, zoom: number) => {
      const en = latLngToEN(center.lat, center.lng);
      // Outside Great Britain — BNG has no coordinates for it, so leave any
      // existing e/n alone rather than writing something meaningless.
      if (!en) return;
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set(EASTING_PARAM, String(Math.round(en.e)));
          next.set(NORTHING_PARAM, String(Math.round(en.n)));
          next.set(ZOOM_PARAM, (Math.round(zoom * 10) / 10).toString());
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return { initial: initialRef.current, publish };
}
