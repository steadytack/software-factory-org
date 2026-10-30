/**
 * Print-ready map export (PNG / PDF), laid out map-first as on OS, Esri and
 * QGIS sheets:
 *
 *   Landscape                                Portrait
 *   ┌──────────────────────────┬────────┐    ┌──────────────────────┐
 *   │ grid labels inside   [N] │ title  │    │ [locator]        [N] │
 *   │                          │ place  │    │                      │
 *   │            map           │locator │    │         map          │
 *   │                          │ legend │    │                      │
 *   │ [scale bar]              │ block  │    │ [scale bar]          │
 *   └──────────────────────────┴────────┘    ├───────┬──────┬───────┤
 *                                            │ title │legend│ block │
 *                                            └───────┴──────┴───────┘
 *
 * The map fills ~70% of the sheet (it was ~56% with header and footer
 * bands and a grid gutter). North arrow and scale bar sit inside the map's
 * corners; grid labels sit inside the neat line on white knock-outs.
 *
 * The map is rendered by an off-screen clone of the live map at the frame's
 * exact pixel size, so the on-screen view is never disturbed and a fixed
 * scale (1:1,250 …) is honoured precisely. Every piece of text goes through
 * a Painter: drawn onto the canvas for PNG and previews, or kept as real
 * text in the PDF (crisp, searchable, copyable).
 */
import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from "maplibre-gl";
import { formatEN, latLngToEN, osGridRef } from "./coordinates";
import { BRAND as APP_BRAND } from "../../../lib/brand";
import { BRAND_BLUE, INK as INK_COLOUR, INK_MUTED, RULE_GREY, STATUS_DANGER } from "../layers/colors";

export type PaperSize = "a4" | "a3";
export type Orientation = "portrait" | "landscape";
export type PrintFormat = "pdf" | "png";
export type SheetStatus = "Draft" | "For information" | "Issued";

export interface LegendItem {
  label: string;
  kind: "point" | "line" | "fill";
  color: string;
  strokeColor?: string;
  /** How many are on the sheet, when that's meaningful. */
  count?: number;
  /** A map service's own legend picture: fetched when the sheet is made (`loadLegendImages`), and drawn instead of a swatch. */
  legendUrl?: string;
  image?: ImageBitmap;
}

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface PrintOptions {
  format: PrintFormat;
  paper: PaperSize;
  orientation: Orientation;
  title: string;
  subtitle: string;
  author: string;
  /** Scale denominator (1250 → 1:1,250); null = fit the current view. */
  scale: number | null;
  showGrid: boolean;
  showLegend: boolean;
  showNorthArrow: boolean;
  showScaleBar: boolean;
  showLocator: boolean;
  drawingNo: string;
  revision: string;
  status: SheetStatus;
  notes: string;
  /** Typed address; blank = described from the map (see describeLocation). */
  address: string;
  /** Legend for what's actually inside the printed area. */
  legendFor: (bounds: Bounds) => LegendItem[];
  /** Words for where the sheet is, sized to the area it covers. */
  describeLocation?: (
    centre: { lat: number; lng: number },
    widthMetres: number,
    bounds?: Bounds,
  ) => Promise<string | null>;
  attribution: string;
  /** Extra copyright line, e.g. OS Crown copyright when OS maps are used. */
  copyright?: string;
  /** Output resolution. */
  dpi: number;
  /** Called when the base map did not finish loading in time, so parts of the sheet may be blank. */
  onIncomplete?: () => void;
}

const PAPER_MM: Record<PaperSize, [number, number]> = { a4: [210, 297], a3: [297, 420] };
const MARGIN = 7; // mm — inside every printer's unprintable edge
const GAP = 4; // mm between map and panel
const INK = INK_COLOUR;
const MUTED = INK_MUTED;
const BRAND = BRAND_BLUE;
const GRID = `${BRAND_BLUE}73`; // brand blue at 45%
const RULE = RULE_GREY;

const EARTH_CIRC = 40075016.686;

// ─── Layout ──────────────────────────────────────────────────────────────────

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SheetLayout {
  page: { w: number; h: number };
  map: Rect;
  panel: Rect;
  /** Landscape: a strip to the right. Portrait: a band along the bottom. */
  panelSide: "right" | "bottom";
}

/** Where the map and the information panel go, in mm. */
export function sheetLayout(paper: PaperSize, orientation: Orientation): SheetLayout {
  const [pw, ph] = orientation === "portrait" ? PAPER_MM[paper] : [...PAPER_MM[paper]].reverse();
  if (orientation === "landscape") {
    const panelW = paper === "a3" ? 82 : 62;
    return {
      page: { w: pw, h: ph },
      map: { x: MARGIN, y: MARGIN, w: pw - 2 * MARGIN - panelW - GAP, h: ph - 2 * MARGIN },
      panel: { x: pw - MARGIN - panelW, y: MARGIN, w: panelW, h: ph - 2 * MARGIN },
      panelSide: "right",
    };
  }
  const bandH = paper === "a3" ? 62 : 50;
  return {
    page: { w: pw, h: ph },
    map: { x: MARGIN, y: MARGIN, w: pw - 2 * MARGIN, h: ph - 2 * MARGIN - bandH - GAP },
    panel: { x: MARGIN, y: ph - MARGIN - bandH, w: pw - 2 * MARGIN, h: bandH },
    panelSide: "bottom",
  };
}

/** Share of the sheet the map covers (0–1). */
export function mapShare(layout: SheetLayout): number {
  return (layout.map.w * layout.map.h) / (layout.page.w * layout.page.h);
}

