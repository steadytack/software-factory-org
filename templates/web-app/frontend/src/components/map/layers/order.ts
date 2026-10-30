/**
 * Logical layer order for the map: each entry groups every MapLibre layer
 * that belongs to one thing the user sees in the Layers tab (a data layer's
 * fill/line/point/label layers, the sites circle + labels, all sketch and
 * measurement layers). `applyLayerOrder` restacks them with `moveLayer`.
 */
import type { Map as MapLibreMap } from "maplibre-gl";
import { circleId, fillId, hatchId, labelId, lineId, rasterId } from "./engine";
import { POINT_LAYER_KEYS, pointLayerIds, type PointLayerKey } from "./pointLayers";
import { SKETCH_LAYER_IDS } from "../draw/overlay";

export type LayerKey = "sketches" | PointLayerKey | `data:${string}`;

export const isPointKey = (k: LayerKey): k is PointLayerKey => (POINT_LAYER_KEYS as string[]).includes(k);

export const dataKey = (id: string): LayerKey => `data:${id}`;
export const isDataKey = (k: LayerKey): k is `data:${string}` => k.startsWith("data:");

function mapLayerIds(key: LayerKey): string[] {
  if (key === "sketches") return SKETCH_LAYER_IDS;
  if (isPointKey(key)) return pointLayerIds(key);
  const id = key.slice(5);
  // Bottom-to-top within a data layer.
  return [rasterId(id), fillId(id), hatchId(id), lineId(id), circleId(id), labelId(id)];
}

/** Restack so `order[0]` is on top. Base-map layers stay underneath. */
export function applyLayerOrder(map: MapLibreMap, order: LayerKey[]) {
  // Walk bottom → top, moving each group's layers to the top of the stack.
  for (let i = order.length - 1; i >= 0; i--) {
    for (const id of mapLayerIds(order[i])) {
      if (map.getLayer(id)) map.moveLayer(id);
    }
  }
}

/** Where each of our own layers goes when it isn't in a saved order yet:
 *  the survey ring sits under the site dot it circles. */
const DEFAULT_ORDER: LayerKey[] = ["sketches", "sites", "surveys"];

/** Keep `order` in step with the layers that exist: drop removed data
 *  layers, put any missing built-in layer in its default place, and insert
 *  new data layers just below Sites (i.e. on top of older data). */
export function reconcileOrder(order: LayerKey[], dataIds: string[]): LayerKey[] {
  const wanted = new Set<LayerKey>([...DEFAULT_ORDER, ...dataIds.map(dataKey)]);
  const next = order.filter((k) => wanted.has(k));
  DEFAULT_ORDER.forEach((k, i) => {
    if (next.includes(k)) return;
    // After the nearest built-in layer that comes before it by default.
    const before = DEFAULT_ORDER.slice(0, i).reverse().find((b) => next.includes(b));
    next.splice(before ? next.indexOf(before) + 1 : 0, 0, k);
  });
  for (const id of [...dataIds].reverse()) {
    const k = dataKey(id);
    if (!next.includes(k)) next.splice(next.indexOf("sites") + 1, 0, k);
  }
  return next;
}
