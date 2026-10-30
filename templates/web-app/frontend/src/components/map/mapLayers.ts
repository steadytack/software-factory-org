/**
 * Basemap layer registry — ported from the reference template's mapLayers.ts.
 * All raster layers use raster tile URLs. Free layers (OSM, Esri) work with
 * no API key. (Carto's basemaps were dropped: without a key their tiles are
 * now stamped "API KEY REQUIRED".) OS layers need osKey; MapTiler layers need maptilerKey.
 * If a key-required layer has no key, a sensible free fallback is used.
 */

export type BaseLayerKey =
  | "os-road"
  | "os-outdoor"
  | "os-light"
  | "osm"
  | "esri-light"
  | "esri-dark"
  | "esri-topo"
  | "esri-imagery"
  | "maptiler-basic"
  | "maptiler-bright"
  | "maptiler-streets"
  | "maptiler-topo"
  | "maptiler-satellite"
  | "maptiler-hybrid"
  | "maptiler-dark";

export interface MapApiConfig {
  maptilerKey?: string;
  osKey?: string;
}

export interface BaseLayer {
  key: BaseLayerKey;
  label: string;
  group: string;
  attribution: string;
  requiresKey?: "maptiler" | "os";
  getStyle: (cfg: MapApiConfig) => string | object;
}

const GLYPHS = "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";

/** Build a minimal MapLibre style object wrapping a raster tile URL. */
function rasterStyle(tilesUrl: string, attribution: string, tileSize = 256, maxzoom?: number): object {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      raster: { type: "raster", tiles: [tilesUrl], tileSize, attribution, ...(maxzoom ? { maxzoom } : {}) },
    },
    layers: [{ id: "raster", type: "raster", source: "raster" }],
  };
}

const OSM_FALLBACK = rasterStyle(
  "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "&copy; <a href='https://openstreetmap.org/copyright'>OpenStreetMap</a> contributors",
);

const ESRI_CANVAS_ATTRIBUTION = "Esri, HERE, Garmin, &copy; OpenStreetMap contributors";

// The Esri canvas basemaps have no tiles past zoom 16; maxzoom makes MapLibre stretch the last
// level instead of asking for tiles that come back as "Map data not yet available".
const ESRI_CANVAS_MAX_ZOOM = 16;

const ESRI_LIGHT_FALLBACK = rasterStyle(
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  ESRI_CANVAS_ATTRIBUTION,
  256,
  ESRI_CANVAS_MAX_ZOOM,
);

const ESRI_DARK_FALLBACK = rasterStyle(
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  ESRI_CANVAS_ATTRIBUTION,
  256,
  ESRI_CANVAS_MAX_ZOOM,
);

const ESRI_TOPO_FALLBACK = rasterStyle(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
  "Esri, HERE, Garmin, Intermap, USGS, METI/NASA",
);

const ESRI_IMG_FALLBACK = rasterStyle(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  "Esri, Maxar, Earthstar Geographics",
);

const OS_ATTRIBUTION = "© Crown copyright and database rights Ordnance Survey";
// The OS Maps API serves its Web Mercator tiles from zoom 7 up, so below that the map is a plain grey
// base (the same Esri canvas used elsewhere) and the OS tiles take over.
const OS_MIN_ZOOM = 7;

function osStyle(product: "Road" | "Outdoor" | "Light", key: string): object {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      low: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: ESRI_CANVAS_MAX_ZOOM,
        attribution: ESRI_CANVAS_ATTRIBUTION,
      },
      os: {
        type: "raster",
        tiles: [`https://api.os.uk/maps/raster/v1/zxy/${product}_3857/{z}/{x}/{y}.png?key=${key}`],
        tileSize: 256,
        minzoom: OS_MIN_ZOOM,
        maxzoom: 20,
        attribution: OS_ATTRIBUTION,
      },
    },
    layers: [
      { id: "low", type: "raster", source: "low", maxzoom: OS_MIN_ZOOM },
      { id: "os", type: "raster", source: "os", minzoom: OS_MIN_ZOOM },
    ],
  };
}

