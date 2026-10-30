/**
 * Custom MapLibre GL adapter for TerraDraw.
 *
 * Implements the TerraDrawAdapter interface manually (without extending the
 * non-exported TerraDrawBaseAdapter class) and manages three GeoJSON sources:
 * td-point, td-linestring, td-polygon.
 */

import { Map as MapLibreMap } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import type {
  GeoJSONStoreFeatures,
  TerraDrawChanges,
  TerraDrawStylingFunction,
  TerraDrawAdapterStyling,
} from "terra-draw";
import { DRAW_DEFAULT, WHITE } from "../layers/colors";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TDCallbacks {
  getState: () => string;
  onKeyUp: (event: { key: string; heldKeys: string[]; preventDefault: () => void }) => void;
  onKeyDown: (event: { key: string; heldKeys: string[]; preventDefault: () => void }) => void;
  onClick: (event: TDMouseEvent) => void;
  onMouseMove: (event: TDMouseEvent) => void;
  onDragStart: (event: TDMouseEvent, setMapDraggability: (enabled: boolean) => void) => void;
  onDrag: (event: TDMouseEvent, setMapDraggability: (enabled: boolean) => void) => void;
  onDragEnd: (event: TDMouseEvent, setMapDraggability: (enabled: boolean) => void) => void;
  onClear: () => void;
  onReady?: () => void;
}

interface TDMouseEvent {
  lng: number;
  lat: number;
  containerX: number;
  containerY: number;
  button: "neither" | "left" | "middle" | "right";
  heldKeys: string[];
  isContextMenu: boolean;
}

// ─── Source/layer IDs ────────────────────────────────────────────────────────

const SOURCE_POINT = "td-point";
const SOURCE_LINE = "td-linestring";
const SOURCE_POLYGON = "td-polygon";

const LAYER_POLYGON_FILL = "td-polygon-fill";
const LAYER_POLYGON_OUTLINE = "td-polygon-outline";
const LAYER_LINE = "td-line";
const LAYER_POINT = "td-point-circle";

// Per-feature dash style: MapLibre's line-dasharray can't be data-driven, so
// each dash style gets its own filtered layer sharing the same source.
const DASH_STYLES: { key: string; dash?: number[] }[] = [
  { key: "solid" },
  { key: "dashed", dash: [4, 4] },
  { key: "dotted", dash: [0.5, 3] },
  { key: "longdash", dash: [8, 4] },
  { key: "shortdash", dash: [2, 4] },
];
const lineLayerId = (style: string) => `${LAYER_LINE}-${style}`;
const polygonOutlineLayerId = (style: string) => `${LAYER_POLYGON_OUTLINE}-${style}`;

