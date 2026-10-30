/**
 * Snapping to things drawn outside TerraDraw — sites,
 * surveys, uploaded data — and to sketches of another kind (TerraDraw only snaps a line to other lines and
 * a shape to other shapes; markers and circles it doesn't snap at all). A corner or point within the tolerance
 * wins; otherwise the nearest point on an edge within it.
 */
export type LngLat = [number, number];
export type Segment = [LngLat, LngLat];
export type Project = (lng: number, lat: number) => { x: number; y: number };

export interface SnapIndex {
  points: LngLat[];
  segments: Segment[];
}

export const EMPTY_INDEX: SnapIndex = { points: [], segments: [] };

/** Round to the 9 decimal places the drawing store accepts: a snapped position (an interpolated point on an
 *  edge, or a corner from an uploaded file) can have more, and the store rejects those. */
export function roundCoordinate(c: LngLat): LngLat {
  return [Math.round(c[0] * 1e9) / 1e9, Math.round(c[1] * 1e9) / 1e9];
}

/** Cheap pre-filter: how many degrees `tolPx` pixels is around a place. */
function degreeTolerance(lng: number, lat: number, tolPx: number, project: Project) {
  const p0 = project(lng, lat);
  const px = project(lng + 0.001, lat);
  const py = project(lng, lat + 0.001);
  const perLng = Math.abs(px.x - p0.x) / 0.001 || 1e-9;
  const perLat = Math.abs(py.y - p0.y) / 0.001 || 1e-9;
  return { dLng: (tolPx / perLng) * 1.5, dLat: (tolPx / perLat) * 1.5 };
}

/** The snap position for a cursor at (lng, lat) / screen (x, y), or
 *  undefined when nothing is within `tolPx` pixels. */
export function nearestSnap(
  index: SnapIndex,
  cursor: { lng: number; lat: number; x: number; y: number },
  project: Project,
  tolPx: number,
): LngLat | undefined {
  const { dLng, dLat } = degreeTolerance(cursor.lng, cursor.lat, tolPx, project);
  const near = (c: LngLat) => Math.abs(c[0] - cursor.lng) <= dLng && Math.abs(c[1] - cursor.lat) <= dLat;
  const tol2 = tolPx * tolPx;

  let best: LngLat | undefined;
  let bestD = tol2;
  for (const p of index.points) {
    if (!near(p)) continue;
    const s = project(p[0], p[1]);
    const d = (s.x - cursor.x) ** 2 + (s.y - cursor.y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = p;
    }
  }
  if (best) return best;

  bestD = tol2;
  for (const [a, b] of index.segments) {
    // Skip edges whose box is nowhere near the cursor.
    if (
      Math.min(a[0], b[0]) > cursor.lng + dLng ||
      Math.max(a[0], b[0]) < cursor.lng - dLng ||
      Math.min(a[1], b[1]) > cursor.lat + dLat ||
      Math.max(a[1], b[1]) < cursor.lat - dLat
    ) {
      continue;
    }
    const sa = project(a[0], a[1]);
    const sb = project(b[0], b[1]);
    const vx = sb.x - sa.x;
    const vy = sb.y - sa.y;
    const len2 = vx * vx + vy * vy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((cursor.x - sa.x) * vx + (cursor.y - sa.y) * vy) / len2));
    const d = (sa.x + t * vx - cursor.x) ** 2 + (sa.y + t * vy - cursor.y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    }
  }
  return best;
}

/** A geometry with every coordinate rounded to the store's precision (a file can carry more decimals than it accepts). */
export function roundGeometry<G extends { type: string }>(geometry: G): G {
  const round = (v: unknown): unknown =>
    typeof v === "number" ? Math.round(v * 1e9) / 1e9 : Array.isArray(v) ? v.map(round) : v;
  const g = geometry as unknown as { coordinates?: unknown };
  return g.coordinates === undefined ? geometry : ({ ...geometry, coordinates: round(g.coordinates) } as G);
}

interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

const inside = (c: LngLat, b: Bounds) => c[0] >= b.west && c[0] <= b.east && c[1] >= b.south && c[1] <= b.north;

/** Add a geometry's corners and edges to `index`, keeping only those in
 *  `bounds` (the view plus a margin) so big layers stay fast. */
export function addGeometry(index: SnapIndex, geometry: unknown, bounds: Bounds, limit: number) {
  const g = geometry as { type?: string; coordinates?: unknown; geometries?: unknown[] } | null;
  if (!g?.type) return;
  if (g.type === "GeometryCollection") {
    for (const part of g.geometries ?? []) addGeometry(index, part, bounds, limit);
    return;
  }
  const line = (coords: LngLat[]) => {
    for (let i = 0; i < coords.length; i++) {
      if (index.points.length + index.segments.length >= limit) return;
      const c = coords[i];
      if (inside(c, bounds)) index.points.push(c);
      if (i > 0) {
        const a = coords[i - 1];
        if (inside(a, bounds) || inside(c, bounds)) index.segments.push([a, c]);
      }
    }
  };
  const c = g.coordinates as never;
  switch (g.type) {
    case "Point":
      if (inside(c, bounds)) index.points.push(c);
      break;
    case "MultiPoint":
      for (const p of c as LngLat[]) if (inside(p, bounds)) index.points.push(p);
      break;
    case "LineString":
      line(c);
      break;
    case "MultiLineString":
    case "Polygon":
      for (const ring of c as LngLat[][]) line(ring);
      break;
    case "MultiPolygon":
      for (const poly of c as LngLat[][][]) for (const ring of poly) line(ring);
      break;
  }
}
