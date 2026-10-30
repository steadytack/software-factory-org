/**
 * Geocoding utilities — postcodes.io and Nominatim.
 * Ported from the reference template's geocode.ts (free APIs only).
 *
 * Error strategy (unified): every fetch checks res.ok before parsing, applies
 * a default timeout unless the caller passed its own signal, logs failures
 * with console.warn (never silent), and returns null/[] as the "no result"
 * value. AbortError (caller-cancelled) is returned quietly without a warning.
 */

import { withTimeout } from "../../../lib/fetchTimeout";

export interface GeoResult {
  lat: number;
  lng: number;
  label: string;
}

const DEFAULT_TIMEOUT_MS = 8000;

/** The caller's signal plus the default timeout, so no geocode request can hang. */
function withDefaultTimeout(signal?: AbortSignal): AbortSignal {
  return withTimeout(DEFAULT_TIMEOUT_MS, signal);
}

/** Fetch JSON with res.ok enforcement; throws on HTTP/network failure. */
async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`Geocoding HTTP ${res.status} from ${new URL(url).host}`);
  }
  return res.json();
}

function logFailure(source: string, error: unknown): void {
  if (error instanceof DOMException && error.name === "AbortError") return;
  console.warn(`[geocode] ${source} failed:`, error);
}

// ─── Postcode APIs (postcodes.io) ────────────────────────────────────────────

/** Geocode a UK postcode via postcodes.io. */
export async function geocodePostcode(
  postcode: string,
  signal?: AbortSignal,
): Promise<GeoResult | null> {
  try {
    const data = (await fetchJson(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.trim())}`,
      { signal: withDefaultTimeout(signal) },
    )) as { status?: number; result?: { latitude: number; longitude: number; postcode: string } };
    if (data.status !== 200 || !data.result) return null;
    return {
      lat: data.result.latitude,
      lng: data.result.longitude,
      label: data.result.postcode,
    };
  } catch (error) {
    logFailure("geocodePostcode", error);
    return null;
  }
}

/** What postcodes.io says about a postcode. `unknown` is a definite "no such
 *  postcode" (HTTP 404); `unavailable` is anything else (offline, timeout,
 *  server trouble) and must never be treated as a problem with the postcode. */
export type PostcodeCheck =
  | { status: "found"; hit: GeoResult }
  | { status: "unknown" }
  | { status: "unavailable" };

export async function checkPostcode(postcode: string, signal?: AbortSignal): Promise<PostcodeCheck> {
  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.trim())}`,
      { signal: withDefaultTimeout(signal) },
    );
    if (res.status === 404) return { status: "unknown" };
    if (!res.ok) return { status: "unavailable" };
    const data = (await res.json()) as {
      status?: number;
      result?: { latitude: number; longitude: number; postcode: string };
    };
    if (data.status !== 200 || !data.result) return { status: "unavailable" };
    return {
      status: "found",
      hit: { lat: data.result.latitude, lng: data.result.longitude, label: data.result.postcode },
    };
  } catch (error) {
    logFailure("checkPostcode", error);
    return { status: "unavailable" };
  }
}

/** Autocomplete UK postcodes via postcodes.io. Returns up to 10 postcode strings. */
export async function autocompletePostcodes(
  query: string,
  signal?: AbortSignal,
): Promise<string[]> {
  try {
    const data = (await fetchJson(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(query.trim())}/autocomplete`,
      { signal: withDefaultTimeout(signal) },
    )) as { status?: number; result?: unknown };
    if (data.status !== 200 || !Array.isArray(data.result)) return [];
    return (data.result as string[]).slice(0, 10);
  } catch (error) {
    logFailure("autocompletePostcodes", error);
    return [];
  }
}

/** Reverse-geocode lat/lng to nearest UK postcode via postcodes.io. */
export async function reversePostcode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const data = (await fetchJson(
      `https://api.postcodes.io/postcodes?lon=${lng}&lat=${lat}`,
      { signal: withDefaultTimeout(signal) },
    )) as { status?: number; result?: { postcode?: string }[] };
    if (data.status !== 200 || !data.result?.length) return null;
    return data.result[0].postcode || null;
  } catch (error) {
    logFailure("reversePostcode", error);
    return null;
  }
}

// ─── Nominatim APIs ───────────────────────────────────────────────────────────

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const NOMINATIM_HEADERS: HeadersInit = { "Accept-Language": "en" };

