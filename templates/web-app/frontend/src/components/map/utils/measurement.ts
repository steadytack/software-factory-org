/**
 * Measurement helpers — labels (segment lengths, totals, area, perimeter)
 * and optional tick marks for measured lines and polygons. Unit choices and
 * what's shown are user settings (Sketches tab → Measurements).
 */

import { distanceMeters, polygonAreaMeters2 } from "./coordinates";
import type { Feature, Point, LineString } from "geojson";

export type DistanceUnits = "auto" | "m" | "km" | "imperial";
export type AreaUnits = "auto" | "m2" | "ha" | "acres";

/** How coordinates are written on the map: BNG easting/northing
 *  ("625597, 245940"), an OS grid reference, or latitude/longitude. */
export type CoordFormat = "bng" | "gridref" | "latlng";

export interface MeasureSettings {
  /** Coordinate labels (sketches with Show coordinates on). */
  coordFormat: CoordFormat;
  /** Shapes: also label the centre. */
  coordCentre: boolean;
  /** Length units: auto = m below 1 km, then km. */
  units: DistanceUnits;
  /** Area units: auto = m² below 1 ha, then ha (km² above 100 ha). */
  areaUnits: AreaUnits;
  /** A length label on every segment of a multi-segment line/outline. */
  showSegments: boolean;
  /** Total length (lines) / area (polygons). */
  showTotal: boolean;
  /** Perimeter under a polygon's area. */
  showPerimeter: boolean;
  /** Tick marks along measured lines. */
  showTicks: boolean;
  /** Metres between ticks. */
  tickInterval: number;
  /** Tick length in metres. */
  tickLength: number;
}

export const DEFAULT_MEASURE_SETTINGS: MeasureSettings = {
  coordFormat: "bng",
  coordCentre: true,
  units: "auto",
  areaUnits: "auto",
  showSegments: true,
  showTotal: true,
  showPerimeter: true,
  showTicks: false,
  tickInterval: 100,
  tickLength: 6,
};

const STORAGE_KEY = "webapp.map.measure";

export function loadMeasureSettings(): MeasureSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return raw && typeof raw === "object" ? { ...DEFAULT_MEASURE_SETTINGS, ...raw } : DEFAULT_MEASURE_SETTINGS;
  } catch {
    return DEFAULT_MEASURE_SETTINGS;
  }
}

export function saveMeasureSettings(s: MeasureSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // storage unavailable — settings just won't persist
  }
}

// ─── Formatting ──────────────────────────────────────────────────────────────

const nf = (digits: number) =>
  new Intl.NumberFormat("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function formatLength(meters: number, units: DistanceUnits): string {
  const m = Math.max(0, Number(meters) || 0);
  switch (units) {
    case "m":
      return `${nf(m < 10 ? 1 : 0).format(m)} m`;
    case "km":
      return `${nf(m < 1000 ? 3 : 2).format(m / 1000)} km`;
    case "imperial": {
      const ft = m * 3.28084;
      return ft < 5280 ? `${nf(0).format(ft)} ft` : `${nf(2).format(ft / 5280)} mi`;
    }
    default:
      return m < 1000 ? `${nf(m < 10 ? 1 : 0).format(m)} m` : `${nf(2).format(m / 1000)} km`;
  }
}

export function formatAreaIn(m2: number, units: AreaUnits): string {
  const a = Math.max(0, Number(m2) || 0);
  switch (units) {
    case "m2":
      return `${nf(0).format(a)} m²`;
    case "ha":
      return `${nf(a < 1000 ? 3 : 2).format(a / 10_000)} ha`;
    case "acres":
      return `${nf(2).format(a / 4046.8564224)} acres`;
    default:
      if (a < 10_000) return `${nf(0).format(a)} m²`;
      if (a < 1_000_000) return `${nf(2).format(a / 10_000)} ha`;
      return `${nf(2).format(a / 1_000_000)} km²`;
  }
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

function destPoint(lng: number, lat: number, distance: number, bearingRad: number): [number, number] {
  const R = 6378137;
  const dDivR = distance / R;
  const lat1 = toRad(lat);
  const lon1 = toRad(lng);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dDivR) + Math.cos(lat1) * Math.sin(dDivR) * Math.cos(bearingRad),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(dDivR) * Math.cos(lat1),
      Math.cos(dDivR) - Math.sin(lat1) * Math.sin(lat2),
    );
  return [toDeg(lon2), toDeg(lat2)];
}

