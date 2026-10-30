/**
 * Sites and Surveys as MapLibre point layers that work the same way: each is
 * coloured by one field (site type, site status, survey state) or by one colour,
 * can be restyled per value, and can be filtered to some values — "only completed
 * surveys". One definition per layer drives the paint, the filter, the style
 * editor, the legend and the saved settings. To map another entity, add a key
 * here, a definition below, a `*Geo` converter and a popup.
 */
import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { Feature, FeatureCollection, Point } from "geojson";
import { BRAND_BLUE, INK, RULE_GREY, STATUS_DONE, STATUS_DRAFT, TRANSPARENT, WHITE } from "./colors";
import { DISTINCT, type Tone } from "./colorSchemes";

export type PointLayerKey = "sites" | "surveys";
export const POINT_LAYER_KEYS: PointLayerKey[] = ["sites", "surveys"];

export interface Category {
  value: string;
  label: string;
  color: string;
  /** What the value means, for the status colour scheme (draft is pending, completed is good…). */
  tone?: Tone;
}

/** One thing a layer can be coloured by. Every point carries a property named `key` holding one of the values. */
export interface ColorField {
  key: string;
  /** "Type" */
  label: string;
  categories: Category[];
}

/** `colorBy` when the layer is one colour. */
export const NO_FIELD = "none";

/** An on/off filter beyond the categories, e.g. "Include archived sites". */
export interface FilterFlag {
  key: string;
  label: string;
  default: boolean;
}

export interface PointLayerDef {
  key: PointLayerKey;
  /** "Sites" */
  label: string;
  /** What it can be coloured by. */
  fields: ColorField[];
  /** A field's key, or NO_FIELD. */
  defaultColorBy: string;
  /** The colour when it's not coloured by a field. */
  defaultColor: string;
  /** Text shown next to the marker when labels are on. */
  labelField: string;
  defaultSize: number;
  defaultStroke: string;
  /** Surveys draw as a ring around their site rather than a dot. */
  ring?: boolean;
  flags?: FilterFlag[];
  defaultHidden?: string[];
  defaultVisible: boolean;
}

export const POINT_LAYERS: Record<PointLayerKey, PointLayerDef> = {
  sites: {
    key: "sites",
    label: "Sites",
    // One colour by default (the look people know); colour by type or status instead, and each value
    // starts with a different colour that can be changed.
    defaultColorBy: NO_FIELD,
    defaultColor: BRAND_BLUE,
    fields: [
      {
        key: "type",
        label: "Type",
        categories: [
          { value: "bridge", label: "Bridge", color: DISTINCT[0] },
          { value: "building", label: "Building", color: DISTINCT[1] },
          { value: "playground", label: "Playground", color: DISTINCT[2] },
          { value: "outfall", label: "Outfall", color: DISTINCT[3] },
          { value: "other", label: "Other", color: DISTINCT[4] },
        ],
      },
      {
        key: "status",
        label: "Status",
        categories: [
          { value: "active", label: "Active", color: STATUS_DONE, tone: "good" },
          { value: "archived", label: "Archived", color: RULE_GREY, tone: "quiet" },
        ],
      },
    ],
    labelField: "name",
    defaultSize: 12,
    defaultStroke: WHITE,
    flags: [{ key: "includeArchived", label: "Include archived sites", default: true }],
    defaultVisible: true,
  },
  surveys: {
    key: "surveys",
    label: "Surveys",
    defaultColorBy: "status",
    defaultColor: STATUS_DRAFT,
    fields: [
      {
        key: "status",
        label: "Latest survey",
        categories: [
          { value: "draft", label: "Draft", color: STATUS_DRAFT, tone: "pending" },
          { value: "completed", label: "Completed", color: STATUS_DONE, tone: "good" },
          { value: "old", label: "Over a year old", color: RULE_GREY, tone: "quiet" },
        ],
      },
    ],
    labelField: "label",
    defaultSize: 17,
    defaultStroke: WHITE,
    ring: true,
    defaultVisible: false,
  },
};

export interface PointLayerStyle {
  /** A field's key, or NO_FIELD. */
  colorBy: string;
  /** The colour when `colorBy` is NO_FIELD. */
  color: string;
  /** A colour for each value of each field. */
  colors: Record<string, string>;
  size: number;
  opacity: number;
  strokeColor: string;
  showLabels: boolean;
  labelSize: number;
  labelColor: string;
  labelHalo: boolean;
}

export interface PointLayerFilter {
  /** Values of the field the layer is coloured by that are not shown. */
  hidden: string[];
  flags: Record<string, boolean>;
}

export interface PointLayerState {
  visible: boolean;
  style: PointLayerStyle;
  filter: PointLayerFilter;
}

