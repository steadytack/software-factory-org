import { describe, expect, it } from "vitest";
import type { FeatureCollection } from "geojson";

import {
  ImportError,
  MAX_FILE_MB,
  checkSize,
  declaredCrs,
  detectCrs,
  parseData,
  toWgs84,
} from "../src/components/map/utils/importData";
import { fixAxisOrder, wfsFeaturesUrl } from "../src/components/map/layers/external";

const fc = (coordinates: number[][][], crs?: string): FeatureCollection =>
  ({
    type: "FeatureCollection",
    ...(crs ? { crs: { type: "name", properties: { name: crs } } } : {}),
    features: [{ type: "Feature", properties: { zone: "3" }, geometry: { type: "Polygon", coordinates } }],
  }) as FeatureCollection;

// Near Westminster, in British National Grid metres.
const bngSquare = [[[530000, 180000], [530100, 180000], [530100, 180100], [530000, 180000]]];

describe("adding a data file", () => {
  it("refuses files too big for the browser, and says what to do instead", () => {
    expect(() => checkSize("flood.geojson", (MAX_FILE_MB + 1) * 1024 * 1024)).toThrow(/WMS/);
    expect(checkSize("big.geojson", 30 * 1024 * 1024)).toMatch(/slow/);
    expect(checkSize("small.geojson", 1024)).toBeNull();
  });

  it("recognises British National Grid, declared or not", () => {
    expect(declaredCrs(fc(bngSquare, "urn:ogc:def:crs:EPSG::27700"))).toBe("EPSG:27700");
    expect(detectCrs(fc(bngSquare))).toBe("EPSG:27700");
    expect(detectCrs(fc([[[-0.1, 51.5], [-0.09, 51.5], [-0.1, 51.51], [-0.1, 51.5]]]))).toBe("EPSG:4326");
  });

  it("converts BNG to longitude/latitude, keeping properties", () => {
    const { data, note } = toWgs84(fc(bngSquare, "EPSG:27700"));
    expect(note).toMatch(/British National Grid/);
    const [lng, lat] = (data.features[0].geometry as { coordinates: number[][][] }).coordinates[0][0];
    expect(lng).toBeCloseTo(-0.1284, 3);
    expect(lat).toBeCloseTo(51.504, 3);
    expect(data.features[0].properties).toEqual({ zone: "3" });
    expect((data as { crs?: unknown }).crs).toBeUndefined();
  });

  it("parses GeoJSON files, and refuses what it can't read with a reason", async () => {
    const buf = new TextEncoder().encode(JSON.stringify(fc(bngSquare))).buffer;
    const [layer] = await parseData("zones.geojson", buf);
    expect(layer.name).toBe("zones");
    expect(layer.notes).toEqual(["Converted from British National Grid."]);
    await expect(parseData("x.geojson", new TextEncoder().encode("{").buffer)).rejects.toThrow(ImportError);
    await expect(parseData("x.gpkg", new ArrayBuffer(1))).rejects.toThrow(/only GeoJSON/);
  });
});

describe("web feature services", () => {
  it("ask for the current view only, with a limit", () => {
    const url = wfsFeaturesUrl("https://example.com/wfs", "zones", { west: -1, south: 51, east: 0, north: 52 }, 5000);
    expect(url).toContain("count=5000");
    expect(url).toContain("bbox=-1.000000,51.000000,0.000000,52.000000,urn:ogc:def:crs:OGC:1.3:CRS84");
  });

  it("put latitude/longitude answers the right way round", () => {
    const swapped: FeatureCollection = {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [51.5, -0.1] } }],
    };
    expect((fixAxisOrder(swapped).features[0].geometry as { coordinates: number[] }).coordinates).toEqual([-0.1, 51.5]);
  });
});

describe("zipped shapefiles", () => {
  it("are read, and converted from the .prj's British National Grid", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const zip = readFileSync(resolve(__dirname, "fixtures/flood-zone-sample.zip"));
    const [layer] = await parseData("flood-zone-sample.zip", zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength));
    expect(layer.name).toBe("flood-zone-sample");
    expect(layer.data.features).toHaveLength(1);
    expect(layer.data.features[0].properties).toMatchObject({ ZONE: "FZ3" });
    const [lng, lat] = (layer.data.features[0].geometry as { coordinates: number[][][] }).coordinates[0][0];
    // Same place as the BNG conversion of the GeoJSON test above.
    expect(lng).toBeCloseTo(-0.12835, 5);
    expect(lat).toBeCloseTo(51.50399, 5);
  });
});
