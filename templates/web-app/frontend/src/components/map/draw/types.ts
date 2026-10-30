/**
 * Drawing tool types. Extracted from useMapDraw and re-exported from there so
 * existing imports keep working (hardening STR-1).
 */

import type { Geometry, GeoJsonProperties } from "geojson";
import type { MeasureSettings } from "../utils/measurement";
import type { HatchStyle } from "../utils/hatchPatterns";

export type DrawTool =
  | "select"
  | "point"
  | "note"
  | "line"
  | "polygon"
  | "circle"
  | "measure-distance"
  | "measure-area"
  | null;

export type LineStyle = "solid" | "dashed" | "dotted" | "longdash" | "shortdash";

export interface DrawFeature {
  id: string;
  layerId: string;
  kind: "marker" | "note" | "polyline" | "polygon" | "circle" | "measurement";
  name: string;
  visible: boolean;
  color: string;
  weight: number;
  lineStyle: LineStyle;
  fillOpacity: number;
  hatch: HatchStyle;
  label: string;
  labelSize: number;
  labelColor: string;
  /** Show length/area labels on this feature (always on for the
   *  Distance/Area tools; opt-in for ordinary sketches). */
  showMeasurements?: boolean;
  /** Label this sketch's coordinates: a marker's position, each point of a
   *  line, each corner (and optionally the centre) of a shape, a circle's
   *  centre. */
  showCoordinates?: boolean;
  geometry: Geometry;
  properties: GeoJsonProperties;
}

export interface DrawLayer {
  id: string;
  name: string;
  visible: boolean;
  collapsed: boolean;
  color: string;
  hatch: HatchStyle;
  fillOpacity: number;
  lineStyle: LineStyle;
  weight: number;
}

export interface DrawState {
  activeTool: DrawTool;
  features: DrawFeature[];
  layers: DrawLayer[];
  measureSettings: MeasureSettings;
  snapEnabled: boolean;
}