function bearing(a: [number, number], b: [number, number]): number {
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLon = toRad(b[0] - a[0]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return Math.atan2(y, x);
}

export function lineLength(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += distanceMeters(coords[i - 1], coords[i]);
  return total;
}

function pointAlong(coords: [number, number][], distM: number): [number, number] {
  if (!coords.length) return [0, 0];
  if (distM <= 0) return coords[0];
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const seg = distanceMeters(coords[i - 1], coords[i]);
    if (acc + seg >= distM) {
      const frac = seg === 0 ? 0 : (distM - acc) / seg;
      return [
        coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * frac,
        coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * frac,
      ];
    }
    acc += seg;
  }
  return coords[coords.length - 1];
}

type LabelKind = "segment" | "total" | "area";

function label(coord: [number, number], text: string, kind: LabelKind): Feature<Point> {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: coord },
    properties: { label: text, kind },
  };
}

function segmentLabels(coords: [number, number][], units: DistanceUnits): Feature<Point>[] {
  const out: Feature<Point>[] = [];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const d = distanceMeters(a, b);
    if (d <= 0) continue;
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    out.push(label(mid, formatLength(d, units), "segment"));
  }
  return out;
}

function ticks(coords: [number, number][], s: MeasureSettings): Feature<LineString>[] {
  const out: Feature<LineString>[] = [];
  const total = lineLength(coords);
  const step = Math.max(s.tickInterval, 1);
  for (let d = 0; d <= total; d += step) {
    const pos = pointAlong(coords, d);
    const fwd = pointAlong(coords, Math.min(d + 2, total));
    const back = pointAlong(coords, Math.max(d - 2, 0));
    const br = bearing(back, fwd);
    out.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          destPoint(pos[0], pos[1], s.tickLength / 2, br + Math.PI / 2),
          destPoint(pos[0], pos[1], s.tickLength / 2, br - Math.PI / 2),
        ],
      },
      properties: { measureTick: true },
    });
  }
  return out;
}

/** Labels (and optional ticks) for a measured line. */
export function measureLine(coords: [number, number][], s: MeasureSettings): Feature[] {
  if (coords.length < 2) return [];
  const out: Feature[] = [];
  if (s.showTicks) out.push(...ticks(coords, s));
  // Segment labels only add information when there's more than one segment.
  if (s.showSegments && coords.length > 2) out.push(...segmentLabels(coords, s.units));
  if (s.showTotal) {
    const end = coords[coords.length - 1];
    const br = bearing(coords[coords.length - 2], end);
    // Nudge the total just past the end of the line so it doesn't sit on it.
    out.push(label(destPoint(end[0], end[1], 12, br), formatLength(lineLength(coords), s.units), "total"));
  }
  return out;
}

/** Area (+ perimeter) at the centroid, and optional edge lengths. */
export function measurePolygon(rings: [number, number][][], s: MeasureSettings): Feature[] {
  const ring = rings[0] ?? [];
  if (ring.length < 4) return [];
  const out: Feature[] = [];
  if (s.showSegments) out.push(...segmentLabels(ring, s.units));
  if (s.showTotal || s.showPerimeter) {
    const pts = ring.slice(0, -1);
    const c: [number, number] = [
      pts.reduce((acc, p) => acc + p[0], 0) / pts.length,
      pts.reduce((acc, p) => acc + p[1], 0) / pts.length,
    ];
    const lines: string[] = [];
    // Geodesic area (spherical excess) — the old planar version used cos(lng)
    // instead of cos(lat) and overstated UK areas by ~65%.
    if (s.showTotal) lines.push(formatAreaIn(polygonAreaMeters2([ring]), s.areaUnits));
    if (s.showPerimeter) lines.push(`${formatLength(lineLength(ring), s.units)} perimeter`);
    out.push(label(c, lines.join("\n"), "area"));
  }
  return out;
}
