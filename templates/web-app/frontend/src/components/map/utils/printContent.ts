/**
 * What goes on a printed map sheet besides the map: a legend of only what's
 * inside the printed area (QGIS's "only show items inside the linked map"),
 * and words for where the sheet is, sized to how much ground it covers.
 */
import type { FeatureCollection, Geometry, Point } from "geojson";

import type { Bounds, LegendItem } from "./printMap";
import { RULE_GREY } from "../layers/colors";
import type { DrawFeature } from "../draw/types";
import type { MapDataLayer } from "../layers/types";
import { isPointKey, type LayerKey } from "../layers/order";
import { legendRows, type PointLayerKey, type PointLayerState, type PointProps } from "../layers/pointLayers";
import { passesDataFilter } from "../layers/dataFilter";
import { distanceMeters } from "./coordinates";
import { reverseAddress, reverseLocality, reverseRegion } from "./geocode";

export function inBounds(lng: number, lat: number, b: Bounds): boolean {
  return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north;
}

/** Whether any part of a geometry's bounding box falls inside `b`. */
export function geometryTouches(geometry: Geometry | null | undefined, b: Bounds): boolean {
  if (!geometry) return false;
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  const visit = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number" && typeof c[1] === "number") {
      west = Math.min(west, c[0]);
      east = Math.max(east, c[0]);
      south = Math.min(south, c[1]);
      north = Math.max(north, c[1]);
      return;
    }
    for (const part of c) visit(part);
  };
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.some((g) => geometryTouches(g, b));
  }
  visit(geometry.coordinates);
  if (!isFinite(west)) return false;
  return west <= b.east && east >= b.west && south <= b.north && north >= b.south;
}

export interface LegendSources {
  order: LayerKey[];
  /** Sites and surveys: their settings and points. */
  points: Partial<Record<PointLayerKey, { state: PointLayerState; geo: FeatureCollection<Point, PointProps> }>>;
  sketches: { visible: boolean; features: DrawFeature[] };
  dataLayers: MapDataLayer[];
}

/** Legend rows for what's visible *inside* `b`, top layer first, with
 *  counts. Hidden layers and ones with nothing on the sheet are left out. */
export function legendFor(src: LegendSources, b: Bounds): LegendItem[] {
  const items: LegendItem[] = [];
  for (const key of src.order) {
    if (isPointKey(key)) {
      const layer = src.points[key];
      if (!layer?.state.visible) continue;
      const inside = layer.geo.features
        .filter((f) => inBounds(f.geometry.coordinates[0], f.geometry.coordinates[1], b))
        .map((f) => f.properties);
      for (const row of legendRows(key, layer.state, inside)) {
        items.push({ label: row.label, kind: "point", color: row.color, strokeColor: row.strokeColor, count: row.count });
      }
    } else if (key === "sketches" && src.sketches.visible) {
      const seen = new Map<string, LegendItem>();
      for (const f of src.sketches.features) {
        if (!geometryTouches(f.geometry, b)) continue;
        const kind = f.geometry.type === "Point" ? "point" : f.geometry.type === "Polygon" ? "fill" : "line";
        const label = f.label || f.name.replace(/\s+\d+$/, "");
        const k = `${label}|${kind}|${f.color}`;
        const row = seen.get(k);
        if (row) row.count = (row.count ?? 1) + 1;
        else seen.set(k, { label, kind, color: f.color, count: 1 });
      }
      items.push(...seen.values());
    } else if (key.startsWith("data:")) {
      const layer = src.dataLayers.find((l) => `data:${l.id}` === key);
      if (!layer?.visible) continue;
      if (layer.type === "geojson" && layer.data) {
        const n = layer.data.features.filter(
          (f) => passesDataFilter(layer.filter, f.properties) && geometryTouches(f.geometry, b),
        ).length;
        if (!n) continue;
        items.push({ label: layer.name, kind: "fill", color: layer.style.fillColor, strokeColor: layer.style.strokeColor, count: n });
      } else {
        // A map service is a picture drawn by its server: its colours aren't the layer's style, so the swatch is a plain
        // outlined box and the name says what it is.
        items.push({ label: layer.name, kind: "fill", color: "#ffffff", strokeColor: RULE_GREY, legendUrl: layer.legendUrl });
      }
    }
  }
  return items;
}

export interface NamedSite {
  name: string;
  address?: string | null;
  postcode?: string | null;
  latitude: number;
  longitude: number;
}

/** A sheet centred on (or within this of) a site is about that site. */
export const SITE_RADIUS_M = 150;
/** Narrower than this, the nearest address describes the sheet; wider,
 *  only the area does — one address would mislead. */
export const ADDRESS_MAX_WIDTH_M = 1000;
/** Wider than this a town name misleads; the county or region describes it. */
export const LOCALITY_MAX_WIDTH_M = 15_000;
/** Wider than this, only the countries covered describe the sheet. */
export const REGION_MAX_WIDTH_M = 150_000;

export interface Lookups {
  address: typeof reverseAddress;
  locality: typeof reverseLocality;
  region?: typeof reverseRegion;
}

export type Country = "England" | "Wales" | "Scotland" | "Northern Ireland" | "Ireland";

