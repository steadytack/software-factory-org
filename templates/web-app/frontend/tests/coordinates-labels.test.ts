import { describe, expect, it, vi } from "vitest";

vi.mock("maplibre-gl", () => ({ default: {} }));

import { coordinateLabels, coordinatePositions } from "../src/components/map/draw/overlay";
import { formatCoordinate, formatEN, latLngToEN } from "../src/components/map/utils/coordinates";
import { DEFAULT_MEASURE_SETTINGS } from "../src/components/map/utils/measurement";
import type { DrawFeature } from "../src/components/map/draw/types";

const square = [
  [-0.1, 51.5],
  [-0.09, 51.5],
  [-0.09, 51.51],
  [-0.1, 51.51],
  [-0.1, 51.5],
];

describe("coordinates", () => {
  it("write BNG as whole metres with no thousands separators", () => {
    expect(formatEN(625597.4, 245940.6)).toBe("625597, 245941");
    const en = latLngToEN(51.5, -0.1)!;
    expect(formatCoordinate(-0.1, 51.5, "bng")).toBe(formatEN(en.e, en.n));
    expect(formatCoordinate(-0.1, 51.5, "gridref")).toMatch(/^TQ \d{5} \d{5}$/);
    expect(formatCoordinate(-0.1, 51.5, "latlng")).toBe("51.50000, -0.10000");
    // Outside Great Britain BNG falls back to lat/long.
    expect(formatCoordinate(2.35, 48.85, "bng")).toBe("48.85000, 2.35000");
  });

  it("are shown at a marker, each line point, shape corners (+ centre) and a circle's centre", () => {
    expect(coordinatePositions({ kind: "marker", geometry: { type: "Point", coordinates: [1, 2] } }, true)).toEqual([[1, 2]]);
    expect(
      coordinatePositions({ kind: "polyline", geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] } }, true),
    ).toHaveLength(2);
    const poly = { kind: "polygon" as const, geometry: { type: "Polygon" as const, coordinates: [square] } };
    expect(coordinatePositions(poly, false)).toHaveLength(4);
    const withCentre = coordinatePositions(poly, true);
    expect(withCentre).toHaveLength(5);
    expect(withCentre[4][0]).toBeCloseTo(-0.095);
    expect(withCentre[4][1]).toBeCloseTo(51.505);
    expect(coordinatePositions({ ...poly, kind: "circle" }, true)).toHaveLength(1);
  });

  it("are only labelled for sketches with Show coordinates on", () => {
    const base = {
      id: "a",
      kind: "marker",
      visible: true,
      geometry: { type: "Point", coordinates: [-0.1, 51.5] },
    } as unknown as DrawFeature;
    expect(coordinateLabels([base], DEFAULT_MEASURE_SETTINGS)).toHaveLength(0);
    const labels = coordinateLabels([{ ...base, showCoordinates: true }], DEFAULT_MEASURE_SETTINGS);
    expect(labels).toHaveLength(1);
    expect(labels[0].properties?.label).toMatch(/^\d{6}, \d{6}$/);
  });

  it("number a sketch's labels in order, the centre last, so crowded ones give way in that order", () => {
    const square = {
      id: "s",
      kind: "polygon",
      visible: true,
      showCoordinates: true,
      geometry: { type: "Polygon", coordinates: [[[-0.1, 51.5], [-0.09, 51.5], [-0.09, 51.51], [-0.1, 51.51], [-0.1, 51.5]]] },
    } as unknown as DrawFeature;
    const labels = coordinateLabels([square], { ...DEFAULT_MEASURE_SETTINGS, coordCentre: true });
    expect(labels.map((l) => l.properties?.order)).toEqual([0, 1, 2, 3, 4]);
  });
});
