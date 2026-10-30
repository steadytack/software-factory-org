/**
 * useMapLayers — manages GeoJSON and PMTiles data layers on the map.
 * Separate from the drawing system; these are read-only reference overlays
 * with configurable styling and click-to-inspect attribute popups.
 *
 * The layer engine (source/layer building, styling, images) lives in
 * ../layers/*; this file holds the React state and public API only.
 */

import { filteredIndices, type DataLayerFilter } from "../layers/dataFilter";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { FeaturePopupState } from "../MapContextMenu";
import {
  applyPaint,
  applyVisibility,
  addToMap,
  circleId,
  fillId,
  lineId,
  rebuildLabelLayer,
  removeFromMap,
  setLayerSourceData,
  srcId,
} from "../layers/engine";
import {
  DEFAULT_DATA_LAYER_STYLE,
  type DataLayerStyle,
  type MapDataLayer,
} from "../layers/types";
import { BRAND_BLUE, LAYER_PALETTE } from "../layers/colors";

// Public types/defaults are re-exported so existing imports from this hook
// (MapRightPanel, exportMap, layerStyles) keep working unchanged.
export type { DataLayerStyle, LayerStylePreset, MapDataLayer, PointShape } from "../layers/types";
export { DEFAULT_DATA_LAYER_STYLE };

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Resolve a CSS custom property (oklch in this theme) to #rrggbb — MapLibre
 *  and <input type="color"> both need sRGB hex. Painting one pixel lets the
 *  browser do the colour-space conversion. */
function cssVarToHex(name: string, fallback: string): string {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const ctx = document.createElement("canvas").getContext("2d");
    if (!raw || !ctx) return fallback;
    ctx.fillStyle = raw;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return fallback;
  }
}