export interface StyleOverride {
  color?: string;
  weight?: number;
  fillOpacity?: number;
  lineStyle?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function geomType(f: GeoJSONStoreFeatures): "Point" | "LineString" | "Polygon" | "other" {
  const t = f.geometry.type;
  if (t === "Point") return "Point";
  if (t === "LineString") return "LineString";
  if (t === "Polygon") return "Polygon";
  return "other";
}

function styledFeature(
  f: GeoJSONStoreFeatures,
  style: TerraDrawAdapterStyling,
  override?: StyleOverride,
): GeoJSON.Feature {
  const color = override?.color;
  const weight = override?.weight;
  return {
    ...f,
    properties: {
      ...(f.properties as Record<string, unknown>),
      tdPointColor: color ?? style.pointColor,
      tdPointWidth: weight ?? style.pointWidth,
      tdPointOpacity: style.pointOpacity ?? 1,
      tdPointOutlineColor: style.pointOutlineColor,
      tdPointOutlineWidth: style.pointOutlineWidth,
      tdPointOutlineOpacity: style.pointOutlineOpacity ?? 1,
      tdFillColor: color ?? style.polygonFillColor,
      tdFillOpacity: override?.fillOpacity ?? style.polygonFillOpacity,
      tdOutlineColor: color ?? style.polygonOutlineColor,
      tdOutlineWidth: weight ?? style.polygonOutlineWidth,
      tdOutlineOpacity: style.polygonOutlineOpacity ?? 1,
      tdLineColor: color ?? style.lineStringColor,
      tdLineWidth: weight ?? style.lineStringWidth,
      tdLineOpacity: style.lineStringOpacity ?? 1,
      tdLineStyle: override?.lineStyle ?? "solid",
    },
  } as GeoJSON.Feature;
}

function defaultStyling(): TerraDrawAdapterStyling {
  return {
    pointColor: DRAW_DEFAULT,
    pointWidth: 8,
    pointOpacity: 1,
    pointOutlineColor: WHITE,
    pointOutlineWidth: 2,
    pointOutlineOpacity: 1,
    polygonFillColor: DRAW_DEFAULT,
    polygonFillOpacity: 0.3,
    polygonOutlineColor: DRAW_DEFAULT,
    polygonOutlineWidth: 2,
    polygonOutlineOpacity: 1,
    lineStringColor: DRAW_DEFAULT,
    lineStringWidth: 2,
    lineStringOpacity: 1,
    zIndex: 10,
  };
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class TerraDrawMapLibreAdapter {
  private _map: MapLibreMap;
  private _coordinatePrecision: number;
  private _features = new Map<string | number, GeoJSONStoreFeatures>();
  private _overrides = new Map<string | number, StyleOverride>();
  private _lastStyling: TerraDrawStylingFunction = {};
  private _ready = false;
  private _callbacks: TDCallbacks | null = null;
  private _heldKeys: string[] = [];
  private _onPointerDown: ((e: PointerEvent) => void) | null = null;
  private _onPointerMove: ((e: PointerEvent) => void) | null = null;
  private _onPointerUp: ((e: PointerEvent) => void) | null = null;
  private _onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private _onKeyUp: ((e: KeyboardEvent) => void) | null = null;

  constructor(map: MapLibreMap, config: { coordinatePrecision?: number } = {}) {
    this._map = map;
    this._coordinatePrecision = config.coordinatePrecision ?? 9;
  }

  getCoordinatePrecision(): number {
    return this._coordinatePrecision;
  }

  getMapEventElement(_eventType?: string): HTMLElement {
    return this._map.getCanvas();
  }

  project(lng: number, lat: number): { x: number; y: number } {
    const pt = this._map.project([lng, lat]);
    return { x: pt.x, y: pt.y };
  }

  unproject(x: number, y: number): { lat: number; lng: number } {
    const ll = this._map.unproject([x, y]);
    return { lng: ll.lng, lat: ll.lat };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setCursor(cursor: any): void {
    this._map.getCanvas().style.cursor = cursor === "unset" ? "" : cursor;
  }

  getLngLatFromEvent(event: PointerEvent | MouseEvent): { lng: number; lat: number } | null {
    const canvas = this._map.getCanvas();
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    const ll = this._map.unproject([x, y]);
    return { lng: ll.lng, lat: ll.lat };
  }

  setDoubleClickToZoom(enabled: boolean): void {
    if (enabled) this._map.doubleClickZoom.enable();
    else this._map.doubleClickZoom.disable();
  }

  register(callbacks: TDCallbacks): void {
    this._callbacks = callbacks;
    const el = this._map.getCanvas();

    const setDrag = (enabled: boolean) => {
      if (enabled) this._map.dragPan.enable();
      else this._map.dragPan.disable();
    };

    const toMouse = (e: PointerEvent): TDMouseEvent => {
      const ll = this.getLngLatFromEvent(e);
      const btn = e.button === 0 ? "left" : e.button === 2 ? "right" : "neither";
      return {
        lng: ll?.lng ?? 0,
        lat: ll?.lat ?? 0,
        containerX: e.offsetX,
        containerY: e.offsetY,
        button: btn as "neither" | "left" | "right",
        heldKeys: [...this._heldKeys],
        isContextMenu: false,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      const cbs = this._callbacks;
      if (!cbs) return;
      const me = toMouse(e);
      cbs.onClick(me);
      cbs.onDragStart(me, setDrag);
    };

    const onPointerMove = (e: PointerEvent) => {
      const cbs = this._callbacks;
      if (!cbs) return;
      const me = toMouse(e);
      cbs.onMouseMove(me);
      if (e.buttons > 0) cbs.onDrag(me, setDrag);
    };

    const onPointerUp = (e: PointerEvent) => {
      const cbs = this._callbacks;
      if (!cbs) return;
      cbs.onDragEnd(toMouse(e), setDrag);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const cbs = this._callbacks;
      if (!cbs) return;
      if (!this._heldKeys.includes(e.key)) this._heldKeys.push(e.key);
      cbs.onKeyDown({ key: e.key, heldKeys: [...this._heldKeys], preventDefault: () => e.preventDefault() });
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const cbs = this._callbacks;
      if (!cbs) return;
      this._heldKeys = this._heldKeys.filter((k) => k !== e.key);
      cbs.onKeyUp({ key: e.key, heldKeys: [...this._heldKeys], preventDefault: () => e.preventDefault() });
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    this._onPointerDown = onPointerDown;
    this._onPointerMove = onPointerMove;
    this._onPointerUp = onPointerUp;
    this._onKeyDown = onKeyDown;
    this._onKeyUp = onKeyUp;

    callbacks.onReady?.();
  }

  unregister(): void {
    const el = this._map.getCanvas();
    if (this._onPointerDown) el.removeEventListener("pointerdown", this._onPointerDown);
    if (this._onPointerMove) el.removeEventListener("pointermove", this._onPointerMove);
    if (this._onPointerUp) el.removeEventListener("pointerup", this._onPointerUp);
    if (this._onKeyDown) window.removeEventListener("keydown", this._onKeyDown);
    if (this._onKeyUp) window.removeEventListener("keyup", this._onKeyUp);
    this._callbacks = null;
  }

  clear(): void {
    this._features.clear();
    if (this._ready) {
      this._setSourceData(SOURCE_POINT, emptyCollection());
      this._setSourceData(SOURCE_LINE, emptyCollection());
      this._setSourceData(SOURCE_POLYGON, emptyCollection());
    }
  }

  render(changes: TerraDrawChanges, styling: TerraDrawStylingFunction): void {
    if (!this._ready) return;
    this._lastStyling = styling;

    for (const f of changes.created) this._features.set(f.id as string | number, f);
    for (const f of changes.updated) this._features.set(f.id as string | number, f);
    for (const id of changes.deletedIds) this._features.delete(id as string | number);

    const points: GeoJSON.Feature[] = [];
    const lines: GeoJSON.Feature[] = [];
    const polygons: GeoJSON.Feature[] = [];

    for (const f of this._features.values()) {
      const mode = (f.properties as Record<string, unknown>)?.mode as string | undefined;
      const styleFn = mode ? styling[mode] : undefined;
      const style: TerraDrawAdapterStyling = styleFn ? (styleFn(f) ?? defaultStyling()) : defaultStyling();
      const sf = styledFeature(f, style, this._overrides.get(f.id as string | number));
      switch (geomType(f)) {
        case "Point": points.push(sf); break;
        case "LineString": lines.push(sf); break;
        case "Polygon": polygons.push(sf); break;
      }
    }

    this._setSourceData(SOURCE_POINT, { type: "FeatureCollection", features: points });
    this._setSourceData(SOURCE_LINE, { type: "FeatureCollection", features: lines });
    this._setSourceData(SOURCE_POLYGON, { type: "FeatureCollection", features: polygons });
  }

  /** Apply per-feature color/weight/fill-opacity/line-style overrides (from
   *  our own DrawFeature records) and immediately re-render with them. */
  setStyleOverrides(overrides: Map<string | number, StyleOverride>): void {
    this._overrides = overrides;
    if (!this._ready || this._features.size === 0) return;
    this.render(
      { created: [], updated: Array.from(this._features.values()), unchanged: [], deletedIds: [] },
      this._lastStyling,
    );
  }

  initialise(): void {
    const map = this._map;

    if (!map.getSource(SOURCE_POLYGON))
      map.addSource(SOURCE_POLYGON, { type: "geojson", data: emptyCollection() });
    if (!map.getSource(SOURCE_LINE))
      map.addSource(SOURCE_LINE, { type: "geojson", data: emptyCollection() });
    if (!map.getSource(SOURCE_POINT))
      map.addSource(SOURCE_POINT, { type: "geojson", data: emptyCollection() });

    if (!map.getLayer(LAYER_POLYGON_FILL))
      map.addLayer({
        id: LAYER_POLYGON_FILL, type: "fill", source: SOURCE_POLYGON,
        paint: {
          "fill-color": ["coalesce", ["get", "tdFillColor"], DRAW_DEFAULT],
          "fill-opacity": ["coalesce", ["get", "tdFillOpacity"], 0.3],
        },
      });

    // One layer per dash style, each filtered to features tagged with that
    // style — line-dasharray can't be a data-driven ["get", ...] expression.
    DASH_STYLES.forEach(({ key, dash }) => {
      const id = polygonOutlineLayerId(key);
      if (!map.getLayer(id))
        map.addLayer({
          id, type: "line", source: SOURCE_POLYGON,
          filter: ["==", ["coalesce", ["get", "tdLineStyle"], "solid"], key],
          paint: {
            "line-color": ["coalesce", ["get", "tdOutlineColor"], DRAW_DEFAULT],
            "line-width": ["coalesce", ["get", "tdOutlineWidth"], 2],
            "line-opacity": ["coalesce", ["get", "tdOutlineOpacity"], 1],
            ...(dash ? { "line-dasharray": dash } : {}),
          },
        });
    });

    DASH_STYLES.forEach(({ key, dash }) => {
      const id = lineLayerId(key);
      if (!map.getLayer(id))
        map.addLayer({
          id, type: "line", source: SOURCE_LINE,
          filter: ["==", ["coalesce", ["get", "tdLineStyle"], "solid"], key],
          paint: {
            "line-color": ["coalesce", ["get", "tdLineColor"], DRAW_DEFAULT],
            "line-width": ["coalesce", ["get", "tdLineWidth"], 2],
            "line-opacity": ["coalesce", ["get", "tdLineOpacity"], 1],
            ...(dash ? { "line-dasharray": dash } : {}),
          },
        });
    });

    if (!map.getLayer(LAYER_POINT))
      map.addLayer({
        id: LAYER_POINT, type: "circle", source: SOURCE_POINT,
        paint: {
          "circle-color": ["coalesce", ["get", "tdPointColor"], DRAW_DEFAULT],
          "circle-radius": ["coalesce", ["get", "tdPointWidth"], 8],
          "circle-opacity": ["coalesce", ["get", "tdPointOpacity"], 1],
          "circle-stroke-color": ["coalesce", ["get", "tdPointOutlineColor"], WHITE],
          "circle-stroke-width": ["coalesce", ["get", "tdPointOutlineWidth"], 2],
          "circle-stroke-opacity": ["coalesce", ["get", "tdPointOutlineOpacity"], 1],
        },
      });

    this._ready = true;
  }

  reinitialise(): void {
    this._ready = false;
    this.initialise();
    if (this._features.size > 0) {
      this.render(
        { created: [], updated: Array.from(this._features.values()), unchanged: [], deletedIds: [] },
        {}
      );
    }
  }

  private _setSourceData(sourceId: string, data: GeoJSON.FeatureCollection): void {
    const src = this._map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data);
  }
}

export const TD_SOURCES = { SOURCE_POINT, SOURCE_LINE, SOURCE_POLYGON };
export const TD_LAYERS = {
  LAYER_POLYGON_FILL,
  LAYER_POINT,
  POLYGON_OUTLINE_IDS: DASH_STYLES.map((d) => polygonOutlineLayerId(d.key)),
  LINE_IDS: DASH_STYLES.map((d) => lineLayerId(d.key)),
};