interface NominatimSearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

/** Runtime guard: Nominatim returns an array of well-known fields. */
function isNominatimSearchResults(value: unknown): value is NominatimSearchResult[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as NominatimSearchResult).display_name === "string" &&
        typeof (item as NominatimSearchResult).lat === "string" &&
        typeof (item as NominatimSearchResult).lon === "string",
    )
  );
}

/** Search addresses via Nominatim (GB-only, limit 6). */
export async function autocompleteAddresses(
  query: string,
  signal?: AbortSignal,
): Promise<GeoResult[]> {
  try {
    await nominatimTurn(signal);
    const params = new URLSearchParams({
      q: query,
      countrycodes: "gb",
      limit: "6",
      format: "json",
      addressdetails: "0",
    });
    const data: unknown = await fetchJson(`${NOMINATIM_BASE}/search?${params}`, {
      signal: withDefaultTimeout(signal),
      headers: NOMINATIM_HEADERS,
    });
    if (!isNominatimSearchResults(data)) return [];
    return data.map((item) => ({
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      label: item.display_name,
    }));
  } catch (error) {
    logFailure("autocompleteAddresses", error);
    return [];
  }
}

/** Geocode an address/place query via Nominatim (GB-only, best match). */
export async function geocodePlace(
  query: string,
  signal?: AbortSignal,
): Promise<GeoResult | null> {
  try {
    await nominatimTurn(signal);
    const params = new URLSearchParams({
      q: query,
      countrycodes: "gb",
      limit: "1",
      format: "json",
    });
    const data: unknown = await fetchJson(`${NOMINATIM_BASE}/search?${params}`, {
      signal: withDefaultTimeout(signal),
      headers: NOMINATIM_HEADERS,
    });
    if (!isNominatimSearchResults(data) || !data.length) return null;
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      label: data[0].display_name,
    };
  } catch (error) {
    logFailure("geocodePlace", error);
    return null;
  }
}

interface NominatimReverseResult {
  display_name: string;
  address?: {
    house_number?: string;
    road?: string;
    hamlet?: string;
    village?: string;
    suburb?: string;
    neighbourhood?: string;
    town?: string;
    city?: string;
    county?: string;
    postcode?: string;
  };
}

export interface ReverseAddressResult {
  address: string;
  postcode: string | null;
}

/** Reverse-geocode lat/lng to a street address via Nominatim. */
export async function reverseAddress(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<ReverseAddressResult | null> {
  try {
    await nominatimTurn(signal);
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: "json",
      addressdetails: "1",
      zoom: "18",
    });
    const data = (await fetchJson(`${NOMINATIM_BASE}/reverse?${params}`, {
      signal: withDefaultTimeout(signal),
      headers: NOMINATIM_HEADERS,
    })) as NominatimReverseResult;
    if (!data || "error" in (data as unknown as Record<string, unknown>)) return null;

    const a = data.address ?? {};
    const parts: string[] = [];
    if (a.house_number && a.road) parts.push(`${a.house_number} ${a.road}`);
    else if (a.road) parts.push(a.road);
    const locality = a.hamlet || a.village || a.suburb || a.neighbourhood;
    if (locality) parts.push(locality);
    const settlement = a.town || a.city;
    if (settlement && settlement !== locality) parts.push(settlement);
    if (a.county) parts.push(a.county);
    if (a.postcode) parts.push(a.postcode);

    const address = parts.filter(Boolean).join(", ") || data.display_name || "";
    return { address, postcode: a.postcode ?? null };
  } catch (error) {
    logFailure("reverseAddress", error);
    return null;
  }
}

/** The area around a point, e.g. "Bankside, London Borough of Southwark" —
 *  for describing a map that covers too much ground for one address. */
export async function reverseLocality(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    await nominatimTurn(signal);
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: "json",
      addressdetails: "1",
      zoom: "14",
    });
    const data = (await fetchJson(`${NOMINATIM_BASE}/reverse?${params}`, {
      signal: withDefaultTimeout(signal),
      headers: NOMINATIM_HEADERS,
    })) as { address?: Record<string, string> };
    const a = data?.address;
    if (!a) return null;
    const place = a.suburb || a.village || a.hamlet || a.neighbourhood || a.town;
    const district = a.city_district || a.borough || a.city || a.town || a.county;
    const parts = [place, district].filter((v, i, all): v is string => Boolean(v) && all.indexOf(v) === i);
    return parts.join(", ") || null;
  } catch (error) {
    logFailure("reverseLocality", error);
    return null;
  }
}

