import { describe, expect, it, vi } from "vitest";

vi.mock("maplibre-gl", () => ({ default: {} }));

import { POINT_LAYERS } from "../src/components/map/layers/pointLayers";
import { defaultSchemeFor, schemeColors, schemesFor } from "../src/components/map/layers/colorSchemes";

const typeField = POINT_LAYERS.sites.fields.find((f) => f.key === "type")!;
const statusField = POINT_LAYERS.sites.fields.find((f) => f.key === "status")!;

describe("colour schemes", () => {
  it("offer the status scheme only for a field whose values have a meaning", () => {
    expect(schemesFor(statusField).map((s) => s.id)).toContain("status");
    expect(schemesFor(typeField).map((s) => s.id)).not.toContain("status");
    expect(defaultSchemeFor(statusField)).toBe("status");
    expect(defaultSchemeFor(typeField)).toBe("distinct");
  });

  it("colour every value, a different colour each for a categorical scheme", () => {
    const colors = schemeColors("distinct", typeField);
    expect(Object.keys(colors)).toEqual(typeField.categories.map((c) => c.value));
    expect(new Set(Object.values(colors)).size).toBe(typeField.categories.length);
  });

  it("colour a status by what it means", () => {
    expect(schemeColors("status", POINT_LAYERS.surveys.fields[0])).toEqual({
      draft: "#e2a03f",
      completed: "#22a06b",
      old: "#8590a2",
    });
  });
});
