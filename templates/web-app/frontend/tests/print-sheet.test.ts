import { describe, expect, it, vi } from "vitest";

// The sheet maths don't need a map engine (jsdom can't load maplibre).
vi.mock("maplibre-gl", () => ({ default: {} }));

import { coordinateRows, mapShare, safeDpi, sheetFileName, sheetLayout } from "../src/components/map/utils/printMap";
import { osGridRef } from "../src/components/map/utils/coordinates";
import {
  countriesIn,
  countryAt,
  geometryTouches,
  legendFor,
  makeLocationDescriber,
  type LegendSources,
} from "../src/components/map/utils/printContent";
import {
  defaultStates,
  sitesGeo,
  surveysGeo,
  type PointLayerState,
} from "../src/components/map/layers/pointLayers";

describe("sheet layout", () => {
  it("gives the map about 70% of the sheet (it had 56%)", () => {
    const land = sheetLayout("a4", "landscape");
    expect(land.panelSide).toBe("right");
    expect(mapShare(land)).toBeGreaterThan(0.66);
    const port = sheetLayout("a4", "portrait");
    expect(port.panelSide).toBe("bottom");
    expect(mapShare(port)).toBeGreaterThan(0.7);
    for (const paper of ["a4", "a3"] as const) {
      for (const o of ["landscape", "portrait"] as const) {
        const l = sheetLayout(paper, o);
        // Map and panel stay on the page and don't overlap.
        expect(l.map.x + l.map.w).toBeLessThanOrEqual(l.page.w - 7 + 1e-9);
        expect(l.panel.y + l.panel.h).toBeLessThanOrEqual(l.page.h - 7 + 1e-9);
        if (o === "landscape") expect(l.map.x + l.map.w).toBeLessThan(l.panel.x);
        else expect(l.map.y + l.map.h).toBeLessThan(l.panel.y);
      }
    }
  });

  it("keeps the map image within what phones can render", () => {
    expect(safeDpi(sheetLayout("a4", "landscape"), 300)).toBe(300);
    const a3 = sheetLayout("a3", "landscape");
    const dpi = safeDpi(a3, 300);
    expect((Math.max(a3.map.w, a3.map.h) / 25.4) * dpi).toBeLessThanOrEqual(4000);
  });

  it("names the file after the title and date", () => {
    expect(sheetFileName("North Pier: site plan!", new Date("2026-09-27T10:00:00Z"))).toBe("north-pier-site-plan-2026-09-27");
    expect(sheetFileName("", new Date("2026-09-27T10:00:00Z"))).toBe("map-2026-09-27");
  });
});

describe("OS grid references", () => {
  it("formats 10-, 8- and 6-figure references", () => {
    expect(osGridRef(530000, 180000)).toBe("TQ 30000 80000");
    expect(osGridRef(532700.4, 180399.9)).toBe("TQ 32700 80399");
    expect(osGridRef(532765, 180399, 6)).toBe("TQ 327 803");
    expect(osGridRef(216000, 771000, 8)).toBe("NN 1600 7100"); // Ben Nevis
    expect(osGridRef(-1, 0)).toBeNull();
  });
});

const B = { west: -0.1, south: 51.5, east: -0.08, north: 51.51 };
const TODAY = new Date().toISOString().slice(0, 10);

describe("the sheet legend", () => {
  const states = defaultStates();
  const src: LegendSources = {
    order: ["sketches", "surveys", "sites"],
    points: {
      sites: {
        state: states.sites,
        geo: sitesGeo([
          { id: "s1", name: "A", site_type: "bridge", latitude: 51.505, longitude: -0.09 },
          { id: "s2", name: "B", site_type: "building", latitude: 52, longitude: -1 },
        ]),
      },
      surveys: {
        state: { ...states.surveys, visible: true },
        geo: surveysGeo([
          { site_id: "s1", site_name: "A", survey_id: "a", survey_date: TODAY, status: "draft", survey_count: 1, latitude: 51.505, longitude: -0.09 },
          { site_id: "s3", site_name: "C", survey_id: "b", survey_date: TODAY, status: "draft", survey_count: 1, latitude: 51.506, longitude: -0.09 },
          { site_id: "s2", site_name: "B", survey_id: "c", survey_date: TODAY, status: "completed", survey_count: 1, latitude: 53, longitude: -2 },
        ]),
      },
    },
    sketches: { visible: false, features: [] },
    dataLayers: [],
  };
  const withState = (key: "sites" | "surveys", patch: Partial<PointLayerState>): LegendSources => ({
    ...src,
    points: { ...src.points, [key]: { ...src.points[key]!, state: { ...src.points[key]!.state, ...patch } } },
  });

  it("lists only what's inside the printed area, with counts", () => {
    const items = legendFor(src, B);
    expect(items.map((i) => [i.label, i.count])).toEqual([
      ["Surveys: draft", 2],
      ["Sites", 1],
    ]);
  });

  it("leaves out hidden layers", () => {
    expect(legendFor(withState("sites", { visible: false }), B).map((i) => i.label)).toEqual(["Surveys: draft"]);
  });

  it("follows the filter and the chosen colours", () => {
    const noDrafts = withState("surveys", { filter: { ...states.surveys.filter, hidden: ["draft"] } });
    expect(legendFor(noDrafts, B).map((i) => i.label)).toEqual(["Sites"]);
    const typed = withState("sites", {
      style: { ...states.sites.style, colorBy: "type", colors: { ...states.sites.style.colors, bridge: "#f00" } },
    });
    const row = legendFor(typed, B).find((i) => i.label.startsWith("Sites"))!;
    expect(row).toMatchObject({ label: "Sites: bridge", color: "#f00" });
  });

  it("tests shapes by their extent", () => {
    expect(geometryTouches({ type: "LineString", coordinates: [[-0.2, 51.505], [-0.09, 51.505]] }, B)).toBe(true);
    expect(geometryTouches({ type: "Point", coordinates: [1, 1] }, B)).toBe(false);
  });
});