/** Highest resolution up to `wanted` that keeps the map image within what
 *  phones' WebGL can render (4096 px a side). */
export function safeDpi(layout: SheetLayout, wanted: number, maxPx = 4000): number {
  const longest = Math.max(layout.map.w, layout.map.h) / 25.4;
  return Math.max(72, Math.min(wanted, Math.floor(maxPx / longest)));
}

/** File name for a sheet: "north-pier-site-plan-2026-09-27". */
export function sheetFileName(title: string, date = new Date()): string {
  const slug = (title || "map").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "map";
  return `${slug}-${date.toISOString().slice(0, 10)}`;
}

// ─── Text: canvas or PDF ─────────────────────────────────────────────────────

export interface TextOpts {
  /** Em size in mm. */
  size: number;
  bold?: boolean;
  color?: string;
  align?: "left" | "center" | "right";
  baseline?: "top" | "middle" | "alphabetic" | "bottom";
}

export interface TextOp extends TextOpts {
  text: string;
  x: number;
  y: number;
}

interface Painter {
  text(text: string, x: number, y: number, o: TextOpts): void;
  /** Width in mm. */
  width(text: string, o: TextOpts): number;
}

function canvasPainter(ctx: CanvasRenderingContext2D, px: (mm: number) => number): Painter {
  const font = (o: TextOpts) => `${o.bold ? 650 : 400} ${px(o.size)}px Inter, Arial, sans-serif`;
  return {
    text(text, x, y, o) {
      ctx.save();
      ctx.font = font(o);
      ctx.fillStyle = o.color ?? INK;
      ctx.textAlign = o.align ?? "left";
      ctx.textBaseline = o.baseline ?? "top";
      ctx.fillText(text, px(x), px(y));
      ctx.restore();
    },
    width(text, o) {
      ctx.save();
      ctx.font = font(o);
      const w = ctx.measureText(text).width;
      ctx.restore();
      return (w / px(100)) * 100;
    },
  };
}

/** What the PDF's built-in fonts (Helvetica, WinAnsi) can write. Anything else (Welsh ŵ and ŷ, other scripts, symbols) would
 *  come out garbled, so it is drawn into the sheet image instead. */
// WinAnsi beyond Latin-1: dashes, curly quotes, bullet, ellipsis, euro and a few others.
const WIN_ANSI_EXTRA = new Set([
  0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a,
  0x20ac, 0x2122, 0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e, 0x0192, 0x02c6, 0x02dc,
]);
export function isPdfSafe(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (!((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(c))) return false;
  }
  return true;
}

/** Keeps text for the PDF to write (real, selectable text); measures with Helvetica, the PDF's font. Text the PDF font
 *  can't write goes to `fallback`, which draws it on the image. */
function recordingPainter(ops: TextOp[], fallback?: Painter): Painter {
  const measure = document.createElement("canvas").getContext("2d")!;
  return {
    text(text, x, y, o) {
      if (fallback && !isPdfSafe(text)) fallback.text(text, x, y, o);
      else ops.push({ text, x, y, ...o });
    },
    width(text, o) {
      measure.font = `${o.bold ? "bold" : "normal"} 100px Helvetica, Arial, sans-serif`;
      return (measure.measureText(text).width / 100) * o.size;
    },
  };
}

