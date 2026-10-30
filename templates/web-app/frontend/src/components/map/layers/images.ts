/**
 * Canvas-drawn map images: point-shape icons, hatch patterns and label
 * backgrounds. Pure-ish helpers (canvas → ImageData) extracted from
 * useMapLayers so the hook file holds only the React wiring.
 */

import type { Map as MapLibreMap } from "maplibre-gl";
import type { HatchStyle } from "../utils/hatchPatterns";
import { createHatchPatternImageData } from "../utils/hatchPatterns";
import type { MapDataLayer, PointShape } from "./types";

// ─── Id helpers ──────────────────────────────────────────────────────────────

export function pointIconId(layerId: string) {
  return `datalayer-${layerId}-circle-icon`;
}
export function hatchId(id: string) {
  return `datalayer-${id}-hatch`;
}
export function labelBgImageId(layerId: string) {
  return `lbl-bg-${layerId}`;
}

// Tracks current image id per layer so stale images can be cleaned up.
const _layerHatchImgId = new Map<string, string>();
export const _layerPointImgId = new Map<string, string>();

function computeHatchImageId(layerId: string, pattern: string, color: string, scale: number) {
  return `${hatchId(layerId)}-${pattern}-${color.replace("#", "")}-${scale}`;
}
function computePointImageId(layer: MapDataLayer) {
  const s = layer.style;
  return `${pointIconId(layer.id)}-${s.pointShape}-${(s.pointColor ?? s.fillColor).replace("#", "")}-${s.strokeColor.replace("#", "")}-${s.pointRadius}`;
}

// ─── Point-shape icon rendering ──────────────────────────────────────────────

