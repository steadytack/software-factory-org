/** Pure helpers for sketches: what a new one is called, and how they are written out (GeoJSON that keeps their names and styles,
 *  and a CSV with one row per sketch). */
import type { Feature, FeatureCollection, Geometry } from "geojson";

import { polygonAreaMeters2 } from "../utils/coordinates";
import { lineLength } from "../utils/measurement";
import type { DrawFeature } from "./types";

/** "Line 3": the tool's name and the next free number among the sketches already named that way. */
export function nextName(base: string, existing: { name: string }[]): string {
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (\\d+)$`);
  let max = 0;
  for (const f of existing) {
    const m = re.exec(f.name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${base} ${max + 1}`;
}

/** The sketches as GeoJSON, each carrying its name and style so another tool (or this app's import) gets them back. */
export function sketchesToGeoJSON(features: DrawFeature[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: features.map((f): Feature => {
      const radiusKm = (f.properties as { radiusKilometers?: number } | null)?.radiusKilometers;
      return {
        type: "Feature",
        id: f.id,
        geometry: f.geometry as Geometry,
        properties: {
          name: f.name,
          kind: f.kind,
          label: f.label,
          color: f.color,
          weight: f.weight,
          lineStyle: f.lineStyle,
          fillOpacity: f.fillOpacity,
          ...(f.kind === "circle" && radiusKm ? { radius_m: Math.round(radiusKm * 1000) } : {}),
        },
      };
    }),
  };
}

/** A spreadsheet cell: quoted when it needs to be, and with a leading apostrophe when it would otherwise be read as a formula. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type Position = [number, number];

/** A representative point: the point itself, or the average of a line's or shape's corners. */
function centre(g: Geometry): Position | null {
  if (g.type === "Point") return g.coordinates as Position;
  const ring: Position[] | null =
    g.type === "LineString" ? (g.coordinates as Position[]) : g.type === "Polygon" ? (g.coordinates[0] as Position[]) : null;
  if (!ring?.length) return null;
  const pts = g.type === "Polygon" && ring.length > 1 ? ring.slice(0, -1) : ring;
  return [pts.reduce((a, c) => a + c[0], 0) / pts.length, pts.reduce((a, c) => a + c[1], 0) / pts.length];
}

const KIND_LABEL: Record<DrawFeature["kind"], string> = {
  marker: "Marker",
  note: "Note",
  polyline: "Line",
  polygon: "Shape",
  circle: "Circle",
  measurement: "Measurement",
};

/** One row per sketch: name, kind, label, a representative position, and its length (or perimeter) and area in metres. */
export function sketchesToCSV(features: DrawFeature[]): string {
  const rows = ["name,kind,label,latitude,longitude,length_m,area_m2"];
  for (const f of features) {
    const c = centre(f.geometry as Geometry);
    const g = f.geometry as Geometry;
    const length =
      g.type === "LineString" ? lineLength(g.coordinates as Position[]) : g.type === "Polygon" ? lineLength(g.coordinates[0] as Position[]) : null;
    const area = g.type === "Polygon" ? polygonAreaMeters2(g.coordinates as Position[][]) : null;
    rows.push(
      [
        csvCell(f.name),
        csvCell(KIND_LABEL[f.kind]),
        csvCell(f.label),
        c ? c[1].toFixed(7) : "",
        c ? c[0].toFixed(7) : "",
        length === null ? "" : length.toFixed(1),
        area === null ? "" : Math.abs(area).toFixed(1),
      ].join(","),
    );
  }
  return rows.join("\n");
}
