/**
 * Reading a data file into a layer: GeoJSON (.geojson/.json) or a zipped
 * shapefile (.zip), in any of the projections UK data comes in. The work
 * runs in a Web Worker (importWorker.ts) so a big file can't freeze the
 * page; these functions are also what the worker calls.
 *
 * Why this matters: national datasets such as the Environment Agency's
 * Flood Map for Planning are in British National Grid (metres). Drawn as if
 * they were longitude/latitude they land nowhere; at hundreds of MB they
 * exhaust the tab. Big files are refused with a way forward (the WMS
 * version, or clip first), and BNG is reprojected.
 */
import proj4 from "proj4";
import type { FeatureCollection, Geometry, Position } from "geojson";

export const MAX_FILE_MB = 75;
export const WARN_FILE_MB = 20;

proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs",
);

export class ImportError extends Error {}

export type FileKind = "geojson" | "shapefile";

export function fileKind(name: string): FileKind | null {
  const n = name.toLowerCase();
  if (n.endsWith(".geojson") || n.endsWith(".json")) return "geojson";
  if (n.endsWith(".zip")) return "shapefile";
  return null;
}

/** Refuse what the browser can't hold, and say what to do instead. */
export function checkSize(name: string, bytes: number): string | null {
  const mb = bytes / 1024 / 1024;
  if (mb > MAX_FILE_MB) {
    throw new ImportError(
      `${name} is ${Math.round(mb)} MB — too big to draw in the browser (the limit is ${MAX_FILE_MB} MB). ` +
        "Add the web map (WMS) version instead, or clip the data to your area first.",
    );
  }
  return mb > WARN_FILE_MB ? `${name} is ${Math.round(mb)} MB, so it may be slow to draw.` : null;
}

export const layerName = (fileName: string) => fileName.replace(/\.(geo)?json$|\.zip$/i, "");

/** The CRS a GeoJSON file declares (the old `crs` member), if any. */
export function declaredCrs(fc: unknown): string | null {
  const name = (fc as { crs?: { properties?: { name?: string } } })?.crs?.properties?.name;
  if (!name) return null;
  if (/CRS84|4326/i.test(name)) return "EPSG:4326";
  if (/27700/.test(name)) return "EPSG:27700";
  if (/3857|900913/.test(name)) return "EPSG:3857";
  return name;
}

function firstPositions(geometry: Geometry | null, out: Position[], max: number) {
  if (!geometry || out.length >= max) return;
  if (geometry.type === "GeometryCollection") {
    for (const g of geometry.geometries) firstPositions(g, out, max);
    return;
  }
  const visit = (c: unknown) => {
    if (out.length >= max || !Array.isArray(c)) return;
    if (typeof c[0] === "number") out.push(c as Position);
    else for (const p of c) visit(p);
  };
  visit(geometry.coordinates);
}

/** Which projection the coordinates are in: declared, or worked out from
 *  their size — metres in the BNG range are BNG. */
export function detectCrs(fc: FeatureCollection): string {
  const declared = declaredCrs(fc);
  if (declared) return declared;
  const sample: Position[] = [];
  for (const f of fc.features) {
    firstPositions(f.geometry, sample, 200);
    if (sample.length >= 200) break;
  }
  if (!sample.length || sample.every(([x, y]) => Math.abs(x) <= 180 && Math.abs(y) <= 90)) return "EPSG:4326";
  if (sample.every(([x, y]) => x >= -10_000 && x <= 800_000 && y >= -10_000 && y <= 1_400_000)) return "EPSG:27700";
  if (sample.every(([x, y]) => Math.abs(x) <= 20_037_509 && Math.abs(y) <= 20_048_967)) return "EPSG:3857";
  return "unknown";
}

function reprojectGeometry(g: Geometry | null, t: (p: Position) => Position): Geometry | null {
  if (!g) return g;
  if (g.type === "GeometryCollection") {
    return { ...g, geometries: g.geometries.map((x) => reprojectGeometry(x, t) as Geometry) };
  }
  const walk = (c: unknown): unknown =>
    Array.isArray(c) && typeof c[0] === "number" ? t(c as Position) : (c as unknown[]).map(walk);
  return { ...g, coordinates: walk(g.coordinates) } as Geometry;
}

/** A FeatureCollection in longitude/latitude, with a note if it had to be
 *  converted. Unknown projections are refused rather than drawn wrongly. */
export function toWgs84(fc: FeatureCollection): { data: FeatureCollection; note: string | null } {
  const crs = detectCrs(fc);
  const clean = (data: FeatureCollection): FeatureCollection => {
    const { crs: _drop, ...rest } = data as FeatureCollection & { crs?: unknown };
    void _drop;
    return rest as FeatureCollection;
  };
  if (crs === "EPSG:4326") return { data: clean(fc), note: null };
  if (crs !== "EPSG:27700" && crs !== "EPSG:3857") {
    throw new ImportError(
      `This file's coordinates are in a projection the map can't convert (${crs}). Save it as GeoJSON in WGS84 (EPSG:4326) or British National Grid.`,
    );
  }
  const convert = proj4(crs, "EPSG:4326");
  const t = (p: Position): Position => {
    const [x, y] = convert.forward([p[0], p[1]]);
    return [Math.round(x * 1e7) / 1e7, Math.round(y * 1e7) / 1e7];
  };
  const data = clean({
    ...fc,
    features: fc.features.map((f) => ({ ...f, geometry: reprojectGeometry(f.geometry, t) as Geometry })),
  });
  return {
    data,
    note: crs === "EPSG:27700" ? "Converted from British National Grid." : "Converted from Web Mercator.",
  };
}

export function isFeatureCollection(v: unknown): v is FeatureCollection {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { type?: unknown }).type === "FeatureCollection" &&
    Array.isArray((v as { features?: unknown }).features)
  );
}

export interface ImportedLayer {
  name: string;
  data: FeatureCollection;
  notes: string[];
}

/** Parse file contents (already read) into one or more layers. */
export async function parseData(name: string, contents: ArrayBuffer): Promise<ImportedLayer[]> {
  const kind = fileKind(name);
  if (kind === "geojson") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(contents));
    } catch {
      throw new ImportError(`${name} isn't valid JSON.`);
    }
    if (!isFeatureCollection(parsed)) throw new ImportError(`${name} isn't a GeoJSON FeatureCollection.`);
    const { data, note } = toWgs84(parsed);
    return [{ name: layerName(name), data, notes: note ? [note] : [] }];
  }
  if (kind === "shapefile") {
    const { parseZip } = await import("shpjs");
    let parsed: unknown;
    try {
      parsed = await parseZip(contents);
    } catch {
      throw new ImportError(`${name} isn't a zipped shapefile (it needs the .shp, .dbf and .prj inside).`);
    }
    const layers = (Array.isArray(parsed) ? parsed : [parsed]) as (FeatureCollection & { fileName?: string })[];
    // shpjs reprojects using the .prj; anything still in metres had none.
    return layers.map((fc) => {
      const { data, note } = toWgs84(fc);
      const layer = fc.fileName ? fc.fileName.split("/").pop()! : layerName(name);
      return { name: layers.length > 1 ? layer : layerName(name), data, notes: note ? [note] : [] };
    });
  }
  throw new ImportError(`${name}: only GeoJSON (.geojson, .json) and zipped shapefiles (.zip) can be added.`);
}