export const BASE_LAYERS: BaseLayer[] = [
  // ── Ordnance Survey ────────────────────────────────────────────────────
  {
    key: "os-road",
    label: "OS Road",
    group: "Ordnance Survey",
    attribution: "© Crown copyright and database rights Ordnance Survey",
    requiresKey: "os",
    getStyle: (cfg) =>
      cfg.osKey ? osStyle("Road", cfg.osKey) : OSM_FALLBACK,
  },
  {
    key: "os-outdoor",
    label: "OS Outdoor",
    group: "Ordnance Survey",
    attribution: "© Crown copyright and database rights Ordnance Survey",
    requiresKey: "os",
    getStyle: (cfg) =>
      cfg.osKey ? osStyle("Outdoor", cfg.osKey) : OSM_FALLBACK,
  },
  {
    key: "os-light",
    label: "OS Light",
    group: "Ordnance Survey",
    attribution: "© Crown copyright and database rights Ordnance Survey",
    requiresKey: "os",
    getStyle: (cfg) =>
      cfg.osKey ? osStyle("Light", cfg.osKey) : OSM_FALLBACK,
  },
  // ── OpenStreetMap ───────────────────────────────────────────────────────
  {
    key: "osm",
    label: "OpenStreetMap",
    group: "OpenStreetMap",
    attribution:
      "&copy; <a href='https://openstreetmap.org/copyright'>OpenStreetMap</a> contributors",
    getStyle: () => OSM_FALLBACK,
  },
  // ── Esri ────────────────────────────────────────────────────────────────
  {
    key: "esri-light",
    label: "Esri Light Gray",
    group: "Esri",
    attribution: ESRI_CANVAS_ATTRIBUTION,
    getStyle: () => ESRI_LIGHT_FALLBACK,
  },
  {
    key: "esri-dark",
    label: "Esri Dark Gray",
    group: "Esri",
    attribution: ESRI_CANVAS_ATTRIBUTION,
    getStyle: () => ESRI_DARK_FALLBACK,
  },
  {
    key: "esri-topo",
    label: "Esri World Topo",
    group: "Esri",
    attribution: "Esri, HERE, Garmin, Intermap, USGS, METI/NASA",
    getStyle: () => ESRI_TOPO_FALLBACK,
  },
  {
    key: "esri-imagery",
    label: "Esri World Imagery",
    group: "Esri",
    attribution: "Esri, Maxar, Earthstar Geographics",
    getStyle: () => ESRI_IMG_FALLBACK,
  },
  // ── MapTiler (key-required, free fallbacks) ────────────────────────────
  {
    key: "maptiler-basic",
    label: "MapTiler Basic",
    group: "MapTiler",
    attribution: "&copy; MapTiler &copy; OpenStreetMap contributors",
    requiresKey: "maptiler",
    getStyle: (cfg) =>
      cfg.maptilerKey
        ? rasterStyle(
            `https://api.maptiler.com/maps/basic/{z}/{x}/{y}.png?key=${cfg.maptilerKey}`,
            "&copy; MapTiler &copy; OpenStreetMap contributors",
          )
        : OSM_FALLBACK,
  },
  {
    key: "maptiler-bright",
    label: "MapTiler Bright",
    group: "MapTiler",
    attribution: "&copy; MapTiler &copy; OpenStreetMap contributors",
    requiresKey: "maptiler",
    getStyle: (cfg) =>
      cfg.maptilerKey
        ? rasterStyle(
            `https://api.maptiler.com/maps/bright/{z}/{x}/{y}.png?key=${cfg.maptilerKey}`,
            "&copy; MapTiler &copy; OpenStreetMap contributors",
          )
        : OSM_FALLBACK,
  },
  {
    key: "maptiler-streets",
    label: "MapTiler Streets",
    group: "MapTiler",
    attribution: "&copy; MapTiler &copy; OpenStreetMap contributors",
    requiresKey: "maptiler",
    getStyle: (cfg) =>
      cfg.maptilerKey
        ? rasterStyle(
            `https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=${cfg.maptilerKey}`,
            "&copy; MapTiler &copy; OpenStreetMap contributors",
          )
        : OSM_FALLBACK,
  },
  {
    key: "maptiler-topo",
    label: "MapTiler Topo",
    group: "MapTiler",
    attribution: "&copy; MapTiler &copy; OpenStreetMap contributors",
    requiresKey: "maptiler",
    getStyle: (cfg) =>
      cfg.maptilerKey
        ? rasterStyle(
            `https://api.maptiler.com/maps/topo/{z}/{x}/{y}.png?key=${cfg.maptilerKey}`,
            "&copy; MapTiler &copy; OpenStreetMap contributors",
          )
        : ESRI_TOPO_FALLBACK,
  },
  {
    key: "maptiler-satellite",
    label: "MapTiler Satellite",
    group: "MapTiler",
    attribution: "&copy; MapTiler",
    requiresKey: "maptiler",
    getStyle: (cfg) =>
      cfg.maptilerKey
        ? rasterStyle(
            `https://api.maptiler.com/maps/satellite/{z}/{x}/{y}.jpg?key=${cfg.maptilerKey}`,
            "&copy; MapTiler",
          )
        : ESRI_IMG_FALLBACK,
  },
  {
    key: "maptiler-hybrid",
    label: "MapTiler Hybrid",
    group: "MapTiler",
    attribution: "&copy; MapTiler &copy; OpenStreetMap contributors",
    requiresKey: "maptiler",
    getStyle: (cfg) =>
      cfg.maptilerKey
        ? rasterStyle(
            `https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.jpg?key=${cfg.maptilerKey}`,
            "&copy; MapTiler &copy; OpenStreetMap contributors",
          )
        : ESRI_IMG_FALLBACK,
  },
  {
    key: "maptiler-dark",
    label: "MapTiler Dark",
    group: "MapTiler",
    attribution: "&copy; MapTiler &copy; OpenStreetMap contributors",
    requiresKey: "maptiler",
    getStyle: (cfg) =>
      cfg.maptilerKey
        ? rasterStyle(
            `https://api.maptiler.com/maps/darkmatter/{z}/{x}/{y}.png?key=${cfg.maptilerKey}`,
            "&copy; MapTiler &copy; OpenStreetMap contributors",
          )
        : ESRI_DARK_FALLBACK,
  },
];

export const BASE_LAYER_MAP = new Map<BaseLayerKey, BaseLayer>(
  BASE_LAYERS.map((l) => [l.key, l]),
);

/** Default layer shown on first load: a muted grey basemap that follows the theme, so markers and
 *  overlays carry the colour. Anyone can pick another from the Layers tab. */
export function defaultLayerFor(theme: "light" | "dark"): BaseLayerKey {
  return theme === "dark" ? "esri-dark" : "esri-light";
}

export const DEFAULT_LAYER: BaseLayerKey = "esri-light";

/** UK home view */
export const HOME_VIEW = { center: [-2.5, 54.6] as [number, number], zoom: 4 };
