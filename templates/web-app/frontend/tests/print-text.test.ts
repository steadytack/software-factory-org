import { describe, expect, it, vi } from "vitest";

vi.mock("maplibre-gl", () => ({ default: {} }));
vi.mock("jspdf", () => ({ jsPDF: class {} }));

import { creditLine, isPdfSafe, loadLegendImages, type LegendItem } from "../src/components/map/utils/printMap";
import { buildWmsLegendUrl, buildWmsTileUrl } from "../src/components/map/layers/external";

describe("text on a PDF sheet", () => {
  it("writes ordinary and Western European text as PDF text", () => {
    for (const t of ["Site plan", "Pont y Cŵn".replace("ŵ", "w"), "Café Müller – 5 µm", "“quoted” … €10", "Ynys Môn", ""]) {
      expect(isPdfSafe(t)).toBe(true);
    }
  });

  it("draws anything the PDF font can't write into the image instead", () => {
    for (const t of ["Dŵr Cymru", "Ŵyn", "Łódź", "北京", "tick ✓", "arrow →"]) {
      expect(isPdfSafe(t)).toBe(false);
    }
  });
});

describe("the credits under the title block", () => {
  it("does not say an OS map's Crown copyright twice", () => {
    const os = "© Crown copyright and database rights 2026 Ordnance Survey";
    expect(creditLine(os, "© Crown copyright and database rights Ordnance Survey")).toBe(os);
  });

  it("joins a copyright line and a different attribution", () => {
    expect(creditLine("© Someone", "Esri, HERE, Garmin")).toBe("© Someone · Esri, HERE, Garmin");
    expect(creditLine(undefined, "Esri, HERE, Garmin")).toBe("Esri, HERE, Garmin");
    expect(creditLine("© Crown copyright Ordnance Survey", "")).toBe("© Crown copyright Ordnance Survey");
  });
});

describe("a map service's legend picture", () => {
  const wms = "https://example.org/geoserver/wms?foo=bar";
  it("is the service's own GetLegendGraphic for the layer", () => {
    const url = buildWmsLegendUrl(wms, "Flood Zones");
    expect(url).toContain("request=GetLegendGraphic");
    expect(url).toContain("layer=Flood%20Zones");
    expect(url).not.toContain("foo=bar");
    expect(buildWmsTileUrl(wms, "Flood Zones")).toContain("request=GetMap");
  });

  const item = (): LegendItem => ({ label: "Flood", kind: "fill", color: "#fff", legendUrl: "https://example.org/legend.png" });
  const image = (type = "image/png") => ({ ok: true, blob: async () => new Blob(["x"], { type }) }) as unknown as Response;

  it("is fetched for the sheet", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 96, height: 40 }));
    const items = [item()];
    await loadLegendImages(items, (async () => image()) as unknown as typeof fetch);
    expect(items[0].image).toMatchObject({ width: 96, height: 40 });
    vi.unstubAllGlobals();
  });

  it("is skipped, leaving the swatch, when the server refuses or sends something else", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 96, height: 40 }));
    const cases: (() => Promise<Response>)[] = [
      async () => ({ ok: false, blob: async () => new Blob([]) }) as unknown as Response,
      async () => image("text/html"),
      async () => {
        throw new TypeError("blocked by CORS");
      },
    ];
    for (const c of cases) {
      const items = [item()];
      await loadLegendImages(items, c as unknown as typeof fetch);
      expect(items[0].image).toBeUndefined();
    }
    vi.unstubAllGlobals();
  });

  it("is skipped when it's a huge picture, not a legend", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 4000, height: 3000 }));
    const items = [item()];
    await loadLegendImages(items, (async () => image()) as unknown as typeof fetch);
    expect(items[0].image).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