function darken(hex: string, factor = 0.72): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * factor);
  return `#${[ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** First overlay takes the brand primary; the rest stay categorical (the
 *  theme's chart ramp is all blues, too close to tell stacked layers apart). */
function layerColor(index: number) {
  if (index === 0) {
    const fill = cssVarToHex("--primary", BRAND_BLUE);
    return { fill, stroke: darken(fill) };
  }
  return LAYER_COLORS[index % LAYER_COLORS.length];
}

const LAYER_COLORS = LAYER_PALETTE;

let layerIdCounter = 1;
function newLayerId(): string {
  return `dl-${Date.now()}-${layerIdCounter++}`;
}

/** Bounding box from a set of lng/lat coordinate pairs; null when empty. */
function boundsFromCoords(coords: number[][]): [[number, number], [number, number]] | null {
  if (!coords.length) return null;
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

/** Collect lng/lat pairs from a GeoJSON geometry (any type). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function coordsFromGeometry(g: any): number[][] {
  if (!g) return [];
  if (g.type === "Point") return [g.coordinates];
  if (g.type === "LineString") return [...g.coordinates];
  if (g.type === "MultiLineString") return g.coordinates.flat();
  if (g.type === "Polygon") return [...g.coordinates[0]];
  if (g.type === "MultiPolygon") return g.coordinates.flat()[0];
  return [];
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useMapLayers({
  mapRef,
  onToast,
}: {
  mapRef: RefObject<MapLibreMap | null>;
  onToast?: (msg: string) => void;
}) {
  const [layers, setLayers] = useState<MapDataLayer[]>([]);
  const layersRef = useRef<MapDataLayer[]>([]);
  // Tracks active attribute-table filter indices per layer (null = no filter)
  const filteredIndicesRef = useRef<Map<string, number[] | null>>(new Map());
  const [popupState, setPopupState] = useState<FeaturePopupState | null>(null);
  const closePopup = useCallback(() => setPopupState(null), []);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  /**
   * Re-adds all data layers to the map. Call this after a basemap style swap
   * (map.setStyle wipes all custom sources/layers). Wire up via map.once('idle', rehydrate).
   */
  const rehydrate = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const currentLayers = layersRef.current;
    currentLayers.forEach((layer) => {
      try {
        removeFromMap(map, layer.id);
      } catch {
        /* ignore */
      }
      try {
        addToMap(map, layer);
      } catch {
        /* ignore */
      }
    });
    // Re-apply any active attribute-table filters
    currentLayers.forEach((layer) => {
      const indices = filteredIndicesRef.current.get(layer.id) ?? null;
      if (indices !== null && layer.data) {
        const filtered = {
          ...layer.data,
          features: indices.map((i) => layer.data!.features[i]).filter(Boolean),
        };
        setLayerSourceData(map, layer.id, filtered);
      }
    });
  }, [mapRef]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      const map = mapRef.current;
      if (!map) return;
      layersRef.current.forEach((l) => {
        try {
          removeFromMap(map, l.id);
        } catch {
          /* ignore */
        }
      });
    };
  }, [mapRef]);

  // Wire up click handler for attribute popup on a single layer
  const attachClickHandler = useCallback((map: MapLibreMap, layer: MapDataLayer) => {
    const clickHandler = (e: maplibregl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties ?? {};
      const entries = Object.entries(props)
        .filter(([k]) => !k.startsWith("_"))
        .map(([k, v]): [string, string] => [k, v != null ? String(v) : ""]);
      if (entries.length === 0) return;

      const canvasEl = map.getCanvas();
      const rect = canvasEl.getBoundingClientRect();
      const point = e.point;
      setPopupState({
        x: rect.left + point.x,
        y: rect.top + point.y,
        layerName: layer.name,
        entries,
      });
    };

    [fillId(layer.id), lineId(layer.id), circleId(layer.id)].forEach((lid) => {
      if (map.getLayer(lid)) {
        map.on("click", lid, clickHandler);
        map.on("mouseenter", lid, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", lid, () => {
          map.getCanvas().style.cursor = "";
        });
      }
    });
  }, []);

  // Re-sync any layers that arrived before the map style finished loading.
  // "load" fires once when the initial style is fully ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const sync = () => {
      layersRef.current.forEach((layer) => {
        if (!map.getSource(srcId(layer.id))) {
          addToMap(map, layer);
          setTimeout(() => {
            const m = mapRef.current;
            if (m) attachClickHandler(m, layer);
          }, 0);
        }
      });
    };
    if (map.isStyleLoaded()) {
      sync();
    } else {
      map.once("load", sync);
    }
    return () => {
      try {
        map.off("load", sync);
      } catch {
        /* ignore */
      }
    };
  }, [mapRef, attachClickHandler]);

  const _internalAdd = useCallback(
    (layer: MapDataLayer) => {
      const map = mapRef.current;
      const add = () => {
        if (!map || map.getSource(srcId(layer.id))) return;
        try {
          addToMap(map, layer);
        } catch (err) {
          // A layer MapLibre can't draw must not break the page: take it
          // back out and say so.
          try {
            removeFromMap(map, layer.id);
          } catch {
            /* ignore */
          }
          layersRef.current = layersRef.current.filter((l) => l.id !== layer.id);
          setLayers((prev) => prev.filter((l) => l.id !== layer.id));
          onToast?.(`Couldn't draw "${layer.name}"${err instanceof Error ? `: ${err.message}` : ""}`);
          return;
        }
        // Give MapLibre a tick to add the layers before attaching handlers
        setTimeout(() => {
          const m = mapRef.current;
          if (m) attachClickHandler(m, layer);
        }, 0);
      };
      // Tiles still loading make isStyleLoaded() false; add once the map
      // settles rather than dropping the layer (audit 2026-09-27, SPEC-35).
      setLayers((prev) => [...prev, layer]);
      layersRef.current = [...layersRef.current, layer];
      if (map && map.isStyleLoaded()) add();
      else map?.once("idle", add);
    },
    [mapRef, attachClickHandler, onToast],
  );

  // ── Public API ──────────────────────────────────────────────────────────────

  const addGeoJSONLayer = useCallback(
    (
      name: string,
      data: FeatureCollection,
      styleOverride?: Partial<DataLayerStyle>,
      service?: MapDataLayer["service"],
    ) => {
      const c = layerColor(layersRef.current.length);
      const layer: MapDataLayer = {
        id: newLayerId(),
        name,
        type: "geojson",
        visible: true,
        collapsed: true,
        data,
        service,
        style: {
          ...DEFAULT_DATA_LAYER_STYLE,
          fillColor: c.fill,
          strokeColor: c.stroke,
          ...styleOverride,
        },
        featureCount: data.features.length,
      };
      _internalAdd(layer);
      onToast?.(`Loaded "${name}" — ${data.features.length} features`);
    },
    [_internalAdd, onToast],
  );

  const addPMTilesLayer = useCallback(
    (name: string, url: string, styleOverride?: Partial<DataLayerStyle>) => {
      const c = layerColor(layersRef.current.length);
      const layer: MapDataLayer = {
        id: newLayerId(),
        name,
        type: "pmtiles",
        visible: true,
        collapsed: true,
        url,
        style: {
          ...DEFAULT_DATA_LAYER_STYLE,
          fillColor: c.fill,
          strokeColor: c.stroke,
          ...styleOverride,
        },
        featureCount: 0,
      };
      _internalAdd(layer);
      onToast?.(`Loading PMTiles "${name}"…`);
    },
    [_internalAdd, onToast],
  );

  const addWMSLayer = useCallback(
    (name: string, tileUrl: string, attribution?: string, legendUrl?: string) => {
      const layer: MapDataLayer = {
        id: newLayerId(),
        name,
        type: "wms",
        visible: true,
        collapsed: true,
        url: tileUrl,
        attribution,
        legendUrl,
        style: { ...DEFAULT_DATA_LAYER_STYLE, fillOpacity: 0.85 },
        featureCount: 0,
      };
      _internalAdd(layer);
      onToast?.(`Added WMS layer "${name}"`);
    },
    [_internalAdd, onToast],
  );

  const updateLayerStyle = useCallback(
    (id: string, stylePartial: Partial<DataLayerStyle>) => {
      setLayers((prev) => {
        const next = prev.map((l) =>
          l.id === id ? { ...l, style: { ...l.style, ...stylePartial } } : l,
        );
        const updated = next.find((l) => l.id === id);
        const map = mapRef.current;
        if (updated && map && map.isStyleLoaded()) {
          applyPaint(map, updated);
          // If labelField changed, the label layer must be rebuilt
          // (add/remove the symbol layer to match).
          if (stylePartial.labelField !== undefined) {
            rebuildLabelLayer(map, updated);
          }
        }
        return next;
      });
    },
    [mapRef],
  );

  const toggleLayerVisible = useCallback(
    (id: string) => {
      setLayers((prev) => {
        const next = prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l));
        const updated = next.find((l) => l.id === id);
        if (updated) {
          const map = mapRef.current;
          if (map && map.isStyleLoaded()) applyVisibility(map, updated);
        }
        return next;
      });
    },
    [mapRef],
  );

  const toggleLayerCollapsed = useCallback((id: string) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, collapsed: !l.collapsed } : l)));
  }, []);

  const removeLayer = useCallback(
    (id: string) => {
      const map = mapRef.current;
      if (map) {
        try {
          removeFromMap(map, id);
        } catch {
          /* ignore */
        }
      }
      setPopupState(null);
      setLayers((prev) => prev.filter((l) => l.id !== id));
    },
    [mapRef],
  );

  const zoomToLayer = useCallback(
    (id: string) => {
      const layer = layersRef.current.find((l) => l.id === id);
      const map = mapRef.current;
      if (!map || !layer?.data) return;
      const activeIndices = filteredIndicesRef.current.get(id) ?? null;
      const features =
        activeIndices !== null
          ? activeIndices.map((i) => layer.data!.features[i]).filter(Boolean)
          : layer.data.features;
      const coords: number[][] = [];
      features.forEach((f) => {
        coords.push(...coordsFromGeometry(f.geometry));
      });
      const bounds = boundsFromCoords(coords);
      if (!bounds) return;
      map.fitBounds(bounds, { padding: 60, maxZoom: 18, duration: 600 });
    },
    [mapRef],
  );

  /** Returns the currently-visible features for a layer (respects active attribute-table filter). */
  const getLayerFeatures = useCallback((layerId: string) => {
    const layer = layersRef.current.find((l) => l.id === layerId);
    if (!layer?.data) return [];
    const activeIndices = filteredIndicesRef.current.get(layerId) ?? null;
    return activeIndices !== null
      ? activeIndices.map((i) => layer.data!.features[i]).filter(Boolean)
      : layer.data.features;
  }, []);

  const filterLayerFeatures = useCallback(
    (layerId: string, indices: number[] | null) => {
      const layer = layersRef.current.find((l) => l.id === layerId);
      const map = mapRef.current;
      if (!map || !layer?.data) return;
      // Keep the ref in sync so zoomToLayer knows about the active filter
      filteredIndicesRef.current.set(layerId, indices);
      if (indices === null) {
        setLayerSourceData(map, layerId, layer.data);
      } else {
        setLayerSourceData(map, layerId, {
          ...layer.data,
          features: indices.map((i) => layer.data!.features[i]).filter(Boolean),
        });
      }
    },
    [mapRef],
  );

  /** New features for a layer (e.g. a web service fetched for a new view),
   *  keeping its style and filter. */
  const replaceLayerData = useCallback(
    (layerId: string, data: FeatureCollection) => {
      const layer = layersRef.current.find((l) => l.id === layerId);
      if (!layer) return;
      const updated = { ...layer, data, featureCount: data.features.length };
      layersRef.current = layersRef.current.map((l) => (l.id === layerId ? updated : l));
      setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, data, featureCount: data.features.length } : l)));
      filterLayerFeatures(layerId, filteredIndices(data.features, layer.filter));
      const map = mapRef.current;
      if (map && !layer.filter) setLayerSourceData(map, layerId, data);
    },
    [filterLayerFeatures, mapRef],
  );

  /** Show only the features matching a property filter (null clears it). */
  const setLayerFilter = useCallback(
    (layerId: string, filter: DataLayerFilter | null) => {
      const layer = layersRef.current.find((l) => l.id === layerId);
      if (!layer?.data) return;
      const updated = { ...layer, filter };
      layersRef.current = layersRef.current.map((l) => (l.id === layerId ? updated : l));
      setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, filter } : l)));
      filterLayerFeatures(layerId, filteredIndices(layer.data.features, filter));
    },
    [filterLayerFeatures],
  );

  const zoomToFeature = useCallback(
    (feature: import("geojson").Feature) => {
      const map = mapRef.current;
      if (!map || !feature.geometry) return;
      const coords = coordsFromGeometry(feature.geometry);
      const bounds = boundsFromCoords(coords);
      if (!bounds) return;
      map.fitBounds(bounds, { padding: 80, maxZoom: 18, duration: 600 });
    },
    [mapRef],
  );

  return {
    layers,
    addGeoJSONLayer,
    addPMTilesLayer,
    addWMSLayer,
    updateLayerStyle,
    toggleLayerVisible,
    toggleLayerCollapsed,
    removeLayer,
    zoomToLayer,
    zoomToFeature,
    filterLayerFeatures,
    setLayerFilter,
    replaceLayerData,
    getLayerFeatures,
    rehydrate,
    popupState,
    closePopup,
  };
}