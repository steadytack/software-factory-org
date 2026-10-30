import { describe, expect, it } from "vitest";

import { addGeometry, nearestSnap, type SnapIndex } from "../src/components/map/utils/snap";

// 1 degree = 1000 px both ways: easy numbers.
const project = (lng: number, lat: number) => ({ x: lng * 1000, y: -lat * 1000 });
const at = (lng: number, lat: number) => ({ lng, lat, ...project(lng, lat) });

describe("snapping", () => {
  const index: SnapIndex = {
    points: [[0, 0]],
    segments: [
      [
        [1, 0],
        [1, 1],
      ],
    ],
  };

  it("snaps to a point within the tolerance", () => {
    expect(nearestSnap(index, at(0.005, 0.005), project, 12)).toEqual([0, 0]);
    expect(nearestSnap(index, at(0.02, 0), project, 12)).toBeUndefined();
  });

  it("otherwise to the nearest point on an edge", () => {
    const hit = nearestSnap(index, at(1.008, 0.5), project, 12)!;
    expect(hit[0]).toBeCloseTo(1);
    expect(hit[1]).toBeCloseTo(0.5);
  });

  it("prefers a corner to an edge", () => {
    const both: SnapIndex = { points: [[1, 0.5]], segments: index.segments };
    expect(nearestSnap(both, at(1.005, 0.505), project, 12)).toEqual([1, 0.5]);
  });

  it("indexes corners and edges near the view only", () => {
    const idx: SnapIndex = { points: [], segments: [] };
    const bounds = { west: -1, south: -1, east: 1, north: 1 };
    addGeometry(
      idx,
      { type: "Polygon", coordinates: [[[0, 0], [0.5, 0], [5, 5], [0, 0]]] },
      bounds,
      1000,
    );
    addGeometry(idx, { type: "Point", coordinates: [9, 9] }, bounds, 1000);
    expect(idx.points).toEqual([[0, 0], [0.5, 0], [0, 0]]);
    // Edges with at least one end in view: (0,0)-(0.5,0), (0.5,0)-(5,5), (5,5)-(0,0).
    expect(idx.segments).toHaveLength(3);
  });
});
