/**
 * useMapDraw — TerraDraw integration for MapLibre.
 *
 * Manages all drawing tools, feature state, overlay rendering,
 * measurement layers, and export helpers.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { Map as MapLibreMap } from "maplibre-gl";
import {
  TerraDraw,
  TerraDrawSelectMode,
  TerraDrawPointMode,
  TerraDrawLineStringMode,
  TerraDrawPolygonMode,
  TerraDrawCircleMode,
  type GeoJSONStoreFeatures,
  type SnapToCustom,
} from "terra-draw";

type Snapping = NonNullable<NonNullable<ConstructorParameters<typeof TerraDrawLineStringMode>[0]>["snapping"]>;
import { TerraDrawMapLibreAdapter, type StyleOverride } from "./maplibreAdapter";
import {
  loadMeasureSettings,
  saveMeasureSettings,
  type MeasureSettings,
} from "../utils/measurement";
import type { FeatureCollection } from "geojson";
import {
  SKETCH_LAYER_IDS,
  ensureCoordLayers,
  ensureHatchLayer,
  ensureMeasureLayers,
  ensureOverlaySources,
  getBoundsFromGeometry,
  updateCoordOverlay,
  updateHatchOverlay,
  updateMeasureOverlay,
  updateOverlay,
} from "../draw/overlay";
import type { DrawFeature, DrawLayer, DrawTool } from "../draw/types";
import { EMPTY_INDEX, addGeometry, nearestSnap, roundCoordinate, roundGeometry, type SnapIndex } from "../utils/snap";
import { drawToolInfo } from "../draw/tools";
import { nextName, sketchesToCSV, sketchesToGeoJSON } from "../draw/export";
import { importedStyle, loadSketches, saveSketches, storeFeature } from "../draw/persist";
import { DRAW_DEFAULT, INK } from "../layers/colors";

// Public types are re-exported so existing imports (MapRightPanel) keep
// working unchanged.
export type { DrawFeature, DrawLayer, DrawState, DrawTool, LineStyle } from "../draw/types";

// ─── Types ───────────────────────────────────────────────────────────────────

interface UseMapDrawOptions {
  mapRef: React.RefObject<MapLibreMap | null>;
  onToast?: (msg: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LAYER: DrawLayer = {
  id: "layer-0",
  name: "Layer 1",
  visible: true,
  collapsed: false,
  color: DRAW_DEFAULT,
  hatch: "none",
  fillOpacity: 0.3,
  lineStyle: "solid",
  weight: 2,
};

function applySketchVisibility(map: MapLibreMap, visible: boolean) {
  const vis = visible ? "visible" : "none";
  SKETCH_LAYER_IDS.forEach((lid) => {
    if (map.getLayer(lid)) map.setLayoutProperty(lid, "visibility", vis);
  });
}

/** A new marker's size, in pixels. */
const MARKER_SIZE = 8;

/** Screen distance (px) within which a click snaps to a point or edge. */
const SNAP_PX = 12;
const SNAP_STORAGE_KEY = "webapp.map.snap";