describe("where the sheet is", () => {
  const site = { name: "Tate Modern", address: "Bankside", postcode: "SE1 9TG", latitude: 51.5076, longitude: -0.0994 };
  const lookups = () => ({
    address: vi.fn(async () => ({ address: "12 High St, London, SE1 9XX", postcode: "SE1 9XX" })),
    locality: vi.fn(async () => "Bankside, London Borough of Southwark"),
  });

  it("names the site when the sheet is on one", async () => {
    const l = lookups();
    const describe = makeLocationDescriber(() => [site], l);
    expect(await describe({ lat: 51.5077, lng: -0.0995 }, 300)).toBe("Tate Modern, Bankside, SE1 9TG");
    expect(l.address).not.toHaveBeenCalled();
  });

  it("gives the nearest address for a small area, and only the area for a large one", async () => {
    const l = lookups();
    const describe = makeLocationDescriber(() => [], l);
    expect(await describe({ lat: 51.5, lng: -0.1 }, 600)).toBe("Near 12 High St, London, SE1 9XX");
    expect(await describe({ lat: 51.5, lng: -0.1 }, 5000)).toBe("Area around Bankside, London Borough of Southwark");
  });

  it("names the county or region for a wide sheet, and the countries for a national one", async () => {
    const l = { ...lookups(), region: vi.fn(async () => "Kent, England") };
    const describe = makeLocationDescriber(() => [], l);
    expect(await describe({ lat: 51.2, lng: 0.7 }, 60_000)).toBe("Kent, England");
    const uk = { west: -8.6, south: 49.9, east: 1.8, north: 60.9 };
    // A whole-UK sheet takes in some of Ireland too.
    expect(await describe({ lat: 54.5, lng: -3 }, 700_000, uk)).toBe("United Kingdom and Ireland");
    expect(l.address).not.toHaveBeenCalled();
    // Offline: the countries rather than nothing.
    const offline = makeLocationDescriber(() => [], { ...lookups(), region: vi.fn(async () => null) });
    expect(await offline({ lat: 52, lng: -2.5 }, 100_000)).toBe("England and Wales");
  });

  it("says nothing when it can't look it up, and tries again next time", async () => {
    const l = { address: vi.fn(async () => null), locality: vi.fn(async () => null) };
    const describe = makeLocationDescriber(() => [], l);
    expect(await describe({ lat: 51.5, lng: -0.1 }, 600)).toBeNull();
    await describe({ lat: 51.5, lng: -0.1 }, 600);
    expect(l.address).toHaveBeenCalledTimes(2);
  });
});

describe("the countries a sheet covers", () => {
  it("are named the way people say them", () => {
    expect(countryAt(-0.12, 51.5)).toBe("England");
    expect(countryAt(-3.2, 55.95)).toBe("Scotland"); // Edinburgh
    expect(countryAt(-3.18, 51.48)).toBe("Wales"); // Cardiff
    expect(countryAt(-5.93, 54.6)).toBe("Northern Ireland"); // Belfast
    expect(countryAt(-6.26, 53.35)).toBe("Ireland"); // Dublin
    expect(countryAt(-5.54, 50.12)).toBe("England"); // Penzance
    expect(countriesIn({ west: -1, south: 51, east: 0, north: 52 })).toBe("England");
    expect(countriesIn({ west: -4.5, south: 51.3, east: -1.5, north: 53 })).toBe("England and Wales");
    expect(countriesIn({ west: -5.4, south: 50, east: 1.7, north: 58.6 })).toBe("Great Britain");
    expect(countriesIn({ west: -6.0, south: 50, east: 1.7, north: 58.6 })).toBe("United Kingdom");
    expect(countriesIn({ west: -8.6, south: 49.9, east: 1.8, north: 60.9 })).toBe("United Kingdom and Ireland");
  });
});

describe("the coordinates table", () => {
  it("gives NE, centre and SW as grid references and BNG without separators", () => {
    const rows = coordinateRows([
      { label: "NE", lat: 51.51, lng: -0.09 },
      { label: "Centre", lat: 51.505, lng: -0.095 },
      { label: "SW", lat: 48.85, lng: 2.35 },
    ]);
    expect(rows[0].label).toBe("NE");
    expect(rows[0].gridRef).toMatch(/^TQ \d{5} \d{5}$/);
    expect(rows[0].bng).toMatch(/^\d{6}, \d{6}$/);
    // Off the grid (Paris): said so, in degrees instead.
    expect(rows[2]).toEqual({ label: "SW", gridRef: "Outside BNG", bng: "48.85° N, 2.35° E" });
  });
});
