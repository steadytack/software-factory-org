/**
 * Filtering an uploaded data layer on one of its properties — e.g. only
 * Flood Zone 3, or only features with a value over 10. Text properties
 * filter by ticking values; number properties by a min/max range.
 */
import type { Feature, GeoJsonProperties } from "geojson";

export interface DataLayerFilter {
  property: string;
  /** Text: the values to show. */
  values?: string[];
  /** Number: inclusive range; either end may be open. */
  min?: number | null;
  max?: number | null;
}

export interface PropertySummary {
  name: string;
  kind: "text" | "number";
  /** Distinct values, most common first (text), capped at MAX_VALUES. */
  values: string[];
  /** More distinct values than listed. */
  more: boolean;
  min: number;
  max: number;
}

export const MAX_VALUES = 50;
const SAMPLE = 20_000;

const asText = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** The properties worth filtering on: seen on the layer's features, with
 *  their values (text) or range (numbers). Large layers are sampled. */
export function summariseProperties(features: Feature[]): PropertySummary[] {
  const stats = new Map<string, { counts: Map<string, number>; numeric: boolean; min: number; max: number }>();
  const step = Math.max(1, Math.floor(features.length / SAMPLE));
  for (let i = 0; i < features.length; i += step) {
    const props = features[i].properties ?? {};
    for (const [name, v] of Object.entries(props)) {
      if (v !== null && typeof v === "object") continue;
      let s = stats.get(name);
      if (!s) {
        s = { counts: new Map(), numeric: true, min: Infinity, max: -Infinity };
        stats.set(name, s);
      }
      if (v === null || v === undefined || v === "") continue;
      if (typeof v === "number" && Number.isFinite(v)) {
        s.min = Math.min(s.min, v);
        s.max = Math.max(s.max, v);
      } else s.numeric = false;
      const key = asText(v);
      if (s.counts.size <= MAX_VALUES || s.counts.has(key)) s.counts.set(key, (s.counts.get(key) ?? 0) + 1);
    }
  }
  return [...stats.entries()]
    .filter(([, s]) => s.counts.size > 0)
    .map(([name, s]) => {
      // A number with only a few distinct values (e.g. zone 2 / 3) reads
      // better as a list of values than as a range.
      const kind: PropertySummary["kind"] = s.numeric && s.counts.size > 12 ? "number" : "text";
      const sorted = [...s.counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en", { numeric: true }));
      return {
        name,
        kind,
        values: sorted.slice(0, MAX_VALUES).map(([v]) => v),
        more: s.counts.size > MAX_VALUES,
        min: Number.isFinite(s.min) ? s.min : 0,
        max: Number.isFinite(s.max) ? s.max : 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function passesDataFilter(filter: DataLayerFilter | null | undefined, props: GeoJsonProperties): boolean {
  if (!filter?.property) return true;
  const v = props?.[filter.property];
  if (filter.values) return filter.values.includes(asText(v));
  if (filter.min != null || filter.max != null) {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return false;
    if (filter.min != null && n < filter.min) return false;
    if (filter.max != null && n > filter.max) return false;
  }
  return true;
}

/** Indices of the features that pass (null = no filter, show all). */
export function filteredIndices(features: Feature[], filter: DataLayerFilter | null | undefined): number[] | null {
  if (!filter?.property) return null;
  const out: number[] = [];
  features.forEach((f, i) => {
    if (passesDataFilter(filter, f.properties)) out.push(i);
  });
  return out;
}
