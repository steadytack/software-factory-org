import { describe, expect, it } from "vitest";

import type { DrawFeature } from "../src/components/map/draw/types";
import { csvCell, nextName, sketchesToCSV, sketchesToGeoJSON } from "../src/components/map/draw/export";
import { addGeometry, nearestSnap, roundCoordinate, roundGeometry, type SnapIndex } from "../src/components/map/utils/snap";
import { SKETCHES_KEY, importedStyle, loadSketches, saveSketches, storeFeature } from "../src/components/map/draw/persist";

const base: Omit<DrawFeature, "id" | "kind" | "name" | "geometry"> = {
  layerId: "l",
  visible: true,
  color: "#123456",
  weight: 3,
  lineStyle: "dashed",
  fillOpacity: 0.4,
  hatch: "none",
  label: "",
  labelSize: 13,
  labelColor: "#000",
  properties: {},
};
const marker: DrawFeature = { ...base, id: "m", kind: "marker", name: "Marker 1", geometry: { type: "Point", coordinates: [-0.09, 51.5] } };
const line: DrawFeature = {
  ...base,
  id: "l1",
  kind: "polyline",
  name: 'Line "A", north',
  label: "=cmd",
  geometry: { type: "LineString", coordinates: [[-0.1, 51.5], [-0.09, 51.5]] },
};
const shape: DrawFeature = {
  ...base,
  id: "s",
  kind: "polygon",
  name: "Shape 1",
  geometry: { type: "Polygon", coordinates: [[[-0.1, 51.5], [-0.09, 51.5], [-0.09, 51.51], [-0.1, 51.51], [-0.1, 51.5]]] },
};

describe("naming a new sketch", () => {
  it("numbers each kind on its own, after the highest already used", () => {
    expect(nextName("Line", [])).toBe("Line 1");
    expect(nextName("Line", [{ name: "Line 1" }, { name: "Shape 4" }])).toBe("Line 2");
    expect(nextName("Line", [{ name: "Line 1" }, { name: "Line 3" }])).toBe("Line 4");
    expect(nextName("Distance", [{ name: "My Distance 9" }])).toBe("Distance 1");
  });
});

describe("exporting sketches", () => {
  it("writes GeoJSON that keeps each sketch's name and style", () => {
    const fc = sketchesToGeoJSON([marker, line]);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[1].properties).toMatchObject({ name: 'Line "A", north', kind: "polyline", color: "#123456", weight: 3, lineStyle: "dashed" });
    expect(fc.features[1].geometry.type).toBe("LineString");
  });

  it("writes a CSV row for every sketch, whatever its kind", () => {
    const rows = sketchesToCSV([marker, line, shape]).split("\n");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toBe("name,kind,label,latitude,longitude,length_m,area_m2");
    const cols = rows.map((r) => r.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.length);
    // Marker: position, no length or area
    expect(rows[1]).toMatch(/^Marker 1,Marker,,51\.5000000,-0\.0900000,,$/);
    // Line: a length; shape: a length (perimeter) and an area
    expect(rows[2].split(",").at(-2)).not.toBe("");
    expect(Number(rows[3].split(",").at(-1))).toBeGreaterThan(700_000);
    expect(cols.every((n) => n >= 7)).toBe(true);
  });

  it("quotes cells that need it and defuses formulas", () => {
    expect(csvCell('Line "A", north')).toBe('"Line ""A"", north"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell(null)).toBe("");
    expect(sketchesToCSV([line]).split("\n")[1]).toContain("'=cmd");
  });
});

describe("snapping a sketch to another kind of sketch", () => {
  const project = (lng: number, lat: number) => ({ x: lng * 100000, y: -lat * 100000 });
  const index: SnapIndex = { points: [], segments: [] };
  addGeometry(index, shape.geometry, { west: -180, south: -90, east: 180, north: 90 }, 1000);

  it("finds a shape's corner for a point near it", () => {
    const cursor = { lng: -0.09995, lat: 51.50005, ...project(-0.09995, 51.50005) };
    expect(nearestSnap(index, cursor, project, 12)).toEqual([-0.1, 51.5]);
  });

  it("rounds a snapped position to the precision the drawing store accepts", () => {
    expect(roundCoordinate([-0.123456789012345, 51.50000000001234])).toEqual([-0.123456789, 51.5]);
  });
});