export function makePointIconData(
  shape: PointShape,
  fillColor: string,
  strokeColor: string,
  radius: number,
): { width: number; height: number; data: Uint8ClampedArray } {
  const size = Math.max(Math.round(radius * 2) + 10, 20);
  const DPR = 2;
  const W = size * DPR;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = W;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(DPR, DPR);
  const half = size / 2;
  const pad = 2.5;

  /** Draw a closed path with white halo + coloured outline over a solid fill */
  function filledSymbol(buildPath: () => void) {
    buildPath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 3.5;
    ctx.stroke();
    buildPath();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  /** Draw open stroked lines (for plus / cross) with halo then colour */
  function strokedLines(buildLines: () => void, lw = 2.5) {
    ctx.lineCap = "round";
    buildLines();
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = lw + 2.5;
    ctx.stroke();
    buildLines();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  if (shape === "circle") {
    filledSymbol(() => {
      ctx.beginPath();
      ctx.arc(half, half, half - pad, 0, Math.PI * 2);
    });
  } else if (shape === "square") {
    const cr = 2;
    filledSymbol(() => {
      const x = pad,
        y = pad,
        w = size - pad * 2,
        h = size - pad * 2;
      ctx.beginPath();
      ctx.moveTo(x + cr, y);
      ctx.lineTo(x + w - cr, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + cr);
      ctx.lineTo(x + w, y + h - cr);
      ctx.quadraticCurveTo(x + w, y + h, x + w - cr, y + h);
      ctx.lineTo(x + cr, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - cr);
      ctx.lineTo(x, y + cr);
      ctx.quadraticCurveTo(x, y, x + cr, y);
      ctx.closePath();
    });
  } else if (shape === "diamond") {
    filledSymbol(() => {
      ctx.beginPath();
      ctx.moveTo(half, pad);
      ctx.lineTo(size - pad, half);
      ctx.lineTo(half, size - pad);
      ctx.lineTo(pad, half);
      ctx.closePath();
    });
  } else if (shape === "triangle") {
    filledSymbol(() => {
      ctx.beginPath();
      ctx.moveTo(half, pad);
      ctx.lineTo(size - pad, size - pad);
      ctx.lineTo(pad, size - pad);
      ctx.closePath();
    });
  } else if (shape === "star") {
    const outerR = half - pad;
    const innerR = outerR * 0.42;
    const pts = 5;
    filledSymbol(() => {
      ctx.beginPath();
      for (let i = 0; i < pts * 2; i++) {
        const a = (i * Math.PI) / pts - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        const x = half + r * Math.cos(a);
        const y = half + r * Math.sin(a);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
    });
  } else if (shape === "pin") {
    // Teardrop / location-pin shape
    const r = (half - pad) * 0.78;
    const cx = half,
      cy = pad + r;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 0.2, false);
    ctx.lineTo(cx, size - pad);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Inner white hole
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.fill();
  } else if (shape === "plus") {
    strokedLines(() => {
      ctx.beginPath();
      ctx.moveTo(half, pad);
      ctx.lineTo(half, size - pad);
      ctx.moveTo(pad, half);
      ctx.lineTo(size - pad, half);
    });
    // Centre dot
    ctx.beginPath();
    ctx.arc(half, half, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
  } else if (shape === "cross") {
    strokedLines(() => {
      ctx.beginPath();
      ctx.moveTo(pad, pad);
      ctx.lineTo(size - pad, size - pad);
      ctx.moveTo(size - pad, pad);
      ctx.lineTo(pad, size - pad);
    });
    ctx.beginPath();
    ctx.arc(half, half, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
  } else if (shape === "target") {
    // Outer ring
    ctx.beginPath();
    ctx.arc(half, half, half - pad, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Inner filled dot with halo
    ctx.beginPath();
    ctx.arc(half, half, (half - pad) * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  const idata = ctx.getImageData(0, 0, W, W);
  return { width: W, height: W, data: idata.data };
}

// ─── Image registration ──────────────────────────────────────────────────────

export function ensurePointIcon(map: MapLibreMap, layer: MapDataLayer): string {
  const s = layer.style;
  const newId = computePointImageId(layer);
  const oldId = _layerPointImgId.get(layer.id);
  if (newId !== oldId) {
    const imgData = makePointIconData(
      s.pointShape ?? "circle",
      s.pointColor ?? s.fillColor,
      s.strokeColor,
      s.pointRadius,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (map as any).addImage(newId, imgData, { pixelRatio: 2 });
    _layerPointImgId.set(layer.id, newId);
    if (oldId && map.hasImage(oldId)) map.removeImage(oldId);
  }
  return newId;
}

export function ensureLayerHatchImage(map: MapLibreMap, layer: MapDataLayer): string {
  const { fillPattern, hatchColor, hatchScale } = layer.style;
  const color = hatchColor ?? "#ffffff";
  const scale = hatchScale ?? 1;
  const newId = computeHatchImageId(layer.id, fillPattern, color, scale);
  const oldId = _layerHatchImgId.get(layer.id);
  if (newId !== oldId) {
    const img = createHatchPatternImageData(fillPattern as HatchStyle, color, scale);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (map as any).addImage(newId, img, { pixelRatio: 2 });
    _layerHatchImgId.set(layer.id, newId);
    if (oldId && map.hasImage(oldId)) map.removeImage(oldId);
  }
  return newId;
}

export function ensureLabelBgImage(
  map: MapLibreMap,
  colorStr: string,
  opacity: number,
  layerId: string,
) {
  const SIZE = 64;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  ctx.fillStyle = colorStr;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const raw = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const data = new Uint8Array(raw.buffer);
  const imgId = labelBgImageId(layerId);
  if (map.hasImage(imgId)) map.removeImage(imgId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (map as any).addImage(imgId, { width: SIZE, height: SIZE, data }, { pixelRatio: 1 });
}

/** Remove any registered point/hatch images for a layer (used on removal). */
export function forgetLayerImages(map: MapLibreMap, id: string) {
  const hatchImg = _layerHatchImgId.get(id);
  if (hatchImg && map.hasImage(hatchImg)) map.removeImage(hatchImg);
  _layerHatchImgId.delete(id);
  const pointImg = _layerPointImgId.get(id);
  if (pointImg && map.hasImage(pointImg)) map.removeImage(pointImg);
  _layerPointImgId.delete(id);
  if (map.hasImage(labelBgImageId(id))) map.removeImage(labelBgImageId(id));
}

/** Drop a stored hatch image id (when a hatch layer is removed by style). */
export function forgetHatchImage(map: MapLibreMap, id: string) {
  const oldImg = _layerHatchImgId.get(id);
  if (oldImg && map.hasImage(oldImg)) map.removeImage(oldImg);
  _layerHatchImgId.delete(id);
}
