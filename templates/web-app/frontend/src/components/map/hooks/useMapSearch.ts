/**
 * useMapSearch — search bar logic for the map.
 * Handles BNG coordinates, lat/lng pairs, UK postcodes, and address/place
 * name lookups with debounced autocomplete. Ported from the reference
 * template's useMapSearch hook.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { parseEN, parseLatLng, isPostcodeLike } from "../utils/coordinates";
import {
  geocodePostcode,
  autocompletePostcodes,
  geocodePlace,
  autocompleteAddresses,
  type GeoResult,
} from "../utils/geocode";
import { STATUS_DRAFT, WHITE } from "../layers/colors";

export interface SearchSuggestion {
  id: string;
  label: string;
  sublabel?: string;
  lat?: number;
  lng?: number;
  zoom?: number;
}

interface UseMapSearchOptions {
  mapRef: React.RefObject<MapLibreMap | null>;
  onToast?: (msg: string) => void;
}

/** An exact-location suggestion for a typed BNG or lat/lng pair. */
function coordinateSuggestion(q: string): SearchSuggestion | null {
  const en = parseEN(q);
  if (en) {
    return { id: "coord-bng", label: `Go to ${q}`, sublabel: "British National Grid", lat: en.lat, lng: en.lng, zoom: 16 };
  }
  const ll = parseLatLng(q);
  if (ll) {
    return {
      id: "coord-latlng",
      label: `Go to ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`,
      sublabel: "Latitude, longitude",
      lat: ll.lat,
      lng: ll.lng,
      zoom: 16,
    };
  }
  return null;
}

export function useMapSearch({ mapRef, onToast }: UseMapSearchOptions) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<{
    lng: number;
    lat: number;
    label: string;
  } | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortCtrl = useRef<AbortController | null>(null);

  // Abort in-flight autocomplete and clear the debounce on unmount so no
  // setState fires on an unmounted component.
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      abortCtrl.current?.abort();
    };
  }, []);

  const flyTo = useCallback(
    (lng: number, lat: number, zoom = 14, label?: string) => {
      const map = mapRef.current;
      if (!map) return;
      map.flyTo({ center: [lng, lat], zoom, duration: 600 });
      setSearchResult(label ? { lng, lat, label } : null);
    },
    [mapRef],
  );

  // ── Handle search submit ───────────────────────────────────────────────────

  const handleSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;

      setSuggestions([]);
      setLoading(true);

      try {
        // 1. British National Grid: "EEEEE NNNNN"
        const en = parseEN(trimmed);
        if (en) {
          flyTo(en.lng, en.lat, 15, trimmed);
          setLoading(false);
          return;
        }

        // 2. Lat/Lng pair: "51.5, -0.12" or "51.5 -0.12"
        const ll = parseLatLng(trimmed);
        if (ll) {
          // flyTo takes (lng, lat) — these were passed the other way round,
          // sending "52.84, -2.27" to the Indian Ocean.
          flyTo(ll.lng, ll.lat, 15, `${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`);
          setLoading(false);
          return;
        }

        // 3. UK postcode (exact)
        if (isPostcodeLike(trimmed)) {
          const result = await geocodePostcode(trimmed);
          if (result) {
            flyTo(result.lng, result.lat, 15, result.label);
            setLoading(false);
            return;
          }
        }

        // 4. Address / place
        const place = await geocodePlace(trimmed);
        if (place) {
          flyTo(place.lng, place.lat, 14, place.label);
          setLoading(false);
          return;
        }

        onToast?.(`No result found for "${trimmed}"`);
      } catch {
        onToast?.("Search failed — check your connection");
      } finally {
        setLoading(false);
      }
    },
    [flyTo, onToast],
  );

  // ── Debounced autocomplete ────────────────────────────────────────────────

  const handleQueryChange = useCallback((q: string) => {
    setQuery(q);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (q.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    // A coordinate is its own answer: offer one exact "Go to" instead of
    // sending it to the address search (which returned unrelated places).
    const coord = coordinateSuggestion(q.trim());
    if (coord) {
      abortCtrl.current?.abort();
      setSuggestions([coord]);
      return;
    }
    debounceTimer.current = setTimeout(async () => {
      abortCtrl.current?.abort();
      const ctrl = new AbortController();
      abortCtrl.current = ctrl;
      try {
        const trimmed = q.trim();
        let results: SearchSuggestion[] = [];
        if (/^[A-Z]{1,2}\d/i.test(trimmed)) {
          const postcodes = await autocompletePostcodes(trimmed, ctrl.signal);
          results = postcodes.map((pc) => ({
            id: `pc-${pc}`,
            label: pc,
            sublabel: "Postcode",
          }));
        }
        if (results.length === 0) {
          const addresses = await autocompleteAddresses(trimmed, ctrl.signal);
          results = addresses.map((a: GeoResult, i: number) => ({
            id: `addr-${i}`,
            label: a.label.split(",").slice(0, 2).join(","),
            sublabel: a.label,
            lat: a.lat,
            lng: a.lng,
          }));
        }
        setSuggestions(results);
      } catch {
        // aborted or network error — leave suggestions as-is
      }
    }, 250);
  }, []);

  const selectSuggestion = useCallback(
    (s: SearchSuggestion) => {
      setQuery(s.label);
      setSuggestions([]);
      if (s.lat !== undefined && s.lng !== undefined) {
        flyTo(s.lng, s.lat, s.zoom ?? 14, s.sublabel ?? s.label);
      } else {
        void handleSearch(s.label);
      }
    },
    [flyTo, handleSearch],
  );

  const clearSearch = useCallback(() => {
    setQuery("");
    setSuggestions([]);
    setSearchResult(null);
  }, []);

  // ── Search result marker ──────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!searchResult) return;
    const el = document.createElement("div");
    el.style.cssText =
      `width:14px;height:14px;border-radius:50%;background:${STATUS_DRAFT};border:3px solid ${WHITE};box-shadow:0 1px 6px rgba(0,0,0,.45);`;
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([searchResult.lng, searchResult.lat])
      .addTo(map);
    return () => {
      marker.remove();
    };
  }, [searchResult, mapRef]);

  return {
    query,
    suggestions,
    loading,
    searchResult,
    handleQueryChange,
    handleSearch,
    selectSuggestion,
    clearSearch,
  };
}
