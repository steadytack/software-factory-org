/**
 * Fetch + parse external map service capabilities (WMS/WFS GetCapabilities,
 * OGC API Features collections) and fetch their data for adding as a layer.
 * Used by the "Add external layer" flow in the Layers tab.
 */

import type { FeatureCollection } from "geojson";
import { withTimeout } from "../../../lib/fetchTimeout";

export type ExternalServiceType = "wms" | "wfs" | "ogc-features";

export interface ExternalLayerOption {
  /** Layer name (WMS), feature type name (WFS), or collection id (OGC API). */
  id: string;
  title: string;
}

function stripQuery(url: string): string {
  const i = url.indexOf("?");
  return i === -1 ? url : url.slice(0, i);
}

function noTrailingSlash(url: string): string {
  const s = stripQuery(url.trim());
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

/** Namespace-agnostic child lookup — capabilities XML often prefixes tags
 *  (wms:Name, ows:Title) depending on the server. */
function childText(el: Element, tag: string): string {
  const found = Array.from(el.children).find(
    (c) => c.tagName === tag || c.tagName.endsWith(`:${tag}`),
  );
  return found?.textContent?.trim() ?? "";
}

/** Services are user-entered and outside our control; a slow one must end in
 *  a message, not a dialog that spins forever. Feature queries can be large,
 *  so the limit is longer than geocoding's. */
const SERVICE_TIMEOUT_MS = 20_000;

async function fetchService(url: string): Promise<Response> {
  try {
    return await fetch(url, { signal: withTimeout(SERVICE_TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(`The service didn't respond within ${SERVICE_TIMEOUT_MS / 1000} seconds`);
    }
    throw error;
  }
}

async function fetchXml(url: string): Promise<Document> {
  const res = await fetchService(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Could not parse capabilities XML");
  return doc;
}

export async function fetchWmsCapabilities(baseUrl: string): Promise<ExternalLayerOption[]> {
  const base = stripQuery(baseUrl.trim());
  const sep = base.includes("?") ? "&" : "?";
  const doc = await fetchXml(`${base}${sep}service=WMS&request=GetCapabilities`);
  const layerEls = Array.from(doc.getElementsByTagName("Layer")).filter((el) =>
    Array.from(el.children).some((c) => c.tagName === "Name" || c.tagName.endsWith(":Name")),
  );
  const options = layerEls
    .map((el) => ({ id: childText(el, "Name"), title: childText(el, "Title") || childText(el, "Name") }))
    .filter((o) => o.id);
  if (options.length === 0) throw new Error("No layers found in WMS capabilities");
  return options;
}

export async function fetchWfsCapabilities(baseUrl: string): Promise<ExternalLayerOption[]> {
  const base = stripQuery(baseUrl.trim());
  const sep = base.includes("?") ? "&" : "?";
  const doc = await fetchXml(`${base}${sep}service=WFS&request=GetCapabilities`);
  const typeEls = Array.from(doc.getElementsByTagName("FeatureType"));
  const options = typeEls
    .map((el) => ({ id: childText(el, "Name"), title: childText(el, "Title") || childText(el, "Name") }))
    .filter((o) => o.id);
  if (options.length === 0) throw new Error("No feature types found in WFS capabilities");
  return options;
}

export async function fetchOgcCollections(landingUrl: string): Promise<ExternalLayerOption[]> {
  const base = noTrailingSlash(landingUrl);
  const res = await fetchService(`${base}/collections?f=json`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const body = await res.json();
  const collections = Array.isArray(body?.collections) ? body.collections : [];
  const options = collections
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((c: any) => ({ id: String(c.id ?? ""), title: String(c.title ?? c.id ?? "") }))
    .filter((o: ExternalLayerOption) => o.id);
  if (options.length === 0) throw new Error("No collections found at this OGC API endpoint");
  return options;
}

export async function fetchCapabilities(
  serviceType: ExternalServiceType,
  url: string,
): Promise<ExternalLayerOption[]> {
  if (serviceType === "wms") return fetchWmsCapabilities(url);
  if (serviceType === "wfs") return fetchWfsCapabilities(url);
  return fetchOgcCollections(url);
}

/** The service's own legend picture for a layer (WMS GetLegendGraphic). */
export function buildWmsLegendUrl(baseUrl: string, layerName: string): string {
  const base = stripQuery(baseUrl.trim());
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}service=WMS&version=1.3.0&request=GetLegendGraphic&format=image/png&sld_version=1.1.0&layer=${encodeURIComponent(layerName)}`;
}

export function buildWmsTileUrl(baseUrl: string, layerName: string): string {
  const base = stripQuery(baseUrl.trim());
  const sep = base.includes("?") ? "&" : "?";
  return (
    `${base}${sep}service=WMS&request=GetMap&version=1.1.1&layers=${encodeURIComponent(layerName)}` +
    `&styles=&format=image/png&transparent=true&width=256&height=256&srs=EPSG:3857&bbox={bbox-epsg-3857}`
  );
}

/** Most features fetched from a service at once. Services like the
 *  national flood zones hold millions; the map asks for the current view. */
export const MAX_SERVICE_FEATURES = 5000;

export interface ViewBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface FetchedFeatures {
  data: FeatureCollection;
  /** More features exist in the view than were fetched. */
  truncated: boolean;
}

/** Some servers answer EPSG:4326 in latitude, longitude order. For UK data
 *  that's easy to spot (and to put right). */
export function fixAxisOrder(fc: FeatureCollection): FeatureCollection {
  const sample: number[][] = [];
  const visit = (c: unknown) => {
    if (sample.length >= 50 || !Array.isArray(c)) return;
    if (typeof c[0] === "number") sample.push(c as number[]);
    else for (const p of c) visit(p);
  };
  for (const f of fc.features) {
    if (f.geometry && "coordinates" in f.geometry) visit(f.geometry.coordinates);
    if (sample.length >= 50) break;
  }
  const swapped = sample.length > 0 && sample.every(([a, b]) => a >= 45 && a <= 62 && b >= -12 && b <= 4);
  if (!swapped) return fc;
  const swap = (c: unknown): unknown =>
    Array.isArray(c) && typeof c[0] === "number" ? [c[1], c[0], ...c.slice(2)] : (c as unknown[]).map(swap);
  return {
    ...fc,
    features: fc.features.map((f) =>
      f.geometry && "coordinates" in f.geometry
        ? { ...f, geometry: { ...f.geometry, coordinates: swap(f.geometry.coordinates) } as typeof f.geometry }
        : f,
    ),
  };
}

export function wfsFeaturesUrl(baseUrl: string, typeName: string, view?: ViewBox, max = MAX_SERVICE_FEATURES): string {
  const base = stripQuery(baseUrl.trim());
  const sep = base.includes("?") ? "&" : "?";
  const bbox = view
    ? `&bbox=${[view.west, view.south, view.east, view.north].map((v) => v.toFixed(6)).join(",")},urn:ogc:def:crs:OGC:1.3:CRS84`
    : "";
  // WFS 2.0 names (typeNames, count) plus the 1.x ones, which 2.0 servers
  // ignore, so either kind of server limits what it sends.
  return (
    `${base}${sep}service=WFS&version=2.0.0&request=GetFeature` +
    `&typeNames=${encodeURIComponent(typeName)}&typeName=${encodeURIComponent(typeName)}` +
    `&count=${max}&maxFeatures=${max}&outputFormat=application/json&srsName=EPSG:4326${bbox}`
  );
}

export async function fetchWfsFeatures(
  baseUrl: string,
  typeName: string,
  view?: ViewBox,
  max = MAX_SERVICE_FEATURES,
): Promise<FetchedFeatures> {
  const res = await fetchService(wfsFeaturesUrl(baseUrl, typeName, view, max));
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("The service didn't return GeoJSON (it may not support JSON output) — try its WMS instead.");
  }
  if ((data as { type?: unknown })?.type !== "FeatureCollection") {
    throw new Error("The service didn't return GeoJSON (it may not support JSON output) — try its WMS instead.");
  }
  const fc = fixAxisOrder(data as FeatureCollection);
  return { data: fc, truncated: fc.features.length >= max };
}

const OGC_PAGE = 1000;

export async function fetchOgcFeatures(
  landingUrl: string,
  collectionId: string,
  view?: ViewBox,
  max = MAX_SERVICE_FEATURES,
): Promise<FetchedFeatures> {
  const base = noTrailingSlash(landingUrl);
  const bbox = view ? `&bbox=${[view.west, view.south, view.east, view.north].map((v) => v.toFixed(6)).join(",")}` : "";
  let url: string | null = `${base}/collections/${encodeURIComponent(collectionId)}/items?f=json&limit=${Math.min(OGC_PAGE, max)}${bbox}`;
  const features: FeatureCollection["features"] = [];
  let more = false;
  while (url) {
    const res: Response = await fetchService(url);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = await res.json();
    if (Array.isArray(body?.features)) features.push(...body.features);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const links: any[] = Array.isArray(body?.links) ? body.links : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const next: string | null = links.find((l: any) => l.rel === "next")?.href ?? null;
    if (next && features.length >= max) {
      more = true;
      break;
    }
    url = next;
  }
  return { data: { type: "FeatureCollection", features: features.slice(0, max) }, truncated: more };
}

export async function fetchExternalFeatures(
  serviceType: "wfs" | "ogc-features",
  url: string,
  optionId: string,
  view?: ViewBox,
): Promise<FetchedFeatures> {
  return serviceType === "wfs" ? fetchWfsFeatures(url, optionId, view) : fetchOgcFeatures(url, optionId, view);
}

/** Services worth knowing about, offered in Add data. WMS draws them as
 *  pictures from the server, so national datasets cost nothing to show. */
export interface SuggestedService {
  title: string;
  description: string;
  type: ExternalServiceType;
  url: string;
  attribution: string;
}

export const SUGGESTED_SERVICES: SuggestedService[] = [
  {
    title: "Flood Map for Planning: Flood Zones 2 and 3",
    description: "Environment Agency, England",
    type: "wms",
    url: "https://environment.data.gov.uk/spatialdata/flood-map-for-planning-flood-zones/wms",
    attribution: "© Environment Agency copyright and/or database right. All rights reserved.",
  },
];
