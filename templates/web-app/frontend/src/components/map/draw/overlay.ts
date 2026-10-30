/**
 * Drawing overlay helpers for the TerraDraw/MapLibre integration:
 * overlay source setup, label overlay updates, measurement overlay updates,
 * hatch pattern registration and geometry utilities. Extracted from
 * useMapDraw so the hook holds only React state wiring (hardening STR-1).
 * Behaviour is unchanged — this is a pure code move.
 */

import { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import type { TerraDraw } from "terra-draw";
import {
  measureLine,
  measurePolygon,
  type MeasureSettings,
} from "../utils/measurement";
import { createHatchPatternImageData, type HatchStyle } from "../utils/hatchPatterns";
import { formatCoordinate } from "../utils/coordinates";
import type { FeatureCollection, Feature, Geometry } from "geojson";
import type { DrawFeature } from "./types";
import { TD_LAYERS } from "../hooks/maplibreAdapter";
import { HALO_LIGHT, INK, INK_MUTED, WHITE } from "../layers/colors";

export const OVERLAY_SOURCE = "drawings-overlay";

// All map layer ids that make up the "Sketches" layer in the Layers tab:
// drawn features (TerraDraw), their labels, and measurement overlays.
// Bottom-to-top.
export const HATCH_SOURCE = "draw-hatch-source";
export const HATCH_LAYER = "draw-hatch";

export const SKETCH_LAYER_IDS = [
  TD_LAYERS.LAYER_POLYGON_FILL,
  HATCH_LAYER,
  ...TD_LAYERS.POLYGON_OUTLINE_IDS,
  ...TD_LAYERS.LINE_IDS,
  TD_LAYERS.LAYER_POINT,
  "draw-overlay-labels-polygons",
  "draw-overlay-line-labels",
  "draw-overlay-labels",
  "measure-tick",
  "measure-label",
  "coord-point",
  "coord-label",
];
export const MEASURE_SOURCE = "measure-source";
export const COORD_SOURCE = "coord-source";
/** The dots get their own source: if the label font can't load (offline),
 *  MapLibre drops the labels' source, and the dots should survive that. */
export const COORD_POINT_SOURCE = "coord-point-source";

export function emptyFC(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

// ─── Overlay labels ──────────────────────────────────────────────────────────

export function ensureOverlaySources(map: MapLibreMap) {
  if (!map.getSource(OVERLAY_SOURCE)) {
    map.addSource(OVERLAY_SOURCE, { type: "geojson", data: emptyFC() });

    // Point labels
    map.addLayer({
      id: "draw-overlay-labels",
      type: "symbol",
      source: OVERLAY_SOURCE,
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        "text-field": ["get", "label"],
        "text-size": ["coalesce", ["get", "labelSize"], 13],
        "text-anchor": "top",
        "text-offset": [0, 0.8],
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": ["coalesce", ["get", "labelColor"], INK],
        "text-halo-color": HALO_LIGHT,
        "text-halo-width": 2,
      },
    });

    // Line labels (midpoint)
    map.addLayer({
      id: "draw-overlay-line-labels",
      type: "symbol",
      source: OVERLAY_SOURCE,
      filter: ["==", ["geometry-type"], "LineString"],
      layout: {
        "symbol-placement": "line-center",
        "text-field": ["get", "label"],
        "text-size": ["coalesce", ["get", "labelSize"], 13],
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": ["coalesce", ["get", "labelColor"], INK],
        "text-halo-color": HALO_LIGHT,
        "text-halo-width": 2,
      },
    });

    // Polygon labels (centroid stored as Point)
    map.addLayer({
      id: "draw-overlay-labels-polygons",
      type: "symbol",
      source: OVERLAY_SOURCE,
      filter: ["all", ["==", ["geometry-type"], "Point"], ["has", "isPolygonLabel"]],
      layout: {
        "text-field": ["get", "label"],
        "text-size": ["coalesce", ["get", "labelSize"], 13],
        "text-anchor": "center",
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": ["coalesce", ["get", "labelColor"], INK],
        "text-halo-color": HALO_LIGHT,
        "text-halo-width": 2,
      },
    });
  }
}

export function updateOverlay(map: MapLibreMap, features: DrawFeature[]) {
  const src = map.getSource(OVERLAY_SOURCE) as GeoJSONSource | undefined;
  if (!src) return;

  const labelFeatures: Feature[] = features
    .filter((f) => f.visible && f.label)
    .map((f) => {
      if (f.geometry.type === "Point") {
        return {
          type: "Feature" as const,
          geometry: f.geometry,
          properties: { label: f.label, labelSize: f.labelSize, labelColor: f.labelColor },
        };
      }
      if (f.geometry.type === "LineString") {
        return {
          type: "Feature" as const,
          geometry: f.geometry,
          properties: { label: f.label, labelSize: f.labelSize, labelColor: f.labelColor },
        };
      }
      if (f.geometry.type === "Polygon") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const centroid = polygonCentroid((f.geometry as any).coordinates[0]);
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: centroid },
          properties: {
            label: f.label,
            labelSize: f.labelSize,
            labelColor: f.labelColor,
            isPolygonLabel: true,
          },
        };
      }
      return null;
    })
    .filter(Boolean) as Feature[];

  src.setData({ type: "FeatureCollection", features: labelFeatures });
}