describe("keeping sketches in the browser", () => {
  const memory = () => {
    const items: Record<string, string> = {};
    return { getItem: (k: string) => items[k] ?? null, setItem: (k: string, v: string) => void (items[k] = v), items };
  };

  it("saves and loads the sketches as they were", () => {
    const store = memory();
    saveSketches([marker, line, shape], store);
    const back = loadSketches(store);
    expect(back.map((f) => f.id)).toEqual(["m", "l1", "s"]);
    expect(back[1]).toMatchObject({ name: 'Line "A", north', color: "#123456", lineStyle: "dashed", weight: 3 });
  });

  it("starts empty when there is nothing, or something that isn't ours", () => {
    expect(loadSketches(memory())).toEqual([]);
    for (const bad of ["not json", '{"v":99,"features":[]}', '{"v":1,"features":"x"}', "null"]) {
      expect(loadSketches({ getItem: () => bad })).toEqual([]);
    }
  });

  it("drops a saved sketch that is not a real one, and keeps the rest", () => {
    const store = memory();
    store.setItem(
      SKETCHES_KEY,
      JSON.stringify({
        v: 1,
        features: [marker, { id: "x", kind: "marker", name: "Bad", geometry: { type: "Point", coordinates: ["a", 1] } }, { id: "y", kind: "dragon", name: "Z", geometry: marker.geometry }, 7],
      }),
    );
    expect(loadSketches(store).map((f) => f.id)).toEqual(["m"]);
  });

  it("fills in what an older save left out", () => {
    const store = memory();
    store.setItem(SKETCHES_KEY, JSON.stringify({ v: 1, features: [{ id: "m", kind: "marker", name: "Marker 1", geometry: marker.geometry }] }));
    expect(loadSketches(store)[0]).toMatchObject({ visible: true, weight: 2, lineStyle: "solid", fillOpacity: 0.3, label: "" });
  });

  it("tells the drawing store each sketch's kind, and a circle's radius", () => {
    expect(storeFeature(marker).properties).toEqual({ mode: "point" });
    expect(storeFeature(line).properties).toEqual({ mode: "linestring" });
    expect(storeFeature(shape).properties).toEqual({ mode: "polygon" });
    const circle: DrawFeature = { ...shape, id: "c", kind: "circle", properties: { radiusKilometers: 0.5 } };
    expect(storeFeature(circle).properties).toEqual({ mode: "circle", radiusKilometers: 0.5 });
  });

  it("rounds an imported geometry to the store's precision", () => {
    const g = roundGeometry({ type: "LineString", coordinates: [[-0.123456789012, 51.1234567890123], [0, 1]] });
    expect(g.coordinates[0]).toEqual([-0.123456789, 51.123456789]);
  });
});

describe("importedStyle", () => {
  it("keeps a style the file gives with the right types", () => {
    expect(importedStyle({ name: "Gate", color: "#ff0000", weight: 4, lineStyle: "dotted", fillOpacity: 0.5, label: "A" }, "#000")).toEqual({
      name: "Gate", color: "#ff0000", weight: 4, lineStyle: "dotted", fillOpacity: 0.5, label: "A",
    });
  });

  it("falls back to the defaults for missing or wrongly typed values", () => {
    expect(importedStyle({ name: 7, color: null, weight: "4", lineStyle: "wavy", fillOpacity: Number.NaN, label: {} }, "#1556c0")).toEqual({
      color: "#1556c0", weight: 2, lineStyle: "solid", fillOpacity: 0.3, label: "",
    });
    expect(importedStyle(null, "#1556c0")).toEqual({ color: "#1556c0", weight: 2, lineStyle: "solid", fillOpacity: 0.3, label: "" });
  });
});