function wrap(p: Painter, text: string, maxW: number, o: TextOpts): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (p.width(next, o) > maxW && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Writes up to `max` wrapped lines; returns the y below them. */
function paragraph(p: Painter, text: string, x: number, y: number, w: number, o: TextOpts, max = 3, lead = 1.3): number {
  const lines = wrap(p, text, w, o);
  const shown = lines.slice(0, max);
  if (lines.length > max) shown[max - 1] = `${shown[max - 1].replace(/\s+\S*$/, "")}…`;
  shown.forEach((line, i) => p.text(line, x, y + i * o.size * lead, o));
  return y + shown.length * o.size * lead;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Metres per CSS pixel at a zoom/latitude (MapLibre's 512px tiles). */
function metresPerPixel(zoom: number, lat: number) {
  return (EARTH_CIRC * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

const fmtInt = (n: number) => new Intl.NumberFormat("en-GB").format(Math.round(n));

/** Round a computed scale to something that reads well on a sheet. */
function niceScale(denom: number) {
  const mag = 10 ** Math.floor(Math.log10(denom));
  const step = mag / 4;
  return Math.max(1, Math.round(denom / step) * step);
}

/** The credits under the title block: the extra copyright line and the map's attribution, without saying the same thing
 *  twice (an OS map's attribution already is the Crown copyright line). */
export function creditLine(copyright: string | undefined, attribution: string): string {
  const same = copyright && attribution && /ordnance survey/i.test(copyright) && /ordnance survey/i.test(attribution);
  return [copyright, same ? "" : attribution].filter(Boolean).join(" · ");
}

function stripHtml(raw: string) {
  const el = document.createElement("div");
  el.innerHTML = raw;
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${BRAND}"/><path d="M5 22.5c3.5-2.6 7-2.6 10.5 0s7 2.6 11.5-.8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M5 27c3.5-2 7-2 10.5 0s7 2 11.5-.6" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round"/><path d="M16 4.5a5.2 5.2 0 0 0-5.2 5.2c0 3.8 5.2 8.8 5.2 8.8s5.2-5 5.2-8.8A5.2 5.2 0 0 0 16 4.5z" fill="#fff"/><circle cx="16" cy="9.7" r="1.9" fill="${BRAND}"/></svg>`;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ─── Off-screen map render ───────────────────────────────────────────────────

interface RenderedMap {
  canvas: HTMLCanvasElement;
  /** Frame pixel → lng/lat (for the grid). */
  unproject: (x: number, y: number) => { lng: number; lat: number };
  scale: number;
  zoom: number;
  bounds: Bounds;
  /** `mark` points projected into this image (the locator's box). */
  marked: { x: number; y: number }[];
}

async function renderMapImage(
  source: MapLibreMap,
  widthPx: number,
  heightPx: number,
  dpi: number,
  scale: number | null,
  opts: { zoom?: number; mark?: { lng: number; lat: number }[]; baseOnly?: boolean; onIncomplete?: () => void } = {},
): Promise<RenderedMap> {
  // Draw at the screen's pixel size and let the pixel ratio make it sharp: a marker, a line or a label is then the
  // size it is on screen (a 12 px marker is 3 mm at any resolution), instead of shrinking as the resolution rises
  // (at 300 dpi, a CSS pixel is a third of what it is on screen).
  const ratio = dpi / 96;
  const cssW = widthPx / ratio;
  const cssH = heightPx / ratio;
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${cssW}px;height:${cssH}px;pointer-events:none;`;
  document.body.appendChild(host);

  const center = source.getCenter();
  const mmPerPx = 25.4 / dpi;
  let zoom: number;
  if (opts.zoom != null) {
    zoom = opts.zoom;
  } else if (scale) {
    // ground metres per output pixel = scale × paper metres per pixel; a CSS pixel is `ratio` output pixels
    zoom = Math.log2((EARTH_CIRC * Math.cos((center.lat * Math.PI) / 180)) / (512 * ((scale * mmPerPx) / 1000) * ratio));
  } else {
    // Fit the currently visible area into the frame.
    const b = source.getBounds();
    const cam = source.cameraForBounds(b, { padding: 0 });
    // cameraForBounds works in the source's CSS pixels; adjust for the frame's size.
    const srcW = source.getContainer().clientWidth || cssW;
    zoom = (cam?.zoom ?? source.getZoom()) + Math.log2(cssW / srcW);
  }

  // Raster tiles (the base map, web map services) are pictures made for the screen: ask for the next, sharper zoom so
  // they are not stretched to several times their size on paper. Symbols and labels stay the screen size.
  const sourceStyle = source.getStyle() as StyleSpecification;
  const style: StyleSpecification =
    ratio < 1.5
      ? sourceStyle
      : {
          ...sourceStyle,
          sources: Object.fromEntries(
            Object.entries(sourceStyle.sources).map(([id, src]) => [
              id,
              src.type === "raster" ? { ...src, tileSize: ((src as { tileSize?: number }).tileSize ?? 256) / 2 } : src,
            ]),
          ),
        };
  const clone = new maplibregl.Map({
    container: host,
    style,
    center,
    zoom,
    bearing: 0,
    pitch: 0,
    interactive: false,
    attributionControl: false,
    preserveDrawingBuffer: true,
    pixelRatio: ratio,
    fadeDuration: 0,
  });

  // The locator is an overview: just the base map (our sites, sketches and labels are screen-sized and would swamp it).
  if (opts.baseOnly) {
    clone.once("load", () => {
      for (const layer of clone.getStyle().layers) {
        if (layer.type !== "raster" && layer.type !== "background") clone.setLayoutProperty(layer.id, "visibility", "none");
      }
    });
  }

  // Copy runtime images (hatch patterns, point icons) the style refers to.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const style = (source as any).style;
    for (const id of source.listImages()) {
      const img = style?.getImage?.(id);
      if (!img?.data) continue;
      clone.on("load", () => {
        if (!clone.hasImage(id)) {
          clone.addImage(
            id,
            { width: img.data.width, height: img.data.height, data: img.data.data },
            { pixelRatio: img.pixelRatio ?? 1, sdf: img.sdf ?? false },
          );
        }
      });
    }
  } catch {
    // images are cosmetic — continue without them
  }

  let timedOut = false;
  await new Promise<void>((resolve) => {
    clone.once("idle", () => resolve());
    // Never hang the export on a tile server that doesn't answer.
    setTimeout(() => {
      timedOut = true;
      resolve();
    }, 20000);
  });
  if (timedOut && !clone.areTilesLoaded()) opts.onIncomplete?.();

  const out = document.createElement("canvas");
  out.width = widthPx;
  out.height = heightPx;
  out.getContext("2d")!.drawImage(clone.getCanvas(), 0, 0, widthPx, heightPx);

  const actualZoom = clone.getZoom();
  const actualScale = (metresPerPixel(actualZoom, center.lat) * 1000) / ratio / mmPerPx;
  // Snapshot the projection before tearing down.
  const corners = {
    tl: clone.unproject([0, 0]),
    tr: clone.unproject([cssW, 0]),
    bl: clone.unproject([0, cssH]),
    br: clone.unproject([cssW, cssH]),
  };
  const marked = (opts.mark ?? []).map((ll) => {
    const pt = clone.project([ll.lng, ll.lat]);
    return { x: pt.x * ratio, y: pt.y * ratio };
  });
  clone.remove();
  host.remove();

  // Bilinear lng/lat over the frame — accurate enough for grid ticks at
  // print scales (the frame is small relative to projection curvature).
  const interp = (x: number, y: number) => {
    const u = x / widthPx;
    const v = y / heightPx;
    const top = { lng: corners.tl.lng + (corners.tr.lng - corners.tl.lng) * u, lat: corners.tl.lat + (corners.tr.lat - corners.tl.lat) * u };
    const bot = { lng: corners.bl.lng + (corners.br.lng - corners.bl.lng) * u, lat: corners.bl.lat + (corners.br.lat - corners.bl.lat) * u };
    return { lng: top.lng + (bot.lng - top.lng) * v, lat: top.lat + (bot.lat - top.lat) * v };
  };

  return {
    canvas: out,
    unproject: interp,
    scale: scale ?? niceScale(actualScale),
    zoom: actualZoom,
    bounds: {
      west: Math.min(corners.tl.lng, corners.bl.lng),
      east: Math.max(corners.tr.lng, corners.br.lng),
      south: Math.min(corners.bl.lat, corners.br.lat),
      north: Math.max(corners.tl.lat, corners.tr.lat),
    },
    marked,
  };
}

// ─── Map furniture ───────────────────────────────────────────────────────────

function gridInterval(spanMetres: number) {
  const steps = [50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  return steps.find((s) => spanMetres / s <= 8) ?? 100000;
}

/** A white box with a hairline border — behind labels and furniture drawn
 *  over the map, so they read on any base map. */
function knockout(ctx: CanvasRenderingContext2D, px: (mm: number) => number, r: Rect, border = true) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(px(r.x), px(r.y), px(r.w), px(r.h));
  if (border) {
    ctx.strokeStyle = RULE;
    ctx.lineWidth = Math.max(1, px(0.15));
    ctx.strokeRect(px(r.x), px(r.y), px(r.w), px(r.h));
  }
  ctx.restore();
}

/** BNG grid lines across the map, labelled inside the neat line (OS
 *  style): eastings along the top, northings down the left. `avoid` are
 *  areas (map furniture) where labels are skipped. */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  p: Painter,
  map: RenderedMap,
  frame: Rect,
  px: (mm: number) => number,
  avoid: Rect[],
) {
  const w = px(frame.w);
  const h = px(frame.h);
  const samples = 400;
  const edge = (fx: (t: number) => [number, number]) =>
    Array.from({ length: samples + 1 }, (_, i) => {
      const [x, y] = fx(i / samples);
      const ll = map.unproject(x, y);
      return { x, y, en: latLngToEN(ll.lat, ll.lng) };
    });
  const top = edge((t) => [t * w, 0]);
  const left = edge((t) => [0, t * h]);

  // A lattice of BNG positions over the map. Grid lines are traced through
  // it, so a national-scale sheet that's partly off the grid (sea, Ireland,
  // the Continent) still gets lines over the part that's on it.
  const cols = 90;
  const rows = Math.max(20, Math.round((cols * h) / w));
  const lattice = Array.from({ length: rows + 1 }, (_, j) =>
    Array.from({ length: cols + 1 }, (_, i) => {
      const x = (i / cols) * w;
      const y = (j / rows) * h;
      const ll = map.unproject(x, y);
      return { x, y, en: latLngToEN(ll.lat, ll.lng) };
    }),
  );
  const onGrid = lattice.flat().filter((s) => s.en);
  if (!onGrid.length) return; // nowhere on the grid
  const es = onGrid.map((s) => s.en!.e);
  const spanE = Math.max(...es) - Math.min(...es);
  const interval = gridInterval(spanE);
  // BNG style: no thousands separators (km figures on coarse grids).
  const labelFor = (v: number) => String(Math.round(interval >= 1000 ? v / 1000 : v));

  const crossings = (pts: typeof top, key: "e" | "n") => {
    const out: { x: number; y: number; value: number }[] = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1].en?.[key];
      const b = pts[i].en?.[key];
      if (a == null || b == null) continue;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const k = Math.ceil(lo / interval) * interval;
      if (k <= hi && k > lo - 1e-9 && hi !== lo) {
        const f = (k - a) / (b - a);
        out.push({
          x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f,
          y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f,
          value: k,
        });
      }
    }
    return out;
  };

  const eTop = crossings(top, "e");
  const nLeft = crossings(left, "n");
  const x0 = px(frame.x);
  const y0 = px(frame.y);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  ctx.strokeStyle = GRID;
  ctx.lineWidth = Math.max(1, px(0.15));
  // Eastings: where each lattice row crosses each value, joined row to row;
  // northings the same down each column.
  const trace = (lines: (typeof top)[], key: "e" | "n") => {
    const paths = new Map<number, { x: number; y: number }[]>();
    const flush = (value: number) => {
      const path = paths.get(value);
      if (path && path.length > 1) {
        ctx.beginPath();
        ctx.moveTo(x0 + path[0].x, y0 + path[0].y);
        for (const pt of path.slice(1)) ctx.lineTo(x0 + pt.x, y0 + pt.y);
        ctx.stroke();
      }
      paths.delete(value);
    };
    for (const line of lines) {
      const seen = new Set<number>();
      for (const c of crossings(line, key)) {
        seen.add(c.value);
        const path = paths.get(c.value) ?? [];
        path.push({ x: c.x, y: c.y });
        paths.set(c.value, path);
      }
      // A line that stops crossing this row has left the grid: end it.
      for (const value of [...paths.keys()]) if (!seen.has(value)) flush(value);
    }
    for (const value of [...paths.keys()]) flush(value);
  };
  trace(lattice, "e");
  trace(
    Array.from({ length: cols + 1 }, (_, i) => lattice.map((row) => row[i])),
    "n",
  );
  ctx.restore();

  // Labels inside the frame on knock-outs; skipped where furniture sits.
  const mm = (v: number) => (v / px(100)) * 100;
  const hits = (r: Rect) => avoid.some((a) => r.x < a.x + a.w && r.x + r.w > a.x && r.y < a.y + a.h && r.y + r.h > a.y);
  const o: TextOpts = { size: 2.3, color: INK, align: "left", baseline: "middle" };
  const pad = 0.6;
  const label = (text: string, x: number, y: number) => {
    const tw = p.width(text, o);
    const box = { x: x - pad, y: y - o.size / 2 - pad / 2, w: tw + 2 * pad, h: o.size + pad };
    if (box.x < frame.x || box.x + box.w > frame.x + frame.w || box.y < frame.y || box.y + box.h > frame.y + frame.h) return;
    if (hits(box)) return;
    knockout(ctx, px, box, false);
    p.text(text, x, y, o);
  };
  for (const pt of eTop) label(labelFor(pt.value), frame.x + mm(pt.x) + 0.6, frame.y + 2);
  for (const pt of nLeft) label(labelFor(pt.value), frame.x + 1, frame.y + mm(pt.y) - 1.8);
}

/** North arrow on a knock-out in the map's top-right corner. */
function drawNorthArrow(ctx: CanvasRenderingContext2D, p: Painter, px: (mm: number) => number, frame: Rect): Rect {
  const box = { x: frame.x + frame.w - 12, y: frame.y + 2, w: 10, h: 13 };
  knockout(ctx, px, box);
  const cx = px(box.x + box.w / 2);
  const top = px(box.y + 1.5);
  const size = px(7);
  ctx.save();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.lineTo(cx + size * 0.4, top + size);
  ctx.lineTo(cx, top + size * 0.72);
  ctx.lineTo(cx - size * 0.4, top + size);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  p.text("N", box.x + box.w / 2, box.y + 9.2, { size: 2.8, bold: true, align: "center" });
  return box;
}

/** Scale bar on a knock-out in the map's bottom-left corner. */
function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  p: Painter,
  px: (mm: number) => number,
  frame: Rect,
  scale: number,
  paper: PaperSize,
): Rect {
  // A bar up to ~40mm (or a third of the map) on paper, rounded to 1-2-5.
  const maxMm = Math.min(40, frame.w / 3);
  const metresMax = (scale * maxMm) / 1000;
  const mag = 10 ** Math.floor(Math.log10(metresMax));
  const lengthM = [1, 2, 5, 10].map((k) => k * mag).filter((l) => l <= metresMax).pop() ?? mag;
  const barMm = (lengthM * 1000) / scale;
  const box = { x: frame.x + 2, y: frame.y + frame.h - 12, w: barMm + 8, h: 10 };
  box.w = Math.max(box.w, 34);
  knockout(ctx, px, box);
  const x0 = box.x + 3;
  const top = box.y + 2;
  const segs = 4;
  ctx.save();
  ctx.lineWidth = Math.max(1, px(0.2));
  ctx.strokeStyle = INK;
  for (let i = 0; i < segs; i++) {
    ctx.fillStyle = i % 2 === 0 ? INK : "#ffffff";
    ctx.fillRect(px(x0 + (barMm / segs) * i), px(top), px(barMm / segs), px(1.4));
  }
  ctx.strokeRect(px(x0), px(top), px(barMm), px(1.4));
  ctx.restore();
  const unit = (m: number) => (lengthM >= 1000 ? `${m / 1000} km` : `${m} m`);
  const o: TextOpts = { size: 2.1, baseline: "top" };
  p.text("0", x0, top + 2, { ...o, align: "center" });
  p.text(unit(lengthM), x0 + barMm, top + 2, { ...o, align: "center" });
  p.text(`1:${fmtInt(scale)} at ${paper.toUpperCase()}`, x0, top + 5, { ...o, bold: true });
  return box;
}

