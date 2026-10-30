/**
 * Coordinate utilities — BNG conversion, parsing, formatting.
 * Ported from the reference template's coordinates.ts.
 */

import proj4 from "proj4";

// Register British National Grid projection
proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 " +
    "+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs",
);

/** Convert WGS84 lat/lng to British National Grid easting/northing. Returns null for coords outside Great Britain. */
export function latLngToEN(
  lat: number,
  lng: number,
): { e: number; n: number } | null {
  try {
    const [e, n] = proj4("EPSG:4326", "EPSG:27700", [lng, lat]);
    if (!isFinite(e) || !isFinite(n)) return null;
    if (e < 0 || e > 800000 || n < 0 || n > 1400000) return null;
    return { e, n };
  } catch {
    return null;
  }
}

/** Convert British National Grid easting/northing to WGS84 lat/lng. */
export function enToLatLng(e: number, n: number): { lat: number; lng: number } | null {
  try {
    const [lng, lat] = proj4("EPSG:27700", "EPSG:4326", [e, n]);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/** OS National Grid reference, e.g. 530123, 180456 → "TQ 30123 80456"
 *  (`digits` is the total figure count: 10 = 1 m, 8 = 10 m, 6 = 100 m).
 *  Null outside the grid's 100 km squares. */
export function osGridRef(e: number, n: number, digits: 6 | 8 | 10 = 10): string | null {
  const e100k = Math.floor(e / 100000);
  const n100k = Math.floor(n / 100000);
  if (e100k < 0 || e100k > 6 || n100k < 0 || n100k > 12) return null;
  // Two letters from a 5×5 grid of 500 km and 100 km squares, skipping I.
  let l1 = 19 - n100k - ((19 - n100k) % 5) + Math.floor((e100k + 10) / 5);
  let l2 = (((19 - n100k) * 5) % 25) + (e100k % 5);
  if (l1 > 7) l1 += 1;
  if (l2 > 7) l2 += 1;
  const letters = String.fromCharCode(65 + l1) + String.fromCharCode(65 + l2);
  const half = digits / 2;
  const fig = (v: number) =>
    String(Math.floor((v % 100000) / 10 ** (5 - half))).padStart(half, "0");
  return `${letters} ${fig(e)} ${fig(n)}`;
}

/** Format easting/northing as a display string: whole metres, no
 *  thousands separators, e.g. "625597, 245940". */
export function formatEN(e: number, n: number): string {
  return `${Math.round(e)}, ${Math.round(n)}`;
}

/** A position written the chosen way; BNG formats fall back to lat/long
 *  outside Great Britain. */
export function formatCoordinate(lng: number, lat: number, format: "bng" | "gridref" | "latlng"): string {
  if (format !== "latlng") {
    const en = latLngToEN(lat, lng);
    if (en) {
      if (format === "bng") return formatEN(en.e, en.n);
      const ref = osGridRef(en.e, en.n);
      if (ref) return ref;
    }
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/**
 * Try to parse a search query as lat/lng.
 * Accepts "lat, lng", "lat lng" and hemisphere forms like "52.84N 2.27W" or
 * "N52.84 W2.27" (letters only as a prefix/suffix of each number — a stray
 * letter elsewhere means it isn't a coordinate). Values are read as lat then
 * lng; they're swapped only when that's unambiguous (the first can't be a
 * latitude but the second can), or when hemisphere letters say so.
 */
export function parseLatLng(input: string): { lat: number; lng: number } | null {
  const parts = input.trim().replace(/°/g, "").split(/\s*,\s*|\s+/).filter(Boolean);
  if (parts.length !== 2) return null;
  const token = /^([NSEW])?\s*(-?\d+(?:\.\d+)?)\s*([NSEW])?$/i;
  const parsed = parts.map((p) => {
    const m = token.exec(p);
    if (!m || (m[1] && m[3])) return null;
    const hemi = (m[1] || m[3] || "").toUpperCase();
    let value = parseFloat(m[2]);
    if (hemi === "S" || hemi === "W") value = -Math.abs(value);
    return { value, hemi };
  });
  if (!parsed[0] || !parsed[1]) return null;
  let [a, b] = parsed as { value: number; hemi: string }[];
  // "2.27W 52.84N": hemisphere letters put longitude first.
  if ("EW".includes(a.hemi) && a.hemi && "NS".includes(b.hemi) && b.hemi) [a, b] = [b, a];
  else if (Math.abs(a.value) > 90 && Math.abs(b.value) <= 90) [a, b] = [b, a];
  if (Math.abs(a.value) > 90 || Math.abs(b.value) > 180) return null;
  return { lat: a.value, lng: b.value };
}

/**
 * Try to parse a search query as BNG easting/northing.
 * Matches "EEEEE NNNNN" or "EEEEE, NNNNN" where both are 3–7 digits.
 */
export function parseEN(input: string): { lat: number; lng: number } | null {
  const s = input.trim();
  const parts = s.split(/[\s,]+/).filter(Boolean);
  if (parts.length !== 2) return null;
  if (!/^\d{3,7}$/.test(parts[0]) || !/^\d{3,7}$/.test(parts[1])) return null;
  const e = parseInt(parts[0], 10);
  const n = parseInt(parts[1], 10);
  if (e < 0 || e > 800000 || n < 0 || n > 1400000) return null;
  return enToLatLng(e, n);
}

/** Returns true if the input looks like a UK postcode. */
export function isPostcodeLike(value: string): boolean {
  return /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(value.trim());
}

/** Haversine distance in metres between two [lng, lat] points. */
export function distanceMeters(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6378137;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Signed polygon area in m² using spherical excess formula. */
export function polygonAreaMeters2(coords: [number, number][][]): number {
  const ring: [number, number][] = Array.isArray(coords?.[0])
    ? coords[0]
    : (coords as unknown as [number, number][]);
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  const R = 6378137;
  const toRad = (d: number) => (d * Math.PI) / 180;
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const p1 = ring[i];
    const p2 = ring[(i + 1) % ring.length];
    const lon1 = toRad(p1[0]);
    const lon2 = toRad(p2[0]);
    const lat1 = toRad(p1[1]);
    const lat2 = toRad(p2[1]);
    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs((area * R * R) / 2);
}

/** Format metres as human-readable distance. */
export function formatDistance(meters: number): string {
  const m = Number(meters) || 0;
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}

/** Format square metres as human-readable area (km²/ha/m²). */
export function formatArea(m2: number): string {
  const a = Number(m2) || 0;
  if (a >= 1_000_000) return `${(a / 1_000_000).toFixed(2)} km²`;
  if (a >= 10_000) return `${(a / 10_000).toFixed(2)} ha`;
  return `${Math.round(a)} m²`;
}
