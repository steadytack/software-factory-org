/**
 * MapLibre layer engine for data overlays: build the source + fill/hatch/line/
 * point/label layers, remove them, and apply style/visibility updates. Extracted
 * from useMapLayers so the hook holds only React state wiring (hardening STR-1).
 * Behaviour is unchanged — this is a pure code move.
 */

import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import { Protocol } from "pmtiles";
import type { MapDataLayer } from "./types";
import {
  ensureLabelBgImage,
  ensureLayerHatchImage,
  ensurePointIcon,
  forgetHatchImage,
  forgetLayerImages,
  labelBgImageId,
} from "./images";
import { LABEL_BG, LABEL_HALO, TRANSPARENT } from "./colors";

// ─── Id helpers ──────────────────────────────────────────────────────────────

export function srcId(id: string) {
  return `datalayer-${id}`;
}
export function fillId(id: string) {
  return `datalayer-${id}-fill`;
}
export function lineId(id: string) {
  return `datalayer-${id}-line`;
}
export function circleId(id: string) {
  return `datalayer-${id}-circle`;
}
export function labelId(id: string) {
  return `datalayer-${id}-label`;
}
export function rasterId(id: string) {
  return `datalayer-${id}-raster`;
}
export function hatchId(id: string) {
  return `datalayer-${id}-hatch`;
}

const DASH_ARRAYS: Record<string, number[]> = {
  dashed: [4, 4],
  dotted: [0.5, 3],
  longdash: [8, 4],
  shortdash: [2, 4],
};

// ─── PMTiles protocol ────────────────────────────────────────────────────────

let pmtilesProtocolRegistered = false;
function ensurePMTilesProtocol() {
  if (pmtilesProtocolRegistered) return;
  try {
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile.bind(protocol));
    pmtilesProtocolRegistered = true;
  } catch {
    // already registered or not available
  }
}

// ─── Add / remove ────────────────────────────────────────────────────────────

export function addToMap(map: MapLibreMap, layer: MapDataLayer) {
  const sid = srcId(layer.id);
  if (map.getSource(sid)) return; // already added

  if (layer.type === "wms" && layer.url) {
    map.addSource(sid, { type: "raster", tiles: [layer.url], tileSize: 256 });
    map.addLayer({
      id: rasterId(layer.id),
      type: "raster",
      source: sid,
      paint: { "raster-opacity": layer.style.fillOpacity },
      layout: { visibility: layer.visible ? "visible" : "none" },
    });
    return;
  }

  if (layer.type === "geojson" && layer.data) {
    map.addSource(sid, { type: "geojson", data: layer.data });
  } else if (layer.type === "pmtiles" && layer.url) {
    ensurePMTilesProtocol();
    const pmUrl = layer.url.startsWith("pmtiles://") ? layer.url : `pmtiles://${layer.url}`;
    map.addSource(sid, { type: "vector", url: pmUrl });
  } else {
    return;
  }

  const s = layer.style;
  const vis = layer.visible ? "visible" : "none";
  const pmOpts = layer.type === "pmtiles" ? { "source-layer": "default" as string } : {};
  const da = DASH_ARRAYS[s.lineStyle];

  // Fill — polygons
  map.addLayer({
    id: fillId(layer.id),
    type: "fill",
    source: sid,
    ...pmOpts,
    filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
    paint: { "fill-color": s.fillColor, "fill-opacity": s.fillOpacity },
    layout: { visibility: vis },
  });

  // Hatch overlay — when fillPattern is set
  if (s.fillPattern !== "none") {
    map.addLayer({
      id: hatchId(layer.id),
      type: "fill",
      source: sid,
      ...pmOpts,
      filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
      paint: { "fill-pattern": ensureLayerHatchImage(map, layer) },
      layout: { visibility: vis },
    });
  }

  // Line — polylines + polygon outlines
  map.addLayer({
    id: lineId(layer.id),
    type: "line",
    source: sid,
    ...pmOpts,
    filter: [
      "in",
      ["geometry-type"],
      ["literal", ["LineString", "MultiLineString", "Polygon", "MultiPolygon"]],
    ],
    paint: {
      "line-color": s.strokeColor,
      "line-width": s.strokeWidth,
      ...(da ? { "line-dasharray": da } : {}),
    },
    layout: { visibility: vis },
  });

  // Point icon — all shapes via symbol layer
  const pointImgId = ensurePointIcon(map, layer);
  map.addLayer({
    id: circleId(layer.id),
    type: "symbol",
    source: sid,
    ...pmOpts,
    filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
    layout: {
      "icon-image": pointImgId,
      "icon-allow-overlap": true,
      "icon-anchor": "center",
      visibility: vis,
    },
    paint: {
      "icon-opacity": Math.min(s.fillOpacity + 0.3, 1),
    },
  });

  // Label — if labelField is set
  if (s.labelField) {
    const useBox = s.labelBackground;
    const haloColor = !useBox && s.labelHalo ? LABEL_HALO : TRANSPARENT;
    const haloWidth = !useBox && s.labelHalo ? 2 : 0;
    const bgColor = s.labelBackgroundColor ?? LABEL_BG;
    const bgOpacity = s.labelBackgroundOpacity ?? 0.7;
    if (useBox) ensureLabelBgImage(map, bgColor, bgOpacity, layer.id);
    map.addLayer({
      id: labelId(layer.id),
      type: "symbol",
      source: sid,
      ...pmOpts,
      layout: {
        "text-field": ["coalesce", ["get", s.labelField], ""],
        "text-size": s.labelSize,
        "text-anchor": "top",
        "text-offset": [0, 0.9],
        "text-allow-overlap": false,
        ...(useBox
          ? {
              "icon-image": labelBgImageId(layer.id),
              "icon-text-fit": "both" as const,
              "icon-text-fit-padding": [3, 6, 3, 6] as [number, number, number, number],
              "icon-allow-overlap": true,
            }
          : {}),
        visibility: vis,
      },
      paint: {
        "text-color": s.labelColor,
        "text-halo-color": haloColor,
        "text-halo-width": haloWidth,
      },
    });
  }
}