// ─── Panel blocks ────────────────────────────────────────────────────────────

/** Fetch each service layer's legend picture. A server that refuses (no cross-origin permission), is slow or sends something
 *  that isn't a small image just leaves that layer with its plain swatch: a legend picture must never stop an export. */
export async function loadLegendImages(items: LegendItem[], fetcher: typeof fetch = fetch, timeoutMs = 8000): Promise<void> {
  await Promise.all(
    items.map(async (item) => {
      if (!item.legendUrl || item.image) return;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetcher(item.legendUrl, { signal: ctrl.signal, mode: "cors" });
        if (!res.ok) return;
        const blob = await res.blob();
        if (!blob.type.startsWith("image/") || blob.size > 1_500_000) return;
        const image = await createImageBitmap(blob);
        // A legend is a small picture; a huge one is a mistake (an error page, a map).
        if (image.width > 1200 || image.height > 1600) return;
        item.image = image;
      } catch {
        // keep the swatch
      } finally {
        clearTimeout(timer);
      }
    }),
  );
}

function drawLegend(ctx: CanvasRenderingContext2D, p: Painter, px: (mm: number) => number, all: LegendItem[], r: Rect): number {
  if (all.length === 0 || r.h < 8) return r.y;
  // Layers with a picture from their service get it under their name; the rest are rows of swatches.
  const items = all.filter((i) => !i.image);
  const pictured = all.filter((i) => i.image);
  p.text("Legend", r.x, r.y, { size: 2.8, bold: true });
  const rowH = 4;
  const sw = 3;
  const colW = r.w >= 90 ? r.w / 2 : r.w;
  const cols = Math.max(1, Math.floor(r.w / colW));
  const rows = Math.max(1, Math.floor((r.h - 4.5) / rowH));
  const shown = items.slice(0, rows * cols);
  shown.forEach((item, i) => {
    const cx = r.x + (i % cols) * colW;
    const cy = r.y + 4.5 + Math.floor(i / cols) * rowH;
    ctx.save();
    if (item.kind === "point") {
      ctx.fillStyle = item.color;
      ctx.strokeStyle = item.strokeColor ?? "#ffffff";
      ctx.lineWidth = Math.max(1, px(0.3));
      ctx.beginPath();
      ctx.arc(px(cx + sw / 2), px(cy + sw / 2), px(sw / 2.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (item.kind === "line") {
      ctx.strokeStyle = item.color;
      ctx.lineWidth = Math.max(1, px(0.5));
      ctx.beginPath();
      ctx.moveTo(px(cx), px(cy + sw / 2));
      ctx.lineTo(px(cx + sw), px(cy + sw / 2));
      ctx.stroke();
    } else {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = item.color;
      ctx.fillRect(px(cx), px(cy), px(sw), px(sw));
      ctx.globalAlpha = 1;
      ctx.strokeStyle = item.strokeColor ?? item.color;
      ctx.lineWidth = Math.max(1, px(0.3));
      ctx.strokeRect(px(cx), px(cy), px(sw), px(sw));
    }
    ctx.restore();
    const o: TextOpts = { size: 2.3, baseline: "top" };
    const count = item.count != null ? ` (${fmtInt(item.count)})` : "";
    let label = item.label + count;
    const maxW = colW - sw - 3;
    while (label.length > 4 && p.width(label, o) > maxW) label = `${label.slice(0, -2)}…`;
    p.text(label, cx + sw + 1.5, cy + 0.4, o);
  });
  if (items.length > shown.length) {
    p.text(`+${items.length - shown.length} more`, r.x, r.y + 4.5 + Math.ceil(shown.length / cols) * rowH, {
      size: 2.1,
      color: MUTED,
    });
  }
  let y = r.y + 4.5 + Math.ceil(shown.length / cols) * rowH + (items.length > shown.length ? rowH : 0);
  const bottom = r.y + r.h;
  for (const item of pictured) {
    const img = item.image!;
    // The service draws it for a screen: a little smaller on paper, and never wider than the column.
    const wMm = Math.min(r.w, ((img.width * 25.4) / 96) * 0.75);
    const hMm = (wMm * img.height) / img.width;
    if (y + 3.4 + hMm > bottom) break;
    p.text(item.label, r.x, y, { size: 2.3, baseline: "top" });
    ctx.save();
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, px(r.x), px(y + 3.4), px(wMm), px(hMm));
    ctx.restore();
    y += 3.4 + hMm + 2;
  }
  return y;
}

export interface CoordRow {
  label: "NE" | "Centre" | "SW";
  gridRef: string;
  bng: string;
}

interface Place {
  coords: CoordRow[];
  address: string | null;
}

/** The sheet's corners and centre as OS grid references and BNG easting,
 *  northing (whole metres, no thousands separators: 625597, 245940). */
export function coordinateRows(points: { label: CoordRow["label"]; lat: number; lng: number }[]): CoordRow[] {
  return points.map(({ label, lat, lng }) => {
    const en = latLngToEN(lat, lng);
    if (!en) {
      // Off the grid: say so, and where it is in degrees instead.
      const deg = `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? "E" : "W"}`;
      return { label, gridRef: "Outside BNG", bng: deg };
    }
    return { label, gridRef: osGridRef(en.e, en.n) ?? "Outside BNG", bng: formatEN(en.e, en.n) };
  });
}

/** A small NE / Centre / SW table: grid reference and BNG. */
function drawCoordTable(p: Painter, rows: CoordRow[], x: number, y: number, w: number): number {
  const size = w < 55 ? 2 : 2.2;
  const head: TextOpts = { size: 1.7, bold: true, color: MUTED };
  const cell: TextOpts = { size };
  const c1 = 0;
  const c2 = w < 55 ? 9.5 : 11;
  const c3 = c2 + (w - c2) * 0.52;
  p.text("GRID REF", x + c2, y, head);
  p.text("BNG (E, N)", x + c3, y, head);
  y += 2.6;
  for (const r of rows) {
    p.text(r.label, x + c1, y, { ...cell, bold: true, color: MUTED });
    p.text(r.gridRef, x + c2, y, cell);
    p.text(r.bng, x + c3, y, cell);
    y += size + 1.1;
  }
  return y;
}

/** Title, then where: address (or area, or countries), then the corner
 *  and centre coordinates. */
function drawTitleAndPlace(p: Painter, o: PrintOptions, place: Place, r: Rect): number {
  let y = r.y;
  y = paragraph(p, o.title || "Site plan", r.x, y, r.w, { size: 5, bold: true }, 2, 1.2) + 0.8;
  if (o.subtitle) y = paragraph(p, o.subtitle, r.x, y, r.w, { size: 3, color: MUTED }, 2) + 0.6;
  y += 1.5;
  const label = (text: string) => {
    p.text(text.toUpperCase(), r.x, y, { size: 1.8, bold: true, color: MUTED });
    y += 2.6;
  };
  if (place.address) {
    label("Location");
    y = paragraph(p, place.address, r.x, y, r.w, { size: 2.6 }, 3) + 1.2;
  }
  if (place.coords.length) {
    label("Coordinates");
    y = drawCoordTable(p, place.coords, r.x, y, r.w) + 0.8;
  }
  return y;
}

/** The drawing-register block: reference, revision, scale, date, author,
 *  status, then credits. Returns its height. */
function drawTitleBlock(ctx: CanvasRenderingContext2D, p: Painter, px: (mm: number) => number, o: PrintOptions, scale: number, r: Rect) {
  const rowH = 7;
  const cells: [string, string][] = [
    ["Drawing no.", o.drawingNo || "—"],
    ["Rev", o.revision || "—"],
    ["Scale", `1:${fmtInt(scale)} @ ${o.paper.toUpperCase()}`],
    ["Date", new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })],
    ["Drawn by", o.author || "—"],
    ["Status", o.status],
  ];
  const credits = creditLine(o.copyright, stripHtml(o.attribution));
  const creditsO: TextOpts = { size: 1.9, color: MUTED };
  const creditLines = wrap(p, credits, r.w - 3, creditsO).slice(0, 3);
  const creditsH = creditLines.length * 2.5 + 2.5;
  const h = 3 * rowH + creditsH;
  const top = r.y + r.h - h;

  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, px(0.3));
  ctx.strokeRect(px(r.x), px(top), px(r.w), px(h));
  ctx.lineWidth = Math.max(1, px(0.15));
  ctx.strokeStyle = RULE;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(px(r.x), px(top + i * rowH));
    ctx.lineTo(px(r.x + r.w), px(top + i * rowH));
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(px(r.x + r.w / 2), px(top));
  ctx.lineTo(px(r.x + r.w / 2), px(top + 3 * rowH));
  ctx.stroke();
  ctx.restore();

  cells.forEach(([k, v], i) => {
    const cx = r.x + (i % 2) * (r.w / 2) + 1.5;
    const cy = top + Math.floor(i / 2) * rowH + 1.2;
    p.text(k.toUpperCase(), cx, cy, { size: 1.7, bold: true, color: MUTED });
    let value = v;
    const vo: TextOpts = { size: 2.5, bold: k === "Status" };
    while (value.length > 4 && p.width(value, vo) > r.w / 2 - 3) value = `${value.slice(0, -2)}…`;
    p.text(value, cx, cy + 2.6, vo);
  });
  creditLines.forEach((line, i) => p.text(line, r.x + 1.5, top + 3 * rowH + 1.4 + i * 2.5, creditsO));
  return h;
}

