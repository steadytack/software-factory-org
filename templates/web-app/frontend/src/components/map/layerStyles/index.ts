/** Bundled layer style presets — loaded statically so they are always available. */
import type { LayerStylePreset } from "../hooks/useMapLayers";

import ukSites from "./uk-sites.json";
import greenPolygons from "./green-polygons.json";
import amberLines from "./amber-lines.json";
import redHazards from "./red-hazards.json";

export const LAYER_PRESETS: LayerStylePreset[] = [
  ukSites as LayerStylePreset,
  greenPolygons as LayerStylePreset,
  amberLines as LayerStylePreset,
  redHazards as LayerStylePreset,
];