export type PointLayerStates = Record<PointLayerKey, PointLayerState>;

/** The field a layer is coloured by, or null when it's one colour. */
export function activeField(def: PointLayerDef, style: Pick<PointLayerStyle, "colorBy">): ColorField | null {
  return def.fields.find((f) => f.key === style.colorBy) ?? null;
}

export function defaultStyle(def: PointLayerDef): PointLayerStyle {
  return {
    colorBy: def.defaultColorBy,
    color: def.defaultColor,
    colors: Object.fromEntries(def.fields.flatMap((f) => f.categories.map((c) => [c.value, c.color]))),
    size: def.defaultSize,
    opacity: 1,
    strokeColor: def.defaultStroke,
    showLabels: false,
    labelSize: 12,
    labelColor: INK,
    labelHalo: true,
  };
}

export function defaultFilter(def: PointLayerDef): PointLayerFilter {
  return {
    hidden: [...(def.defaultHidden ?? [])],
    flags: Object.fromEntries((def.flags ?? []).map((f) => [f.key, f.default])),
  };
}

export function defaultStates(): PointLayerStates {
  return Object.fromEntries(
    POINT_LAYER_KEYS.map((k) => {
      const def = POINT_LAYERS[k];
      return [k, { visible: def.defaultVisible, style: defaultStyle(def), filter: defaultFilter(def) }];
    }),
  ) as PointLayerStates;
}

// ─── Saved settings ─────────────────────────────────────────────────────────

export const STATES_KEY = "webapp.map.pointLayers";
/** The sizes before they were made larger. Settings are saved whole, so a layer still at its old default was
 *  never changed by the person and moves to the new one. */
const PREVIOUS_DEFAULT_SIZE: Record<PointLayerKey, number> = { sites: 9, surveys: 13 };
/** Saved settings merged over the defaults, so a new category or option
 *  always has a value. */
export function loadStates(storage: Pick<Storage, "getItem"> = localStorage): PointLayerStates {
  const states = defaultStates();
  try {
    const saved = JSON.parse(storage.getItem(STATES_KEY) ?? "null") as Partial<
      Record<PointLayerKey, Partial<PointLayerState>>
    > | null;
    if (saved) {
      for (const k of POINT_LAYER_KEYS) {
        const s = saved[k];
        if (!s) continue;
        const style = { ...states[k].style, ...s.style, colors: { ...states[k].style.colors, ...s.style?.colors } };
        if (style.size === PREVIOUS_DEFAULT_SIZE[k]) style.size = POINT_LAYERS[k].defaultSize;
        // A saved choice of field that no longer exists falls back to the default.
        if (style.colorBy !== NO_FIELD && !POINT_LAYERS[k].fields.some((f) => f.key === style.colorBy)) {
          style.colorBy = POINT_LAYERS[k].defaultColorBy;
        }
        states[k] = {
          visible: typeof s.visible === "boolean" ? s.visible : states[k].visible,
          style,
          filter: {
            hidden: Array.isArray(s.filter?.hidden) ? s.filter.hidden : states[k].filter.hidden,
            flags: { ...states[k].filter.flags, ...s.filter?.flags },
          },
        };
      }
      return states;
    }
  } catch {
    // Unreadable settings: defaults.
  }
  return states;
}

export function saveStates(states: PointLayerStates) {
  try {
    localStorage.setItem(STATES_KEY, JSON.stringify(states));
  } catch {
    // Not saved (private mode / full storage).
  }
}

// ─── Data → GeoJSON ─────────────────────────────────────────────────────────

/** Every point carries `id`, `label` and one property per colour field (`type`, `status`…). */
export interface PointProps {
  id: string;
  label: string;
  [key: string]: string | number | boolean | null;
}