/** The county or region around a point, e.g. "Kent, England" — for sheets
 *  too wide for a town name to describe. */
export async function reverseRegion(lat: number, lng: number, signal?: AbortSignal): Promise<string | null> {
  try {
    await nominatimTurn(signal);
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: "json",
      addressdetails: "1",
      zoom: "8",
    });
    const data = (await fetchJson(`${NOMINATIM_BASE}/reverse?${params}`, {
      signal: withDefaultTimeout(signal),
      headers: NOMINATIM_HEADERS,
    })) as { address?: Record<string, string> };
    const a = data?.address;
    if (!a) return null;
    const region = a.county || a.state_district || a.city || a.region;
    const parts = [region, a.state].filter((v, i, all): v is string => Boolean(v) && all.indexOf(v) === i);
    return parts.join(", ") || null;
  } catch (error) {
    logFailure("reverseRegion", error);
    return null;
  }
}

// ─── Structured address search (site location editor) ───────────────────────

/** Nominatim's usage policy allows at most one request per second. Every
 *  request made through here waits its turn, so fast typing can't breach it
 *  even if a debounce misfires. */
let nextNominatimSlot = 0;
async function nominatimTurn(signal?: AbortSignal): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextNominatimSlot - now);
  nextNominatimSlot = Math.max(now, nextNominatimSlot) + 1000;
  if (wait === 0) return;
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, wait);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

export interface AddressSuggestion extends GeoResult {
  /** Street-level address without the postcode, e.g. "12 High St, Ipswich". */
  address: string;
  postcode: string | null;
}

interface NominatimDetailedResult extends NominatimSearchResult {
  address?: NominatimReverseResult["address"];
}

/** Short, readable address from Nominatim parts — without the postcode, which
 *  the site form keeps in its own field. */
function shortAddress(a: NonNullable<NominatimReverseResult["address"]>, fallback: string): string {
  const parts: string[] = [];
  if (a.house_number && a.road) parts.push(`${a.house_number} ${a.road}`);
  else if (a.road) parts.push(a.road);
  const locality = a.hamlet || a.village || a.suburb || a.neighbourhood;
  if (locality) parts.push(locality);
  const settlement = a.town || a.city;
  if (settlement && settlement !== locality) parts.push(settlement);
  if (a.county && parts.length < 2) parts.push(a.county);
  return parts.join(", ") || fallback;
}

/** Address autocomplete for the site form: GB-only Nominatim search with
 *  structured parts, so the postcode can go in its own field. */
export async function searchAddresses(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  try {
    await nominatimTurn(signal);
    const params = new URLSearchParams({
      q: query,
      countrycodes: "gb",
      limit: "6",
      format: "json",
      addressdetails: "1",
    });
    const data: unknown = await fetchJson(`${NOMINATIM_BASE}/search?${params}`, {
      signal: withDefaultTimeout(signal),
      headers: NOMINATIM_HEADERS,
    });
    if (!isNominatimSearchResults(data)) return [];
    return (data as NominatimDetailedResult[]).map((item) => ({
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      label: item.display_name,
      address: shortAddress(item.address ?? {}, item.display_name),
      postcode: item.address?.postcode ?? null,
    }));
  } catch (error) {
    logFailure("searchAddresses", error);
    return [];
  }
}

/** Reverse lookup for "use the pin's address": same shape as a suggestion. */
export async function addressAt(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<{ address: string; postcode: string | null } | null> {
  try {
    await nominatimTurn(signal);
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: "json",
      addressdetails: "1",
      zoom: "18",
    });
    const data = (await fetchJson(`${NOMINATIM_BASE}/reverse?${params}`, {
      signal: withDefaultTimeout(signal),
      headers: NOMINATIM_HEADERS,
    })) as NominatimReverseResult;
    if (!data || "error" in (data as unknown as Record<string, unknown>)) return null;
    return {
      address: shortAddress(data.address ?? {}, data.display_name ?? ""),
      postcode: data.address?.postcode ?? null,
    };
  } catch (error) {
    logFailure("addressAt", error);
    return null;
  }
}