/** Which country a point is in, roughly — good enough to name the
 *  countries a national-scale sheet covers, and works offline. Borders
 *  are simplified lines; sea is counted with the country beside it. */
export function countryAt(lng: number, lat: number): Country | null {
  if (lng < -11 || lng > 2.1 || lat < 49.8 || lat > 61) return null;
  if (lng < -5.45) {
    if (lat > 55.4) return "Scotland"; // Hebrides
    if (lat >= 54.0) return lng >= -8.2 ? "Northern Ireland" : "Ireland";
    // South of 54°: the Irish coast is at about 6°W; east of it is sea
    // (counted with Wales/England below), and Cornwall is south of 51°.
    if (lng < -6.0 && lat >= 51) return "Ireland";
  }
  // The Anglo-Scottish border: Solway Firth to Berwick.
  const border =
    lng >= -2.03 ? 55.8 : lng >= -3.1 ? 54.95 + ((lng + 3.1) * 0.85) / 1.07 : lng >= -3.6 ? 54.9 : 54.6;
  if (lat > border) return "Scotland";
  if (lat >= 51.35 && lat <= 53.45 && lng < (lat > 52.8 ? -3.0 : -2.7)) return "Wales";
  return "England";
}

const COUNTRY_ORDER: Country[] = ["England", "Wales", "Scotland", "Northern Ireland", "Ireland"];

/** The countries a sheet covers, named the way people say it: "England",
 *  "England and Wales", "Great Britain", "United Kingdom". */
export function countriesIn(b: Bounds): string | null {
  const found = new Set<Country>();
  // Fine enough to catch Northern Ireland on a sheet of the whole UK.
  const n = 25;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const c = countryAt(b.west + ((b.east - b.west) * i) / (n - 1), b.south + ((b.north - b.south) * j) / (n - 1));
      if (c) found.add(c);
    }
  }
  if (!found.size) return null;
  const names: string[] = [];
  const has = (c: Country) => found.has(c);
  if (has("England") && has("Wales") && has("Scotland")) {
    names.push(has("Northern Ireland") ? "United Kingdom" : "Great Britain");
    if (has("Ireland")) names.push("Ireland");
  } else {
    names.push(...COUNTRY_ORDER.filter(has));
  }
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
}

/** Words for where a sheet is, sized to how much ground it covers:
 *  - on a site: its name and saved address;
 *  - under 1 km across: "near" the nearest street address;
 *  - up to 15 km: the area, e.g. "Area around Bankside, Southwark";
 *  - up to 150 km: the county or region, e.g. "Kent, England";
 *  - wider: the countries, e.g. "England and Wales", "United Kingdom".
 *  Null when nothing can be looked up (offline, below national scale).
 *  Results are cached. */
export function makeLocationDescriber(
  sites: () => NamedSite[],
  lookups: Lookups = { address: reverseAddress, locality: reverseLocality, region: reverseRegion },
) {
  const cache = new Map<string, string | null>();
  return async (
    centre: { lat: number; lng: number },
    widthMetres: number,
    bounds?: Bounds,
  ): Promise<string | null> => {
    // Countries don't need a lookup (so this works offline too).
    const area =
      bounds ??
      (() => {
        const dLat = widthMetres / 2 / 111_320;
        const dLng = dLat / Math.max(0.2, Math.cos((centre.lat * Math.PI) / 180));
        return { west: centre.lng - dLng, east: centre.lng + dLng, south: centre.lat - dLat, north: centre.lat + dLat };
      })();
    if (widthMetres > REGION_MAX_WIDTH_M) return countriesIn(area);
    let nearest: { site: NamedSite; d: number } | null = null;
    for (const site of sites()) {
      const d = distanceMeters([centre.lng, centre.lat], [site.longitude, site.latitude]);
      if (d <= SITE_RADIUS_M && (!nearest || d < nearest.d)) nearest = { site, d };
    }
    if (nearest && widthMetres <= ADDRESS_MAX_WIDTH_M * 2) {
      const { name, address, postcode } = nearest.site;
      const where = [address, postcode].filter(Boolean).join(", ");
      return where ? `${name}, ${where}` : name;
    }
    const tier = widthMetres < ADDRESS_MAX_WIDTH_M ? "a" : widthMetres <= LOCALITY_MAX_WIDTH_M ? "l" : "r";
    const digits = tier === "a" ? 4 : tier === "l" ? 2 : 1;
    const key = `${tier}:${centre.lat.toFixed(digits)},${centre.lng.toFixed(digits)}`;
    if (cache.has(key)) return cache.get(key)!;
    let result: string | null;
    if (tier === "a") {
      const found = await lookups.address(centre.lat, centre.lng);
      result = found?.address ? `Near ${found.address}` : null;
    } else if (tier === "l") {
      const place = await lookups.locality(centre.lat, centre.lng);
      result = place ? `Area around ${place}` : null;
    } else {
      const region = lookups.region ? await lookups.region(centre.lat, centre.lng) : null;
      // Offline: the countries are better than nothing.
      if (!region) return countriesIn(area);
      result = region;
    }
    // Don't remember a failed lookup (it may just be offline).
    if (result) cache.set(key, result);
    return result;
  };
}