function loadSnapEnabled(): boolean {
  try {
    return localStorage.getItem(SNAP_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

let layerCounter = 1;
let featureCounter = 1;

function newLayerId() {
  return `layer-${Date.now()}-${layerCounter++}`;
}

function featureKindFromTool(tool: DrawTool): DrawFeature["kind"] {
  switch (tool) {
    case "point": return "marker";
    case "note": return "note";
    case "line": return "polyline";
    case "polygon": return "polygon";
    case "circle": return "circle";
    case "measure-distance":
    case "measure-area": return "measurement";
    default: return "marker";
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMapDraw({ mapRef, onToast }: UseMapDrawOptions) {
  const drawRef = useRef<TerraDraw | null>(null);
  const adapterRef = useRef<TerraDrawMapLibreAdapter | null>(null);
  const activeToolRef = useRef<DrawTool>(null);
  const hatchPatternsRegistered = useRef<Set<string>>(new Set());
  const styleDataHandlerRef = useRef<(() => void) | null>(null);
  // TerraDraw feature ids created via the Distance/Area tools — see the
  // updateMeasureOverlay doc comment for why this is tracked separately from
  // TerraDraw's own "mode" property.
  const measurementIdsRef = useRef<Set<string>>(new Set());

  const [activeTool, setActiveTool] = useState<DrawTool>(null);
  const [features, setFeatures] = useState<DrawFeature[]>([]);
  const [layers, setLayers] = useState<DrawLayer[]>([DEFAULT_LAYER]);
  const [activeLayerId, setActiveLayerId] = useState<string>(DEFAULT_LAYER.id);
  const [measureSettings, setMeasureSettings] = useState<MeasureSettings>(loadMeasureSettings);
  const [snapEnabled, setSnapEnabled] = useState(loadSnapEnabled);
  // Snap candidates outside TerraDraw (record points, data-layer corners and
  // edges near the view), supplied by the page via setSnapTargets.
  const snapIndexRef = useRef<SnapIndex>(EMPTY_INDEX);
  const snapEnabledRef = useRef(snapEnabled);
  snapEnabledRef.current = snapEnabled;
  // Corners and edges of the sketches already drawn, so a line can snap to a shape's corner or a marker (TerraDraw
  // snaps within one kind only). Rebuilt when the sketches change.
  const sketchIndexRef = useRef<SnapIndex>(EMPTY_INDEX);
  // Sketches are saved in this browser once the saved ones have been put back on the map (before that, the empty list
  // must not overwrite them).
  const canSaveRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const [sketchVisible, setSketchVisible] = useState(true);
  const sketchVisibleRef = useRef(true);
  useEffect(() => { sketchVisibleRef.current = sketchVisible; }, [sketchVisible]);

  // Refs so draw event callbacks (set up once) always read current values
  const measureSettingsRef = useRef<MeasureSettings>(measureSettings);
  const featuresRef = useRef<DrawFeature[]>([]);
  const layersRef = useRef<DrawLayer[]>(layers);
  const activeLayerIdRef = useRef<string>(activeLayerId);
  useEffect(() => { measureSettingsRef.current = measureSettings; }, [measureSettings]);
  useEffect(() => { featuresRef.current = features; }, [features]);
  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { activeLayerIdRef.current = activeLayerId; }, [activeLayerId]);

  // Keep ref in sync
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);

  // ─── Snapping ─────────────────────────────────────────────────────────────

  /** Nearest external target (record point, data-layer corner or edge)
   *  within SNAP_PX. Runs after TerraDraw's own snapping to sketches (their
   *  corners and edges) and wins when it matches. */
  const snapToTargets = useRef<SnapToCustom>((event, context) => {
    const cursor = { lng: event.lng, lat: event.lat, x: event.containerX, y: event.containerY };
    const hit =
      nearestSnap(sketchIndexRef.current, cursor, context.project, SNAP_PX) ??
      nearestSnap(snapIndexRef.current, cursor, context.project, SNAP_PX);
    return hit ? roundCoordinate(hit) : undefined;
  }).current;

  const snappingFor = useCallback(
    (on: boolean): Snapping => (on ? { toCoordinate: true, toLine: true, toCustom: snapToTargets } : {}),
    [snapToTargets],
  );

  // ─── Initialize TerraDraw on map load ────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const setup = () => {
      const adapter = new TerraDrawMapLibreAdapter(map, { coordinatePrecision: 9 });
      adapter.initialise();
      adapterRef.current = adapter;

      const draw = new TerraDraw({
        adapter,
        modes: [
          new TerraDrawSelectMode({
            flags: {
              point: { feature: { draggable: true, rotateable: false, scaleable: false, coordinates: {} } },
              linestring: { feature: { draggable: true, rotateable: false, scaleable: false, coordinates: { midpoints: true, draggable: true, deletable: true } } },
              polygon: { feature: { draggable: true, rotateable: false, scaleable: false, coordinates: { midpoints: true, draggable: true, deletable: true } } },
              circle: { feature: { draggable: true, rotateable: false, scaleable: false, coordinates: {} } },
            },
          }),
          new TerraDrawPointMode(),
          new TerraDrawLineStringMode({ snapping: snappingFor(snapEnabledRef.current) }),
          new TerraDrawPolygonMode({ snapping: snappingFor(snapEnabledRef.current) }),
          new TerraDrawCircleMode(),
        ],
      });

      draw.start();
      drawRef.current = draw;

      // Picking a sketch on the map opens it in the list (and the other way round: see selectOnMap).
      draw.on("select", (id) => setSelectedId(String(id)));
      draw.on("deselect", () => setSelectedId(null));

      // Put back the sketches saved from last time.
      // (Rounded to the 9 decimal places the store takes back: it draws with more.)
      const saved = loadSketches().map((f) => ({ ...f, geometry: roundGeometry(f.geometry) }));
      if (saved.length) {
        const results = draw.addFeatures(saved.map(storeFeature));
        setFeatures(saved.filter((_, i) => results[i]?.valid !== false));
      }
      canSaveRef.current = true;

      // ── Overlay sources for labels/custom styles ──
      ensureOverlaySources(map);
      ensureCoordLayers(map);
      ensureHatchLayer(map);

      // ── Measure sources ──
      ensureMeasureLayers(map);

      // Listen for finished features
      draw.on("finish", (id, context) => {
        // Only a sketch just drawn is new. Picking one in the select mode, or dragging a corner of it, also
        // finishes (with its own selection handles), and those are not sketches.
        if (!id || context?.mode === "select") return;
        const allFeatures = draw.getSnapshot();
        const raw = allFeatures.find((f: GeoJSONStoreFeatures) => f.id === id);
        if (!raw) return;

        const tool = activeToolRef.current;
        const kind = featureKindFromTool(tool);

        // TerraDraw doesn't snap markers or circles: move a new one onto
        // what it was dropped next to (anything shown, including sketches).
        if (snapEnabledRef.current && (raw.geometry.type === "Point" || tool === "circle")) {
          try {
            const snapped = snapPlaced(map, raw.geometry, String(id));
            if (snapped) {
              draw.updateFeatureGeometry(id, snapped);
              raw.geometry = snapped;
            }
          } catch {
            // Leave it where it was dropped: the sketch must be recorded either way.
          }
        }

        // Read via refs — the setup effect closes over the initial state.
        const activeLayer =
          layersRef.current.find((l) => l.id === activeLayerIdRef.current) ??
          DEFAULT_LAYER;
        const currentLayerId = activeLayerIdRef.current;

        const newFeature: DrawFeature = {
          id: String(id),
          layerId: currentLayerId,
          kind,
          name: nextName(drawToolInfo(tool)?.label ?? (kind === "note" ? "Note" : "Marker"), featuresRef.current),
          visible: true,
          color: activeLayer.color,
          // A marker's weight is its size: the layer's line weight (2) would make it a speck.
          weight: raw.geometry.type === "Point" ? MARKER_SIZE : activeLayer.weight,
          lineStyle: activeLayer.lineStyle,
          fillOpacity: activeLayer.fillOpacity,
          hatch: activeLayer.hatch,
          label: "",
          labelSize: 13,
          labelColor: INK,
          showMeasurements: tool === "measure-distance" || tool === "measure-area",
          geometry: raw.geometry,
          properties: raw.properties ?? {},
        };

        setFeatures((prev) => [...prev, newFeature]);

        // Only the Distance/Area tools get tick/area-label overlays — plain
        // line/polygon draws share the same TerraDraw "mode" and must not.
        if (tool === "measure-distance" || tool === "measure-area") {
          measurementIdsRef.current.add(String(id));
          updateMeasureOverlay(map, draw, measureSettingsRef.current, measurementIdsRef.current);
        }
      });

      // Listen for changes (drag, move, etc.)
      draw.on("change", (ids, type) => {
        if (type === "delete") {
          setFeatures((prev) => prev.filter((f) => !ids.includes(f.id)));
          ids.forEach((id) => measurementIdsRef.current.delete(String(id)));
        } else {
          const all = draw.getSnapshot();
          setFeatures((prev) =>
            prev.map((pf) => {
              const updated = all.find((f: GeoJSONStoreFeatures) => String(f.id) === pf.id);
              return updated ? { ...pf, geometry: updated.geometry } : pf;
            })
          );
        }
        updateOverlay(map, featuresRef.current);
        updateMeasureOverlay(map, draw, measureSettingsRef.current, measurementIdsRef.current);
      });

      // Re-initialise adapter after style reload (named handler so cleanup
      // can remove it — otherwise handlers accumulate per setup).
      const onStyleData = () => {
        adapter.reinitialise();
        ensureOverlaySources(map);
        ensureCoordLayers(map);
        // The measurement layers go with the style too: put them back and redraw them.
        ensureMeasureLayers(map);
        updateMeasureOverlay(map, draw, measureSettingsRef.current, measurementIdsRef.current);
        updateCoordOverlay(map, featuresRef.current, measureSettingsRef.current);
        // A new base map drops the pattern pictures: put the layer and the pictures back.
        hatchPatternsRegistered.current.clear();
        updateHatchOverlay(map, featuresRef.current, hatchPatternsRegistered.current);
        applySketchVisibility(map, sketchVisibleRef.current);
      };
      map.on("styledata", onStyleData);
      styleDataHandlerRef.current = onStyleData;
    };

    if (map.isStyleLoaded()) {
      setup();
    } else {
      map.once("load", setup);
    }

    return () => {
      drawRef.current?.stop();
      drawRef.current = null;
      adapterRef.current = null;
      if (styleDataHandlerRef.current) {
        map.off("styledata", styleDataHandlerRef.current);
        styleDataHandlerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRef]);

  // ─── Update overlay whenever features change ──────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    // No isStyleLoaded() guard: it stays false while base-map tiles load,
    // and the overlays would silently not update (each update checks its
    // own source exists).
    if (!map) return;
    // Measured = Distance/Area tool features + sketches with measurements on.
    measurementIdsRef.current = new Set(features.filter((f) => f.showMeasurements).map((f) => f.id));
    const draw = drawRef.current;
    if (draw) updateMeasureOverlay(map, draw, measureSettingsRef.current, measurementIdsRef.current);
    updateCoordOverlay(map, features, measureSettingsRef.current);
    updateOverlay(map, features);
    updateHatchOverlay(map, features, hatchPatternsRegistered.current);
  }, [features, mapRef]);

  // Keep the sketches in this browser (a drag fires many changes, so wait for it to settle).
  useEffect(() => {
    if (!canSaveRef.current) return;
    const t = window.setTimeout(() => saveSketches(features), 300);
    return () => window.clearTimeout(t);
  }, [features]);

  useEffect(() => {
    const index: SnapIndex = { points: [], segments: [] };
    if (sketchVisible) {
      const world = { west: -180, south: -90, east: 180, north: 90 };
      for (const f of features) if (f.visible !== false) addGeometry(index, f.geometry, world, 50_000);
    }
    sketchIndexRef.current = index;
  }, [features, sketchVisible]);

  // ─── Push per-feature color/weight/fill-opacity/line-style to the adapter ──

  useEffect(() => {
    const overrides = new Map<string, StyleOverride>(
      features.map((f) => [
        f.id,
        { color: f.color, weight: f.weight, fillOpacity: f.fillOpacity, lineStyle: f.lineStyle },
      ]),
    );
    adapterRef.current?.setStyleOverrides(overrides);
  }, [features]);

  // ─── Snapping on/off (persisted) ──────────────────────────────────────────

  useEffect(() => {
    try {
      localStorage.setItem(SNAP_STORAGE_KEY, snapEnabled ? "1" : "0");
    } catch {
      // not persisted — fine
    }
    const draw = drawRef.current;
    if (!draw) return;
    const snapping = snappingFor(snapEnabled);
    draw.updateModeOptions<typeof TerraDrawLineStringMode>("linestring", { snapping });
    draw.updateModeOptions<typeof TerraDrawPolygonMode>("polygon", { snapping });
  }, [snapEnabled, snappingFor]);

  const setSnapTargets = useCallback((index: SnapIndex) => {
    snapIndexRef.current = index;
  }, []);

  /** Where a just-placed marker (or circle, by its centre) should snap to,
   *  as its new geometry — or null to leave it. */
  const snapPlaced = useCallback(
    (map: MapLibreMap, geometry: GeoJSONStoreFeatures["geometry"], ownId: string) => {
      const b = map.getBounds();
      const bounds = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
      const index: SnapIndex = {
        points: [...snapIndexRef.current.points],
        segments: [...snapIndexRef.current.segments],
      };
      for (const f of featuresRef.current) {
        if (f.id !== ownId && f.visible !== false) addGeometry(index, f.geometry, bounds, 50_000);
      }
      const project = (lng: number, lat: number) => map.project([lng, lat]);
      const at = (c: [number, number]) => {
        const s = project(c[0], c[1]);
        return nearestSnap(index, { lng: c[0], lat: c[1], x: s.x, y: s.y }, project, SNAP_PX);
      };
      if (geometry.type === "Point") {
        const hit = at(geometry.coordinates as [number, number]);
        return hit ? { type: "Point" as const, coordinates: roundCoordinate(hit) } : null;
      }
      if (geometry.type === "Polygon") {
        const ring = geometry.coordinates[0] as [number, number][];
        const n = ring.length > 1 ? ring.length - 1 : ring.length;
        const centre: [number, number] = [
          ring.slice(0, n).reduce((a, c) => a + c[0], 0) / n,
          ring.slice(0, n).reduce((a, c) => a + c[1], 0) / n,
        ];
        const hit = at(centre);
        if (!hit) return null;
        const dx = hit[0] - centre[0];
        const dy = hit[1] - centre[1];
        return { type: "Polygon" as const, coordinates: [ring.map((c) => roundCoordinate([c[0] + dx, c[1] + dy]))] };
      }
      return null;
    },
    [],
  );

  // ─── Re-render measure overlay when settings change ───────────────────────

  useEffect(() => {
    saveMeasureSettings(measureSettings);
    const map = mapRef.current;
    const draw = drawRef.current;
    if (!map || !draw) return;
    updateMeasureOverlay(map, draw, measureSettings, measurementIdsRef.current);
    updateCoordOverlay(map, featuresRef.current, measureSettings);
  }, [measureSettings, mapRef]);

  // ─── Draw mode management ─────────────────────────────────────────────────

  const enterMode = useCallback((tool: DrawTool) => {
    const draw = drawRef.current;
    if (!draw) return;

    // First stop any active mode
    draw.setMode("select");
    setActiveTool(tool);

    if (!tool || tool === "select") return;

    switch (tool) {
      case "point":
      case "note":
        draw.setMode("point");
        break;
      case "line":
      case "measure-distance":
        draw.setMode("linestring");
        break;
      case "polygon":
      case "circle":
      case "measure-area":
        if (tool === "circle") {
          draw.setMode("circle");
        } else {
          draw.setMode("polygon");
        }
        break;
    }
  }, []);

  const exitMode = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) return;
    draw.setMode("select");
    setActiveTool(null);
  }, []);

  // ─── Feature management ─────────────────────────────────────────────────

  const updateFeature = useCallback((id: string, changes: Partial<DrawFeature>) => {
    setFeatures((prev) => prev.map((f) => (f.id === id ? { ...f, ...changes } : f)));
  }, []);

  /** The same change to several sketches at once (a colour, a weight…). */
  const updateFeatures = useCallback((ids: string[], changes: Partial<DrawFeature>) => {
    const set = new Set(ids);
    setFeatures((prev) => prev.map((f) => (set.has(f.id) ? { ...f, ...changes } : f)));
  }, []);

  const deleteFeatures = useCallback((ids: string[]) => {
    const draw = drawRef.current;
    for (const id of ids) {
      if (draw) {
        try { draw.removeFeatures([id]); } catch { /* ignore */ }
      }
      measurementIdsRef.current.delete(id);
    }
    const set = new Set(ids);
    setFeatures((prev) => prev.filter((f) => !set.has(f.id)));
    setSelectedId((cur) => (cur && set.has(cur) ? null : cur));
  }, []);

  const deleteFeature = useCallback((id: string) => deleteFeatures([id]), [deleteFeatures]);

  /** Pick a sketch on the map from the list (or let go of the current one with null). Does nothing mid-draw. */
  const selectOnMap = useCallback((id: string | null) => {
    const draw = drawRef.current;
    if (!draw || activeToolRef.current) return;
    try {
      if (id) draw.selectFeature(id);
      else if (selectedIdRef.current) draw.deselectFeature(selectedIdRef.current);
    } catch {
      // Not on the map any more.
    }
  }, []);

  const deleteSelected = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) return;
    // TerraDraw doesn't expose getSelected directly in all versions, iterate
    const all = draw.getSnapshot();
    const selectedIds = all
      .filter((f: GeoJSONStoreFeatures) => f.properties.selected === true)
      .map((f: GeoJSONStoreFeatures) => String(f.id));
    selectedIds.forEach((id: string) => {
      try { draw.removeFeatures([id]); } catch { /* ignore */ }
      measurementIdsRef.current.delete(id);
    });
    setFeatures((prev) => prev.filter((f) => !selectedIds.includes(f.id)));
  }, []);

  const clearAll = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) return;
    draw.clear();
    measurementIdsRef.current.clear();
    setFeatures([]);
    const map = mapRef.current;
    if (map) {
      updateMeasureOverlay(map, draw, measureSettings, measurementIdsRef.current);
      updateCoordOverlay(map, [], measureSettings);
      updateOverlay(map, []);
    }
  }, [mapRef, measureSettings]);

  const zoomToFeature = useCallback((feature: DrawFeature) => {
    const map = mapRef.current;
    if (!map) return;
    if (feature.geometry.type === "Point") {
      const [lng, lat] = feature.geometry.coordinates;
      map.flyTo({ center: [lng, lat], zoom: 16, duration: 500 });
    } else {
      const bounds = getBoundsFromGeometry(feature.geometry);
      if (bounds) map.fitBounds(bounds, { padding: 80, maxZoom: 18, duration: 500 });
    }
  }, [mapRef]);

  const toggleSketchVisible = useCallback(() => {
    setSketchVisible((prev) => {
      const next = !prev;
      const map = mapRef.current;
      if (map) applySketchVisibility(map, next);
      return next;
    });
  }, [mapRef]);

  // ─── Layer management ────────────────────────────────────────────────────

  const addLayer = useCallback(() => {
    const id = newLayerId();
    const newLayer: DrawLayer = {
      id,
      name: `Layer ${layers.length + 1}`,
      visible: true,
      collapsed: false,
      color: DRAW_DEFAULT,
      hatch: "none",
      fillOpacity: 0.3,
      lineStyle: "solid",
      weight: 2,
    };
    setLayers((prev) => [...prev, newLayer]);
    setActiveLayerId(id);
  }, [layers.length]);

  const updateLayer = useCallback((id: string, changes: Partial<DrawLayer>) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...changes } : l)));
  }, []);

  const deleteLayer = useCallback((id: string) => {
    const idsInLayer = features.filter((f) => f.layerId === id).map((f) => f.id);
    const draw = drawRef.current;
    if (draw) {
      idsInLayer.forEach((fid) => {
        try { draw.removeFeatures([fid]); } catch { /* ignore */ }
        measurementIdsRef.current.delete(fid);
      });
    }
    setFeatures((prev) => prev.filter((f) => f.layerId !== id));
    setLayers((prev) => {
      const next = prev.filter((l) => l.id !== id);
      if (next.length === 0) {
        const fallback: DrawLayer = { ...DEFAULT_LAYER, id: newLayerId() };
        setActiveLayerId(fallback.id);
        return [fallback];
      }
      if (activeLayerId === id) setActiveLayerId(next[0].id);
      return next;
    });
  }, [features, activeLayerId]);

  // ─── Export ──────────────────────────────────────────────────────────────

  const exportGeoJSON = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) return;
    const data = sketchesToGeoJSON(features);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "drawings.geojson";
    a.click();
    URL.revokeObjectURL(url);
  }, [features]);

  const exportCSV = useCallback(() => {
    const blob = new Blob([sketchesToCSV(features)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "drawings.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [features]);


  // ─── Import GeoJSON ──────────────────────────────────────────────────────

  const updateMeasureSettings = useCallback((partial: Partial<MeasureSettings>) => {
    setMeasureSettings((prev) => {
      const next = { ...prev, ...partial };
      // Clamp to a safe minimum so tick generation can never loop forever.
      if (!(next.tickInterval > 0)) next.tickInterval = prev.tickInterval;
      return next;
    });
  }, []);

  const importGeoJSON = useCallback(
    (geojson: FeatureCollection) => {
      const draw = drawRef.current;
      if (!draw) return;

      const supported = geojson.features.filter(
        (f) =>
          f.geometry &&
          ["Point", "LineString", "Polygon"].includes(f.geometry.type)
      ).map((f) => ({ ...f, geometry: roundGeometry(f.geometry) }));

      const importedFeatures: DrawFeature[] = [];
      supported.forEach((f) => {
        try {
          const featId = crypto.randomUUID();
          const [added] = draw.addFeatures([
            {
              type: "Feature",
              id: featId,
              geometry: f.geometry,
              properties: { mode: f.geometry.type === "Point" ? "point" : f.geometry.type === "LineString" ? "linestring" : "polygon" },
            } as GeoJSONStoreFeatures,
          ]);
          // The store refused it (an invalid shape): skip it rather than list a sketch that isn't on the map.
          if (added && added.valid === false) return;
          const id = featId;
          const kind =
            f.geometry.type === "Point"
              ? "marker"
              : f.geometry.type === "LineString"
              ? "polyline"
              : "polygon";
          const style = importedStyle(f.properties, DRAW_DEFAULT);
          importedFeatures.push({
            id: String(id),
            layerId: activeLayerIdRef.current,
            kind,
            ...style,
            name: style.name ?? `${kind} ${featureCounter++}`,
            visible: true,
            hatch: "none",
            labelSize: 13,
            labelColor: INK,
            geometry: f.geometry,
            properties: f.properties,
          });
        } catch {
          /* skip incompatible features */
        }
      });

      setFeatures((prev) => [...prev, ...importedFeatures]);
      onToast?.(`Imported ${importedFeatures.length} features`);
    },
    [onToast]
  );

  return {
    // State
    activeTool,
    features,
    layers,
    activeLayerId,
    measureSettings,
    snapEnabled,
    sketchVisible,
    toggleSketchVisible,
    // Mode control
    enterMode,
    exitMode,
    // Feature actions
    updateFeature,
    updateFeatures,
    deleteFeature,
    deleteFeatures,
    deleteSelected,
    selectedId,
    selectOnMap,
    clearAll,
    zoomToFeature,
    importGeoJSON,
    // Layer actions
    addLayer,
    updateLayer,
    deleteLayer,
    setActiveLayerId,
    // Settings
    setMeasureSettings,
    updateMeasureSettings,
    setSnapEnabled,
    setSnapTargets,
    // Export
    exportGeoJSON,
    exportCSV,
    // Raw refs (for context menu, etc.)
    drawRef,
  };
}