export function removeFromMap(map: MapLibreMap, id: string) {
  [fillId(id), hatchId(id), lineId(id), circleId(id), labelId(id), rasterId(id)].forEach((lid) => {
    if (map.getLayer(lid)) map.removeLayer(lid);
  });
  if (map.getSource(srcId(id))) map.removeSource(srcId(id));
  forgetLayerImages(map, id);
}

export function applyPaint(map: MapLibreMap, layer: MapDataLayer) {
  const s = layer.style;
  if (layer.type === "wms") {
    if (map.getLayer(rasterId(layer.id))) {
      map.setPaintProperty(rasterId(layer.id), "raster-opacity", s.fillOpacity);
    }
    return;
  }
  if (map.getLayer(fillId(layer.id))) {
    map.setPaintProperty(fillId(layer.id), "fill-color", s.fillColor);
    map.setPaintProperty(fillId(layer.id), "fill-opacity", s.fillOpacity);
  }

  // Hatch: add, remove or update based on fillPattern
  const hasHatch = !!map.getLayer(hatchId(layer.id));
  if (s.fillPattern !== "none") {
    const imgId = ensureLayerHatchImage(map, layer);
    if (hasHatch) {
      map.setPaintProperty(hatchId(layer.id), "fill-pattern", imgId);
    } else {
      const sid = srcId(layer.id);
      const pmOpts = layer.type === "pmtiles" ? { "source-layer": "default" as string } : {};
      map.addLayer(
        {
          id: hatchId(layer.id),
          type: "fill",
          source: sid,
          ...pmOpts,
          filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
          paint: { "fill-pattern": imgId },
          layout: { visibility: layer.visible ? "visible" : "none" },
        },
        lineId(layer.id),
      );
    }
  } else if (hasHatch) {
    map.removeLayer(hatchId(layer.id));
    forgetHatchImage(map, layer.id);
  }

  if (map.getLayer(lineId(layer.id))) {
    map.setPaintProperty(lineId(layer.id), "line-color", s.strokeColor);
    map.setPaintProperty(lineId(layer.id), "line-width", s.strokeWidth);
    const da = DASH_ARRAYS[s.lineStyle];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.setPaintProperty(lineId(layer.id), "line-dasharray", (da as any) ?? undefined);
  }
  if (map.getLayer(circleId(layer.id))) {
    const newPointImgId = ensurePointIcon(map, layer);
    map.setLayoutProperty(circleId(layer.id), "icon-image", newPointImgId);
    map.setPaintProperty(circleId(layer.id), "icon-opacity", Math.min(s.fillOpacity + 0.3, 1));
  }
  if (map.getLayer(labelId(layer.id))) {
    if (s.labelField) {
      const useBox = s.labelBackground;
      const haloColor = !useBox && s.labelHalo ? LABEL_HALO : TRANSPARENT;
      const haloWidth = !useBox && s.labelHalo ? 2 : 0;
      const bgColor = s.labelBackgroundColor ?? LABEL_BG;
      const bgOpacity = s.labelBackgroundOpacity ?? 0.7;
      map.setLayoutProperty(labelId(layer.id), "text-field", ["get", s.labelField]);
      map.setLayoutProperty(labelId(layer.id), "text-size", s.labelSize);
      map.setPaintProperty(labelId(layer.id), "text-color", s.labelColor);
      map.setPaintProperty(labelId(layer.id), "text-halo-color", haloColor);
      map.setPaintProperty(labelId(layer.id), "text-halo-width", haloWidth);
      if (useBox) {
        ensureLabelBgImage(map, bgColor, bgOpacity, layer.id);
        map.setLayoutProperty(labelId(layer.id), "icon-image", labelBgImageId(layer.id));
        map.setLayoutProperty(labelId(layer.id), "icon-text-fit", "both");
        map.setLayoutProperty(labelId(layer.id), "icon-text-fit-padding", [3, 6, 3, 6]);
        map.setLayoutProperty(labelId(layer.id), "icon-allow-overlap", true);
      } else {
        if (map.hasImage(labelBgImageId(layer.id))) map.removeImage(labelBgImageId(layer.id));
        map.setLayoutProperty(labelId(layer.id), "icon-image", "");
      }
    } else {
      map.setLayoutProperty(labelId(layer.id), "text-field", "");
    }
  }
}