/** The measurement layers (tick marks and length/area labels). Safe to call again: a new base map replaces the style and
 *  these have to come back with it. */
export function ensureMeasureLayers(map: MapLibreMap) {
  if (!map.getSource(MEASURE_SOURCE)) map.addSource(MEASURE_SOURCE, { type: "geojson", data: emptyFC() });
  if (!map.getLayer("measure-tick")) {
    map.addLayer({
      id: "measure-tick",
      type: "line",
      source: MEASURE_SOURCE,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": INK_MUTED, "line-width": 1.5 },
    });
  }
  if (!map.getLayer("measure-label")) {
    map.addLayer({
      id: "measure-label",
      type: "symbol",
      source: MEASURE_SOURCE,
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        "text-field": ["get", "label"],
        "text-size": ["match", ["get", "kind"], "segment", 10, 12],
        "text-anchor": "center",
        "text-line-height": 1.2,
        "text-padding": 3,
        // Labels keep clear of each other: the total or area wins, and the segment lengths that don't fit
        // appear as you zoom in (they used to be drawn on top of each other).
        "symbol-sort-key": ["match", ["get", "kind"], "segment", 1, 0],
        "text-allow-overlap": false,
        "text-ignore-placement": false,
      },
      paint: {
        "text-color": INK,
        "text-halo-color": WHITE,
        "text-halo-width": 2,
      },
    });
  }
}

/** Draws length/area labels (and optional ticks) for measured features —
 *  those made with the Distance/Area tools plus any sketch the user switched
 *  measurements on for. `measuredIds` holds their TerraDraw ids: plain
 *  line/polygon draws share the same TerraDraw mode, so a mode filter can't
 *  tell them apart. */
export function updateMeasureOverlay(
  map: MapLibreMap,
  draw: TerraDraw,
  settings: MeasureSettings,
  measuredIds: Set<string>,
) {
  const src = map.getSource(MEASURE_SOURCE) as GeoJSONSource | undefined;
  if (!src) return;

  const overlayFeatures: Feature[] = [];
  for (const f of draw.getSnapshot()) {
    if (!measuredIds.has(String(f.id))) continue;
    if (f.geometry.type === "LineString") {
      overlayFeatures.push(...measureLine(f.geometry.coordinates as [number, number][], settings));
    } else if (f.geometry.type === "Polygon") {
      overlayFeatures.push(...measurePolygon(f.geometry.coordinates as [number, number][][], settings));
    }
  }
  src.setData({ type: "FeatureCollection", features: overlayFeatures });
}

// ─── Coordinate labels ───────────────────────────────────────────────────────

/** The positions a sketch's coordinates are shown at: a marker's position,
 *  each point of a line, each corner of a shape (plus its centre if
 *  wanted), and a circle's centre. */
export function coordinatePositions(f: Pick<DrawFeature, "kind" | "geometry">, withCentre: boolean): [number, number][] {
  const g = f.geometry;
  if (g.type === "Point") return [g.coordinates as [number, number]];
  if (g.type === "LineString") return g.coordinates as [number, number][];
  if (g.type === "Polygon") {
    const ring = g.coordinates[0] as [number, number][];
    const corners = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
    const centre: [number, number] = [
      corners.reduce((a, c) => a + c[0], 0) / corners.length,
      corners.reduce((a, c) => a + c[1], 0) / corners.length,
    ];
    if (f.kind === "circle") return [centre];
    return withCentre ? [...corners, centre] : corners;
  }
  return [];
}

export function coordinateLabels(features: DrawFeature[], settings: MeasureSettings): Feature[] {
  const out: Feature[] = [];
  for (const f of features) {
    if (!f.showCoordinates || f.visible === false) continue;
    coordinatePositions(f, settings.coordCentre).forEach(([lng, lat], order) => {
      out.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        // `order` is who wins when two labels want the same space: a sketch's corners, in order, then its centre.
        properties: { label: formatCoordinate(lng, lat, settings.coordFormat), order },
      });
    });
  }
  return out;
}