/** Small-scale inset with a red box around the sheet's area. */
async function drawLocator(
  ctx: CanvasRenderingContext2D,
  px: (mm: number) => number,
  source: MapLibreMap,
  main: RenderedMap,
  r: Rect,
  dpi: number,
) {
  const zoom = Math.max(4, Math.min(main.zoom - 3.5, 13));
  const b = main.bounds;
  const loc = await renderMapImage(source, px(r.w), px(r.h), dpi, null, {
    zoom,
    baseOnly: true,
    mark: [
      { lng: b.west, lat: b.north },
      { lng: b.east, lat: b.south },
    ],
  });
  ctx.drawImage(loc.canvas, px(r.x), px(r.y));
  const [a, c] = loc.marked;
  if (a && c) {
    const minBox = px(2);
    let w = c.x - a.x;
    let h = c.y - a.y;
    const cx = a.x + w / 2;
    const cy = a.y + h / 2;
    w = Math.max(w, minBox);
    h = Math.max(h, minBox);
    ctx.save();
    ctx.beginPath();
    ctx.rect(px(r.x), px(r.y), px(r.w), px(r.h));
    ctx.clip();
    ctx.strokeStyle = STATUS_DANGER;
    ctx.lineWidth = Math.max(1, px(0.45));
    ctx.strokeRect(px(r.x) + cx - w / 2, px(r.y) + cy - h / 2, w, h);
    ctx.restore();
  }
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, px(0.25));
  ctx.strokeRect(px(r.x), px(r.y), px(r.w), px(r.h));
  ctx.restore();
}

