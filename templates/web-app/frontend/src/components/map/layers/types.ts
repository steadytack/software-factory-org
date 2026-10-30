/**
 * Types and defaults for map data layers (GeoJSON / PMTiles reference
 * overlays). Extracted from useMapLayers so the hook file holds only the
 * hook, and re-exported from there to keep the public import surface stable.
 */

import type { FeatureCollection } from "geojson";
import type { HatchStyle } from "../utils/hatchPatterns";
import type { DataLayerFilter } from "./dataFilter";
import { BRAND_BLUE, BRAND_BLUE_DEEP, LABEL_BG, WHITE } from "./colors";

export type PointShape =
  | "circle"
  | "square"
  | "diamond"
  | "triangle"
  | "star"
  | "pin"
  | "plus"
  | "cross"
  | "target";

export interface DataLayerStyle {
  fillColor: string;
  fillOpacity: number;
  fillPattern: HatchStyle;
  hatchColor: string;
  hatchScale: number;
  strokeColor: string;
  strokeWidth: number;
  lineStyle: "solid" | "dashed" | "dotted" | "longdash" | "shortdash";
  pointRadius: number;
  pointColor: string;
  pointShape: PointShape;
  labelField: string;
  labelSize: number;
  labelColor: string;
  labelHalo: boolean;
  labelBackground: boolean;
  labelBackgroundColor: string;
  labelBackgroundOpacity: number;
}

export interface MapDataLayer {
  id: string;
  name: string;
  type: "geojson" | "pmtiles" | "wms";
  visible: boolean;
  collapsed: boolean;
  data?: FeatureCollection;
  url?: string;
  /** Attribution shown for externally-sourced layers (WMS/WFS/OGC API Features). */
  attribution?: string;
  /** The service's legend picture for a WMS layer, printed in the sheet's legend when the server allows it. */
  legendUrl?: string;
  style: DataLayerStyle;
  featureCount: number;
  /** Where a WFS / OGC API layer came from, so it can be fetched again
   *  for a new view. */
  service?: { type: "wfs" | "ogc-features"; url: string; id: string };
  /** Show only features matching one property (uploaded GeoJSON). */
  filter?: DataLayerFilter | null;
}

export const DEFAULT_DATA_LAYER_STYLE: DataLayerStyle = {
  fillColor: BRAND_BLUE,
  fillOpacity: 0.35,
  fillPattern: "none",
  hatchColor: BRAND_BLUE_DEEP,
  hatchScale: 1,
  strokeColor: BRAND_BLUE_DEEP,
  strokeWidth: 1.5,
  lineStyle: "solid",
  pointRadius: 6,
  pointColor: BRAND_BLUE,
  pointShape: "circle",
  labelField: "",
  labelSize: 11,
  labelColor: WHITE,
  labelHalo: true,
  labelBackground: false,
  labelBackgroundColor: LABEL_BG,
  labelBackgroundOpacity: 0.7,
};

export interface LayerStylePreset {
  name: string;
  style: Partial<DataLayerStyle>;
}
