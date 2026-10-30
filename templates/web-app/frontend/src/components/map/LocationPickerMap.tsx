/** Small embedded map for placing a site: shows one draggable pin; clicking
 *  the map or dragging the pin reports the new position. `readOnly` shows
 *  the pin only (a record page's Details). Follows the light/dark theme.
 *  Loaded lazily (see SiteLocationFields) so MapLibre stays out of the main
 *  bundle. */
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./map.css";

import { BASE_LAYER_MAP, defaultLayerFor, HOME_VIEW, type MapApiConfig } from "./mapLayers";
import { useTheme } from "../theme-provider";
import { cn } from "../../lib/utils";
import { BRAND_BLUE } from "./layers/colors";

const apiConfig: MapApiConfig = {
  maptilerKey: import.meta.env.VITE_MAPTILER_KEY as string | undefined,
  osKey: import.meta.env.VITE_OS_KEY as string | undefined,
};

export interface LatLng {
  lat: number;
  lng: number;
}

interface Props {
  /** Current pin, or null when the site has no valid coordinates yet. */
  position: LatLng | null;
  /** Bump to fly the map to `position` (e.g. after an address is chosen);
   *  plain pin moves from dragging don't re-centre the map. */
  focusKey?: number;
  onPick?: (pos: LatLng) => void;
  /** Show the pin without letting it be moved. */
  readOnly?: boolean;
  /** Height/rounding overrides for the map box. */
  className?: string;
}

/** The default basemap follows the theme, so the map isn't a bright block on a dark page. */
function styleFor(theme: "light" | "dark"): maplibregl.StyleSpecification {
  const key = defaultLayerFor(theme);
  return BASE_LAYER_MAP.get(key)!.getStyle(apiConfig) as maplibregl.StyleSpecification;
}

function readToken(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export default function LocationPickerMap({
  position,
  focusKey = 0,
  onPick,
  readOnly = false,
  className,
}: Props) {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleFor(resolvedTheme),
      center: position ? [position.lng, position.lat] : HOME_VIEW.center,
      zoom: position ? 16 : HOME_VIEW.zoom,
      attributionControl: { compact: true },
      // Don't hijack page scrolling over a small embedded map.
      cooperativeGestures: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.getCanvas().style.cursor = readOnly ? "default" : "";
    mapRef.current = map;

    const el = document.createElement("div");
    el.className = "map-site-marker";
    el.style.setProperty("--marker-color", readToken("--primary", BRAND_BLUE));
    const marker = new maplibregl.Marker({ element: el, draggable: !readOnly });
    markerRef.current = marker;
    if (position) marker.setLngLat([position.lng, position.lat]).addTo(map);

    if (!readOnly) {
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLngLat();
        onPickRef.current?.({ lat, lng });
      });
      map.on("click", (e) => {
        marker.setLngLat(e.lngLat).addTo(map);
        onPickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });
    }

    const resize = new ResizeObserver(() => map.resize());
    resize.observe(containerRef.current);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the theme (the pin is a DOM marker, so it survives the swap).
  const firstStyle = useRef(true);
  useEffect(() => {
    if (firstStyle.current) {
      firstStyle.current = false;
      return;
    }
    mapRef.current?.setStyle(styleFor(resolvedTheme));
  }, [resolvedTheme]);

  // Keep the pin in sync with typed coordinates / chosen addresses.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    if (!position) {
      marker.remove();
      return;
    }
    marker.setLngLat([position.lng, position.lat]).addTo(map);
  }, [position]);

  // Fly to the position when asked (address chosen, postcode looked up).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position || focusKey === 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.flyTo({
      center: [position.lng, position.lat],
      zoom: Math.max(map.getZoom(), 16),
      duration: reduce ? 0 : 700,
    });
    // Only on an explicit focus request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  return (
    <div
      ref={containerRef}
      className={cn("h-56 w-full overflow-hidden rounded-md border border-border bg-muted", className)}
      aria-label={readOnly ? "Map showing the position" : "Map: click or drag the pin to set the site's position"}
      role={readOnly ? "img" : "application"}
    />
  );
}