export function applyVisibility(map: MapLibreMap, layer: MapDataLayer) {
  const vis = layer.visible ? "visible" : "none";
  [
    fillId(layer.id),
    hatchId(layer.id),
    lineId(layer.id),
    circleId(layer.id),
    labelId(layer.id),
    rasterId(layer.id),
  ].forEach((lid) => {
    if (map.getLayer(lid)) map.setLayoutProperty(lid, "visibility", vis);
  });
}

/** Build (or rebuild) just the label symbol layer for a layer's current style. */
export function rebuildLabelLayer(map: MapLibreMap, layer: MapDataLayer) {
  if (map.getLayer(labelId(layer.id))) map.removeLayer(labelId(layer.id));
  const field = layer.style.labelField;
  if (!field) return;
  const st = layer.style;
  const sid = srcId(layer.id);
  const pmOpts = layer.type === "pmtiles" ? { "source-layer": "default" as string } : {};
  const useBox = st.labelBackground;
  const haloColor = !useBox && st.labelHalo ? LABEL_HALO : TRANSPARENT;
  const haloWidth = !useBox && st.labelHalo ? 2 : 0;
  const bgColor = st.labelBackgroundColor ?? LABEL_BG;
  const bgOpacity = st.labelBackgroundOpacity ?? 0.7;
  if (useBox) ensureLabelBgImage(map, bgColor, bgOpacity, layer.id);
  map.addLayer({
    id: labelId(layer.id),
    type: "symbol",
    source: sid,
    ...pmOpts,
    layout: {
      "text-field": ["get", field],
      "text-size": st.labelSize,
      "text-anchor": "top",
      "text-offset": [0, 0.9],
      "text-allow-overlap": false,
      ...(useBox
        ? {
            "icon-image": labelBgImageId(layer.id),
            "icon-text-fit": "both" as const,
            "icon-text-fit-padding": [3, 6, 3, 6] as [number, number, number, number],
            "icon-allow-overlap": true,
          }
        : {}),
      visibility: layer.visible ? "visible" : "none",
    },
    paint: {
      "text-color": st.labelColor,
      "text-halo-color": haloColor,
      "text-halo-width": haloWidth,
    },
  });
}

/** Update a layer's GeoJSON source data in place (used by attribute filters). */
export function setLayerSourceData(map: MapLibreMap, id: string, data: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const src = map.getSource(srcId(id)) as any;
  if (src?.setData) src.setData(data);
}