export interface SitePointIn {
  id: string;
  name: string;
  site_type: string;
  status?: string | null;
  latitude: number;
  longitude: number;
}
export interface SurveyPointIn {
  site_id: string;
  site_name: string;
  survey_id: string;
  survey_date: string;
  status: string;
  survey_count: number;
  latitude: number;
  longitude: number;
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
export function surveyCategory(s: Pick<SurveyPointIn, "status" | "survey_date">, now = Date.now()): string {
  const when = Date.parse(s.survey_date);
  if (Number.isFinite(when) && now - when > YEAR_MS) return "old";
  return s.status;
}

const point = (id: string, lng: number, lat: number, props: PointProps): Feature<Point, PointProps> => ({
  type: "Feature",
  id,
  geometry: { type: "Point", coordinates: [lng, lat] },
  properties: props,
});

export function sitesGeo(items: SitePointIn[]): FeatureCollection<Point, PointProps> {
  return {
    type: "FeatureCollection",
    features: items.map((s) =>
      point(s.id, s.longitude, s.latitude, {
        id: s.id,
        label: s.name,
        name: s.name,
        type: s.site_type,
        status: s.status === "archived" ? "archived" : "active",
        archived: s.status === "archived",
      }),
    ),
  };
}

export function surveysGeo(items: SurveyPointIn[], now = Date.now()): FeatureCollection<Point, PointProps> {
  return {
    type: "FeatureCollection",
    features: items.map((s) =>
      point(s.survey_id, s.longitude, s.latitude, {
        id: s.survey_id,
        site_id: s.site_id,
        status: surveyCategory(s, now),
        label: `${s.survey_count} survey${s.survey_count === 1 ? "" : "s"}`,
      }),
    ),
  };
}

// ─── Filtering (shared by the map, the legend and snapping) ─────────────────

/** Whether a point passes the layer's filter — the same rule as
 *  `filterExpression`, for code that works on the data (legend, snapping). */
type FilterInput = Pick<PointLayerState, "style" | "filter">;

export function passesFilter(key: PointLayerKey, state: FilterInput, props: PointProps): boolean {
  const field = activeField(POINT_LAYERS[key], state.style);
  // Values are only hidden within the field the layer is coloured by; one colour has no list to hide from.
  if (field && state.filter.hidden.includes(String(props[field.key]))) return false;
  if (key === "sites" && state.filter.flags.includeArchived === false && props.archived === true) return false;
  return true;
}

export function filterExpression(key: PointLayerKey, state: FilterInput): ExpressionSpecification {
  const field = activeField(POINT_LAYERS[key], state.style);
  const parts: ExpressionSpecification[] = [
    ["!", ["in", ["get", field?.key ?? "id"], ["literal", field ? state.filter.hidden : []]]],
  ];
  if (key === "sites" && state.filter.flags.includeArchived === false) {
    parts.push(["!=", ["get", "archived"], true]);
  }
  return ["all", ...parts];
}

/** How many of a layer's points pass its filter. */
export function countShown(key: PointLayerKey, state: FilterInput, geo: FeatureCollection<Point, PointProps>) {
  return geo.features.filter((f) => passesFilter(key, state, f.properties)).length;
}

export function isFiltered(key: PointLayerKey, state: FilterInput): boolean {
  const def = POINT_LAYERS[key];
  const { filter } = state;
  const hiddenByDefault = new Set(def.defaultHidden ?? []);
  if (
    activeField(def, state.style) &&
    (filter.hidden.length !== hiddenByDefault.size || filter.hidden.some((h) => !hiddenByDefault.has(h)))
  ) {
    return true;
  }
  if (key === "sites" && filter.flags.includeArchived === false) return true;
  return false;
}

// ─── Paint ──────────────────────────────────────────────────────────────────

export function colorExpression(def: PointLayerDef, style: PointLayerStyle): ExpressionSpecification | string {
  const field = activeField(def, style);
  if (!field) return style.color;
  const pairs = field.categories.flatMap((c) => [c.value, style.colors[c.value] ?? c.color]);
  const fallback = style.colors[field.categories[field.categories.length - 1].value] ?? RULE_GREY;
  return ["match", ["get", field.key], ...pairs, fallback] as unknown as ExpressionSpecification;
}

/** The colour of one record: `values` holds its value for each field (`{ type: "bridge", status: "active" }`). */
export function colorOfRecord(key: PointLayerKey, style: PointLayerStyle, values: Record<string, string>): string {
  const field = activeField(POINT_LAYERS[key], style);
  if (!field) return style.color;
  const category = field.categories.find((c) => c.value === values[field.key]);
  return style.colors[values[field.key]] ?? category?.color ?? RULE_GREY;
}

/** Full size from street level; no smaller than ~65% (and 4 px) zoomed out. */
export function radiusExpression(size: number): ExpressionSpecification {
  return ["interpolate", ["linear"], ["zoom"], 5, Math.max(4, Math.round(size * 0.65)), 14, size];
}

export const circleLayerId = (key: PointLayerKey) => `${key}-circle`;

/** Stroke width that grows by 2px while the feature's `hover` state is set (see MapPage). */
const hoverWidth = (base: number) => ["case", ["boolean", ["feature-state", "hover"], false], base + 2, base];
export const labelLayerId = (key: PointLayerKey) => `${key}-label`;
export const sourceId = (key: PointLayerKey) => key;
export const pointLayerIds = (key: PointLayerKey) => [circleLayerId(key), labelLayerId(key)];

/** Add (or refresh) a point layer's source and layers, then apply its
 *  style, filter and visibility. Safe after a base-map swap. */
export function ensurePointLayer(
  map: MapLibreMap,
  key: PointLayerKey,
  data: FeatureCollection<Point, PointProps>,
  state: PointLayerState,
) {
  const src = map.getSource(sourceId(key)) as GeoJSONSource | undefined;
  if (src) src.setData(data);
  // promoteId makes each feature addressable, so the pointer can set a hover state on it.
  else map.addSource(sourceId(key), { type: "geojson", data, promoteId: "id" });
  if (!map.getLayer(circleLayerId(key))) {
    map.addLayer({ id: circleLayerId(key), type: "circle", source: sourceId(key), paint: {} });
  }
  if (!map.getLayer(labelLayerId(key))) {
    map.addLayer({
      id: labelLayerId(key),
      type: "symbol",
      source: sourceId(key),
      // Names appear once zoomed in far enough to read, wrap long ones, keep clear of each other
      // and try the sides of the dot before giving up (zoomed out they were a pile of overlaps).
      minzoom: 8,
      layout: {
        "text-field": ["get", "label"],
        "text-variable-anchor": ["top", "bottom", "right", "left"],
        "text-radial-offset": 0.9,
        "text-max-width": 8,
        "text-padding": 4,
        "text-optional": true,
      },
    });
  }
  applyPointLayer(map, key, state);
}

export function applyPointLayer(map: MapLibreMap, key: PointLayerKey, state: PointLayerState) {
  const circle = circleLayerId(key);
  const label = labelLayerId(key);
  if (!map.getLayer(circle)) return;
  const def = POINT_LAYERS[key];
  const s = state.style;
  const color = colorExpression(def, s);
  map.setPaintProperty(circle, "circle-radius", radiusExpression(s.size));
  if (def.ring) {
    map.setPaintProperty(circle, "circle-color", TRANSPARENT);
    map.setPaintProperty(circle, "circle-stroke-color", color);
    map.setPaintProperty(circle, "circle-stroke-width", hoverWidth(3));
  } else {
    map.setPaintProperty(circle, "circle-color", color);
    // Hover: a dark ink ring, so it reads on a light basemap as well as a dark one.
    map.setPaintProperty(circle, "circle-stroke-color", ["case", ["boolean", ["feature-state", "hover"], false], INK, s.strokeColor]);
    map.setPaintProperty(circle, "circle-stroke-width", hoverWidth(1.5));
  }
  map.setPaintProperty(circle, "circle-opacity", s.opacity);
  map.setPaintProperty(circle, "circle-stroke-opacity", s.opacity);
  const filter = filterExpression(key, state);
  map.setFilter(circle, filter);
  map.setFilter(label, filter);
  map.setLayoutProperty(circle, "visibility", state.visible ? "visible" : "none");

  map.setLayoutProperty(label, "text-size", s.labelSize);
  map.setPaintProperty(label, "text-color", s.labelColor);
  map.setPaintProperty(label, "text-halo-color", WHITE);
  map.setPaintProperty(label, "text-halo-width", s.labelHalo ? 2 : 0);
  map.setPaintProperty(label, "text-halo-blur", 0.5);
  map.setLayoutProperty(label, "visibility", state.visible && s.showLabels ? "visible" : "none");
}

/** Legend rows: one per shown value of the field the layer is coloured by, merging values that share a
 *  colour. One colour, or one colour for every value, is just the layer's name ("Sites"). */
export function legendRows(
  key: PointLayerKey,
  state: PointLayerState,
  inside: PointProps[],
): { label: string; color: string; strokeColor: string; count: number; ring?: boolean }[] {
  const def = POINT_LAYERS[key];
  const shown = inside.filter((p) => passesFilter(key, state, p));
  const field = activeField(def, state.style);
  const byColor = new Map<string, { labels: string[]; count: number }>();
  if (!field) {
    if (shown.length) byColor.set(state.style.color, { labels: [], count: shown.length });
  } else {
    for (const c of field.categories) {
      const n = shown.filter((p) => p[field.key] === c.value).length;
      if (!n) continue;
      const color = state.style.colors[c.value] ?? c.color;
      const row = byColor.get(color) ?? { labels: [], count: 0 };
      row.labels.push(c.label);
      row.count += n;
      byColor.set(color, row);
    }
  }
  const single =
    byColor.size === 1 &&
    (!field || field.categories.every((c) => (state.style.colors[c.value] ?? c.color) === [...byColor.keys()][0]));
  return [...byColor.entries()].map(([color, row]) => ({
    label: single ? def.label : `${def.label}: ${row.labels.join(", ").toLowerCase()}`,
    color: def.ring ? WHITE : color,
    strokeColor: def.ring ? color : state.style.strokeColor,
    count: row.count,
    ring: def.ring,
  }));
}