async function describePlace(o: PrintOptions, main: RenderedMap, frame: Rect): Promise<Place> {
  const nw = main.unproject(0, 0);
  const se = main.unproject(main.canvas.width, main.canvas.height);
  const centre = main.unproject(main.canvas.width / 2, main.canvas.height / 2);
  const widthMetres = (frame.w * main.scale) / 1000;
  const bounds = { west: nw.lng, east: se.lng, north: nw.lat, south: se.lat };
  const address =
    o.address.trim() ||
    (o.describeLocation ? await o.describeLocation(centre, widthMetres, bounds).catch(() => null) : null);
  return {
    coords: coordinateRows([
      { label: "NE", lat: nw.lat, lng: se.lng },
      { label: "Centre", lat: centre.lat, lng: centre.lng },
      { label: "SW", lat: se.lat, lng: nw.lng },
    ]),
    address,
  };
}

// ─── Sheet ───────────────────────────────────────────────────────────────────

/** Render the sheet. With `text` given, text is collected there (for the
 *  PDF to write as real text) instead of being drawn into the image. */
export async function renderPrintSheet(
  map: MapLibreMap,
  o: PrintOptions,
  text?: TextOp[],
): Promise<HTMLCanvasElement> {
  await document.fonts?.ready;
  const layout = sheetLayout(o.paper, o.orientation);
  const px = (mm: number) => Math.round((mm * o.dpi) / 25.4);

  const canvas = document.createElement("canvas");
  canvas.width = px(layout.page.w);
  canvas.height = px(layout.page.h);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const drawn = canvasPainter(ctx, px);
  const p = text ? recordingPainter(text, drawn) : drawn;

  // ── Map ──
  const frame = layout.map;
  const rendered = await renderMapImage(map, px(frame.w), px(frame.h), o.dpi, o.scale, { onIncomplete: o.onIncomplete });
  ctx.drawImage(rendered.canvas, px(frame.x), px(frame.y));

  const furniture: Rect[] = [];
  if (o.showNorthArrow) furniture.push(drawNorthArrow(ctx, p, px, frame));
  if (o.showScaleBar) furniture.push(drawScaleBar(ctx, p, px, frame, rendered.scale, o.paper));
  const portrait = layout.panelSide === "bottom";
  // Portrait: the locator sits in the map's top-left corner.
  const insetLocator: Rect | null =
    o.showLocator && portrait ? { x: frame.x + 2, y: frame.y + 2, w: Math.min(48, frame.w * 0.28), h: Math.min(38, frame.h * 0.22) } : null;
  if (insetLocator) furniture.push({ ...insetLocator, w: insetLocator.w + 1, h: insetLocator.h + 1 });
  if (o.showGrid) drawGrid(ctx, p, rendered, frame, px, furniture);
  if (insetLocator) await drawLocator(ctx, px, map, rendered, insetLocator, o.dpi);

  // Neat line.
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, px(0.35));
  ctx.strokeRect(px(frame.x), px(frame.y), px(frame.w), px(frame.h));

  // ── Panel ──
  const place = await describePlace(o, rendered, frame);
  const legend = o.showLegend ? o.legendFor(rendered.bounds) : [];
  await loadLegendImages(legend);
  const panel = layout.panel;

  let logo: HTMLImageElement | null = null;
  try {
    logo = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG)}`);
  } catch {
    // decorative
  }
  const brand = (x: number, y: number) => {
    if (logo) ctx.drawImage(logo, px(x), px(y), px(5), px(5));
    p.text(APP_BRAND.name, x + 6.5, y + 0.3, { size: 2.6, bold: true });
    p.text("Sites & surveys", x + 6.5, y + 3.1, { size: 1.8, color: MUTED });
  };

  if (!portrait) {
    const r = panel;
    brand(r.x, r.y);
    let y = drawTitleAndPlace(p, o, place, { ...r, y: r.y + 8 }) + 1;
    const blockH = drawTitleBlock(ctx, p, px, o, rendered.scale, r);
    const bottom = r.y + r.h - blockH - 3;
    if (o.notes.trim()) {
      const notesTop = y;
      p.text("NOTES", r.x, notesTop, { size: 1.8, bold: true, color: MUTED });
      y = paragraph(p, o.notes, r.x, notesTop + 2.6, r.w, { size: 2.3 }, 4) + 2;
    }
    if (o.showLocator) {
      const lh = Math.min(r.w * 0.8, Math.max(0, bottom - y - 22));
      if (lh >= 25) {
        await drawLocator(ctx, px, map, rendered, { x: r.x, y, w: r.w, h: lh }, o.dpi);
        y += lh + 3;
      }
    }
    drawLegend(ctx, p, px, legend, { x: r.x, y, w: r.w, h: bottom - y });
  } else {
    // Three columns: title & place · legend & notes · title block.
    const colGap = 5;
    const c1 = { x: panel.x, y: panel.y, w: panel.w * 0.4 - colGap, h: panel.h };
    const c2 = { x: panel.x + panel.w * 0.4, y: panel.y, w: panel.w * 0.28 - colGap, h: panel.h };
    const c3 = { x: panel.x + panel.w * 0.68, y: panel.y, w: panel.w * 0.32, h: panel.h };
    drawTitleAndPlace(p, o, place, c1);
    let y2 = drawLegend(ctx, p, px, legend, { ...c2, h: o.notes.trim() ? c2.h * 0.6 : c2.h });
    if (o.notes.trim()) {
      y2 = legend.length ? y2 + 2 : c2.y;
      p.text("NOTES", c2.x, y2, { size: 1.8, bold: true, color: MUTED });
      paragraph(p, o.notes, c2.x, y2 + 2.6, c2.w, { size: 2.3 }, 4);
    }
    const blockH = drawTitleBlock(ctx, p, px, o, rendered.scale, c3);
    if (c3.h - blockH >= 7) brand(c3.x, c3.y);
  }

  return canvas;
}

function download(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

/** Render and download the sheet as PNG, or as a PDF with real text over
 *  the map image. */
export async function exportPrintSheet(map: MapLibreMap, o: PrintOptions): Promise<void> {
  const name = sheetFileName(o.title);
  if (o.format === "png") {
    const canvas = await renderPrintSheet(map, o);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) throw new Error("Could not encode the image");
    const url = URL.createObjectURL(blob);
    download(url, `${name}.png`);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }
  const ops: TextOp[] = [];
  const canvas = await renderPrintSheet(map, o, ops);
  const { jsPDF } = await import("jspdf");
  const layout = sheetLayout(o.paper, o.orientation);
  const pdf = new jsPDF({ orientation: o.orientation, unit: "mm", format: o.paper });
  pdf.setProperties({ title: o.title || "Site plan", subject: o.subtitle, author: o.author, creator: APP_BRAND.name });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, layout.page.w, layout.page.h);
  for (const t of ops) {
    pdf.setFont("helvetica", t.bold ? "bold" : "normal");
    pdf.setFontSize(t.size * (72 / 25.4));
    pdf.setTextColor(t.color ?? INK);
    pdf.text(t.text, t.x, t.y, { align: t.align ?? "left", baseline: t.baseline ?? "top" });
  }
  pdf.save(`${name}.pdf`);
}
