import type { Feature } from "geojson";
import { describe, expect, it, vi } from "vitest";

vi.mock("maplibre-gl", () => ({ default: {} }));

import {
  NO_FIELD,
  POINT_LAYERS,
  colorExpression,
  colorOfRecord,
  defaultStates,
  filterExpression,
  isFiltered,
  loadStates,
  passesFilter,
  surveyCategory,
} from "../src/components/map/layers/pointLayers";
import { filteredIndices, passesDataFilter, summariseProperties } from "../src/components/map/layers/dataFilter";
import { reconcileOrder } from "../src/components/map/layers/order";

const store = (items: Record<string, unknown>) => ({
  getItem: (k: string) => (k in items ? JSON.stringify(items[k]) : null),
});

describe("record layer settings", () => {
  it("start from the defaults: sites on, surveys off", () => {
    const s = defaultStates();
    expect(s.sites.visible).toBe(true);
    expect(s.surveys.visible).toBe(false);
    expect(s.surveys.style.colors.draft).toBe("#e2a03f");
  });

  it("start sites as one colour and surveys coloured by their latest status", () => {
    const s = defaultStates();
    expect(s.sites.style.colorBy).toBe(NO_FIELD);
    expect(s.surveys.style.colorBy).toBe("status");
  });

  it("move a layer still at the old default size to the new one, and leave a chosen size", () => {
    const old = loadStates(store({ "webapp.map.pointLayers": { sites: { style: { size: 9 } }, surveys: { style: { size: 13 } } } }));
    expect(old.sites.style.size).toBe(POINT_LAYERS.sites.defaultSize);
    expect(old.surveys.style.size).toBe(POINT_LAYERS.surveys.defaultSize);
    expect(loadStates(store({ "webapp.map.pointLayers": { sites: { style: { size: 15 } } } })).sites.style.size).toBe(15);
  });

  it("fall back to the default when a saved field no longer exists", () => {
    const s = loadStates(store({ "webapp.map.pointLayers": { sites: { style: { colorBy: "gone" } } } }));
    expect(s.sites.style.colorBy).toBe(NO_FIELD);
    expect(loadStates(store({ "webapp.map.pointLayers": { sites: { style: { colorBy: "status" } } } })).sites.style.colorBy).toBe("status");
  });

  it("merge saved settings over the defaults", () => {
    const s = loadStates(
      store({ "webapp.map.pointLayers": { surveys: { style: { colors: { draft: "#000" } }, filter: { hidden: ["old"] } } } }),
    );
    expect(s.surveys.style.colors).toMatchObject({ draft: "#000", completed: "#22a06b" });
    expect(s.surveys.filter.hidden).toEqual(["old"]);
    expect(s.sites.filter.flags.includeArchived).toBe(true);
  });
});

describe("filtering record layers", () => {
  const base = defaultStates().sites;
  const byType = { ...base, style: { ...base.style, colorBy: "type" } };
  it("hides values and archived sites, on the map and in code alike", () => {
    const onlyBridges = { ...byType, filter: { ...base.filter, hidden: ["building", "playground", "outfall", "other"] } };
    expect(passesFilter("sites", onlyBridges, { id: "1", label: "", type: "bridge" })).toBe(true);
    expect(passesFilter("sites", onlyBridges, { id: "1", label: "", type: "building" })).toBe(false);
    const activeOnly = { ...byType, filter: { ...base.filter, flags: { ...base.filter.flags, includeArchived: false } } };
    expect(passesFilter("sites", activeOnly, { id: "1", label: "", type: "bridge", archived: true })).toBe(false);
    expect(filterExpression("sites", activeOnly)).toEqual([
      "all",
      ["!", ["in", ["get", "type"], ["literal", []]]],
      ["!=", ["get", "archived"], true],
    ]);
    expect(isFiltered("sites", byType)).toBe(false);
    expect(isFiltered("sites", onlyBridges)).toBe(true);
    expect(isFiltered("surveys", defaultStates().surveys)).toBe(false);
  });

  it("hides nothing by value when the layer is one colour", () => {
    const oneColour = { ...base, filter: { ...base.filter, hidden: ["bridge"] } };
    expect(passesFilter("sites", oneColour, { id: "1", label: "", type: "bridge" })).toBe(true);
    expect(isFiltered("sites", oneColour)).toBe(false);
  });

  it("colour by a field, with the chosen colours", () => {
    const style = defaultStates().surveys.style;
    expect(colorExpression(POINT_LAYERS.surveys, { ...style, colors: { ...style.colors, draft: "#111" } })).toEqual([
      "match",
      ["get", "status"],
      "draft",
      "#111",
      "completed",
      "#22a06b",
      "old",
      "#8590a2",
      "#8590a2",
    ]);
  });

  it("colour by one colour, or by a different field", () => {
    const sites = defaultStates().sites.style;
    expect(colorExpression(POINT_LAYERS.sites, sites)).toBe(sites.color);
    const byStatus = { ...sites, colorBy: "status" };
    expect(colorExpression(POINT_LAYERS.sites, byStatus)).toEqual([
      "match",
      ["get", "status"],
      "active",
      "#22a06b",
      "archived",
      "#8590a2",
      "#8590a2",
    ]);
    expect(colorOfRecord("sites", sites, { type: "bridge", status: "active" })).toBe(sites.color);
    expect(colorOfRecord("sites", { ...sites, colorBy: "type", colors: { ...sites.colors, bridge: "#f00" } }, { type: "bridge" })).toBe("#f00");
  });

  it("treat a year-old survey as old", () => {
    const now = Date.parse("2026-09-28");
    expect(surveyCategory({ status: "completed", survey_date: "2025-06-01" }, now)).toBe("old");
    expect(surveyCategory({ status: "draft", survey_date: "2026-09-01" }, now)).toBe("draft");
  });
});

describe("filtering an uploaded layer on a property", () => {
  const at = (props: Record<string, unknown>): Feature => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [0, 51] },
    properties: props,
  });
  const features = [
    at({ zone: "Flood Zone 3", area: 5 }),
    at({ zone: "Flood Zone 2", area: 50 }),
    at({ zone: "Flood Zone 3", area: 500 }),
  ];

  it("lists each property's values, most common first", () => {
    const [area, zone] = summariseProperties(features);
    expect(zone).toMatchObject({ name: "zone", kind: "text", values: ["Flood Zone 3", "Flood Zone 2"] });
    // Few distinct numbers read better as values than a range.
    expect(area.kind).toBe("text");
  });

  it("keeps ticked values, or a number range", () => {
    expect(filteredIndices(features, { property: "zone", values: ["Flood Zone 3"] })).toEqual([0, 2]);
    expect(filteredIndices(features, { property: "area", min: 10, max: null })).toEqual([1, 2]);
    expect(filteredIndices(features, null)).toBeNull();
    expect(passesDataFilter({ property: "area", min: null, max: 10 }, { area: "not a number" })).toBe(false);
  });
});

describe("layer order", () => {
  it("places the survey ring under the site dots", () => {
    expect(reconcileOrder([], [])).toEqual(["sketches", "sites", "surveys"]);
    // A saved order from before surveys keeps its own order, new data goes just under Sites.
    expect(reconcileOrder(["sites", "sketches"], ["x"])).toEqual(["sites", "data:x", "surveys", "sketches"]);
  });
});
