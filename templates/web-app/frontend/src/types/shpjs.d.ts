declare module "shpjs" {
  import type { FeatureCollection } from "geojson";
  type Parsed = FeatureCollection & { fileName?: string };
  export function parseZip(buffer: ArrayBuffer | Uint8Array, whiteList?: string[]): Promise<Parsed | Parsed[]>;
  const shp: (base: string | ArrayBuffer) => Promise<Parsed | Parsed[]>;
  export default shp;
}