export function ensureCoordLayers(map: MapLibreMap) {
  if (!map.getSource(COORD_SOURCE)) map.addSource(COORD_SOURCE, { type: "geojson", data: emptyFC() });
  if (!map.getSource(COORD_POINT_SOURCE)) map.addSource(COORD_POINT_SOURCE, { type: "geojson", data: emptyFC() });
  if (!map.getLayer("coord-point")) {
    map.addLayer({
      id: "coord-point",
      type: "circle",
      source: COORD_POINT_SOURCE,
      paint: { "circle-radius": 2.5, "circle-color": INK, "circle-stroke-color": WHITE, "circle-stroke-width": 1 },
    });
  }
  if (!map.getLayer("coord-label")) {
    map.addLayer({
      id: "coord-label",
      type: "symbol",
      source: COORD_SOURCE,
      layout: {
        "text-field": ["get", "label"],
        "text-size": 11,
        // Each label tries the side of its point that is free: right, left, then below and above. One that fits
        // nowhere is left out until you zoom in (its dot is always there), rather than printed over another.
        "text-variable-anchor": ["left", "right", "top", "bottom"],
        "text-radial-offset": 0.7,
        "text-justify": "auto",
        "text-padding": 2,
        "symbol-sort-key": ["get", "order"],
        "text-allow-overlap": false,
        "text-ignore-placement": false,
      },
      paint: { "text-color": INK, "text-halo-color": WHITE, "text-halo-width": 2 },
    });
  }
}

export function updateCoordOverlay(map: MapLibreMap, features: DrawFeature[], settings: MeasureSettings) {
  const data: FeatureCollection = { type: "FeatureCollection", features: coordinateLabels(features, settings) };
  (map.getSource(COORD_SOURCE) as GeoJSONSource | undefined)?.setData(data);
  (map.getSource(COORD_POINT_SOURCE) as GeoJSONSource | undefined)?.setData(data);
}

// ─── Hatch helpers ───────────────────────────────────────────────────────────

/** The pattern layer: shapes filled with a hatch or dots (a sketch's "Pattern"), over the plain fill and under the outlines. */
export function ensureHatchLayer(map: MapLibreMap) {
  if (!map.getSource(HATCH_SOURCE)) map.addSource(HATCH_SOURCE, { type: "geojson", data: emptyFC() });
  if (map.getLayer(HATCH_LAYER)) return;
  const firstOutline = TD_LAYERS.POLYGON_OUTLINE_IDS.find((id) => map.getLayer(id));
  map.addLayer(
    { id: HATCH_LAYER, type: "fill", source: HATCH_SOURCE, paint: { "fill-pattern": ["get", "pattern"], "fill-opacity": 0.9 } },
    firstOutline,
  );
}

/** Put each patterned sketch's pattern on the map (registering the picture for its style and colour if it isn't there yet). */
export function updateHatchOverlay(map: MapLibreMap, features: DrawFeature[], registered: Set<string>) {
  const patterned = features.filter(
    (f) => f.visible !== false && f.hatch && f.hatch !== "none" && f.geometry.type === "Polygon",
  );
  // Nothing to draw and no layer yet: leave the map alone (it may still be loading its style).
  if (!patterned.length && !map.getSource(HATCH_SOURCE)) return;
  try {
    ensureHatchLayer(map);
    const out: Feature[] = patterned.map((f) => {
      registerHatchPattern(map, f.hatch, f.color, registered);
      return { type: "Feature", geometry: f.geometry, properties: { pattern: `hatch-${f.hatch}-${f.color}` } };
    });
    (map.getSource(HATCH_SOURCE) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: out });
  } catch {
    // The style isn't ready yet: the next change (or the style finishing) draws it.
  }
}

export function registerHatchPattern(
  map: MapLibreMap,
  style: HatchStyle,
  color: string,
  registered: Set<string>,
) {
  const key = `hatch-${style}-${color}`;
  if (registered.has(key) || map.hasImage(key)) {
    registered.add(key);
    return;
  }
  const img = createHatchPatternImageData(style, color, 1);
  map.addImage(key, img, { pixelRatio: 2 });
  registered.add(key);
}

// ─── Geometry utilities ──────────────────────────────────────────────────────

export function polygonCentroid(ring: number[][]): number[] {
  let x = 0,
    y = 0;
  for (const [px, py] of ring) {
    x += px;
    y += py;
  }
  return [x / ring.length, y / ring.length];
}

export function getBoundsFromGeometry(
  geometry: Geometry,
): [[number, number], [number, number]] | null {
  const coords: number[][] = [];
  function collect(g: Geometry | null | undefined) {
    if (!g) return;
    if (g.type === "Point") coords.push(g.coordinates as number[]);
    else if (g.type === "LineString") coords.push(...(g.coordinates as number[][]));
    else if (g.type === "Polygon") coords.push(...(g.coordinates[0] as number[][]));
    else if (g.type === "MultiPolygon")
      (g.coordinates as number[][][][]).forEach((p) => coords.push(...p[0]));
  }
  collect(geometry);
  if (coords.length === 0) return null;
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}