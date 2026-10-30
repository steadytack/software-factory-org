/** Sketches are kept in this browser, so a reload (or closing the tab) doesn't lose them. Reading is defensive: a saved value
 *  that isn't what we wrote (an older version, hand-edited, another app on the same origin) is dropped, never trusted. */
import type { GeoJSONStoreFeatures } from "terra-draw";

import type { DrawFeature } from "./types";

export const SKETCHES_KEY = "webapp.map.sketches";
const VERSION = 1;
const KINDS: DrawFeature["kind"][] = ["marker", "note", "polyline", "polygon", "circle", "measurement"];
const LINE_STYLES = ["solid", "dashed", "dotted", "longdash", "shortdash"];

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isPosition = (v: unknown): v is [number, number] => Array.isArray(v) && v.length >= 2 && isNumber(v[0]) && isNumber(v[1]);

function validGeometry(g: unknown): g is DrawFeature["geometry"] {
  const geo = g as { type?: string; coordinates?: unknown } | null;
  if (!geo || typeof geo !== "object") return false;
  if (geo.type === "Point") return isPosition(geo.coordinates);
  if (geo.type === "LineString") return Array.isArray(geo.coordinates) && geo.coordinates.length >= 2 && geo.coordinates.every(isPosition);
  if (geo.type === "Polygon") {
    const ring = Array.isArray(geo.coordinates) ? geo.coordinates[0] : null;
    return Array.isArray(ring) && ring.length >= 4 && ring.every(isPosition);
  }
  return false;
}

function asFeature(v: unknown): DrawFeature | null {
  const f = v as Partial<DrawFeature> | null;
  if (!f || typeof f !== "object") return null;
  if (typeof f.id !== "string" || !f.id || typeof f.name !== "string" || !KINDS.includes(f.kind as DrawFeature["kind"])) return null;
  if (!validGeometry(f.geometry)) return null;
  return {
    id: f.id,
    layerId: typeof f.layerId === "string" ? f.layerId : "layer-0",
    kind: f.kind as DrawFeature["kind"],
    name: f.name,
    visible: f.visible !== false,
    color: typeof f.color === "string" ? f.color : "#1556c0",
    weight: isNumber(f.weight) ? f.weight : 2,
    lineStyle: LINE_STYLES.includes(f.lineStyle as string) ? (f.lineStyle as DrawFeature["lineStyle"]) : "solid",
    fillOpacity: isNumber(f.fillOpacity) ? f.fillOpacity : 0.3,
    hatch: typeof f.hatch === "string" ? (f.hatch as DrawFeature["hatch"]) : "none",
    label: typeof f.label === "string" ? f.label : "",
    labelSize: isNumber(f.labelSize) ? f.labelSize : 13,
    labelColor: typeof f.labelColor === "string" ? f.labelColor : "#172b4d",
    showMeasurements: f.showMeasurements === true,
    showCoordinates: f.showCoordinates === true,
    geometry: f.geometry,
    properties: f.properties && typeof f.properties === "object" ? f.properties : {},
  };
}

export function loadSketches(storage: Pick<Storage, "getItem"> = localStorage): DrawFeature[] {
  try {
    const saved = JSON.parse(storage.getItem(SKETCHES_KEY) ?? "null") as { v?: number; features?: unknown[] } | null;
    if (!saved || saved.v !== VERSION || !Array.isArray(saved.features)) return [];
    return saved.features.map(asFeature).filter((f): f is DrawFeature => f !== null);
  } catch {
    return [];
  }
}

export function saveSketches(features: DrawFeature[], storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(SKETCHES_KEY, JSON.stringify({ v: VERSION, features }));
  } catch {
    // Not saved (private mode or full storage): the sketches are still on the map.
  }
}

/** What the drawing store needs to hold a sketch again: its `mode` (which tool shape it is) and, for a circle, its radius. */
export function storeFeature(f: DrawFeature): GeoJSONStoreFeatures {
  const radiusKilometers = (f.properties as { radiusKilometers?: number } | null)?.radiusKilometers;
  const circle = f.kind === "circle" && isNumber(radiusKilometers);
  const mode = circle ? "circle" : f.geometry.type === "Point" ? "point" : f.geometry.type === "LineString" ? "linestring" : "polygon";
  return {
    type: "Feature",
    id: f.id,
    geometry: f.geometry,
    properties: { mode, ...(circle ? { radiusKilometers } : {}) },
  } as GeoJSONStoreFeatures;
}
