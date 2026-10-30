import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "../src/components/ui/tooltip";
import { BaseMapPicker } from "../src/components/map/panel/BaseMapPicker";
import { DrawTab } from "../src/components/map/panel/DrawTab";
import { DrawModeBar } from "../src/components/map/DrawModeBar";
import { AddDataDialog } from "../src/components/map/panel/AddDataDialog";
import { MapStatusBar } from "../src/components/map/MapStatusBar";
import { BASE_LAYERS, BASE_LAYER_MAP, defaultLayerFor } from "../src/components/map/mapLayers";

describe("base maps", () => {
  it("default to one that needs no key, and no Carto (watermarked without one)", () => {
    // The default follows the theme, and neither needs an API key.
    for (const theme of ["light", "dark"] as const) {
      const layer = BASE_LAYER_MAP.get(defaultLayerFor(theme));
      expect(layer).toBeDefined();
      expect(layer?.requiresKey).toBeUndefined();
    }
    expect(defaultLayerFor("light")).not.toBe(defaultLayerFor("dark"));
    expect(BASE_LAYERS.some((l) => l.key.startsWith("carto"))).toBe(false);
    for (const layer of BASE_LAYERS) {
      expect(JSON.stringify(layer.getStyle({}))).not.toContain("cartocdn");
    }
  });

  it("are chosen from grouped radios", () => {
    const onChange = vi.fn();
    render(<BaseMapPicker value="osm" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "OpenStreetMap" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Dark Gray" }));
    expect(onChange).toHaveBeenCalledWith("esri-dark");
  });
});

const drawProps = {
  features: [],
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
  onZoom: vi.fn(),
  onClearAll: vi.fn(),
  visible: true,
  onToggleVisible: vi.fn(),
  snapEnabled: true,
  onSnapChange: vi.fn(),
  measureSettings: { units: "auto", areaUnits: "auto", showSegments: true, showTotal: true, showPerimeter: true, showTicks: false, coordFormat: "bng", coordCentre: true },
  onMeasureSettingsChange: vi.fn(),
} as unknown as Parameters<typeof DrawTab>[0];

describe("the Draw tab", () => {
  it("holds the tools, and shows which is active", () => {
    const onToolChange = vi.fn();
    render(
      <TooltipProvider>
        <DrawTab {...drawProps} activeTool="line" onToolChange={onToolChange} />
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Draw line" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Measure area" }));
    expect(onToolChange).toHaveBeenCalledWith("measure-area");
  });
});

describe("the draw bar", () => {
  it("names the tool, says how to use it, and Done puts it away", () => {
    const onDone = vi.fn();
    render(<DrawModeBar tool="polygon" snapEnabled onToggleSnap={vi.fn()} onDone={onDone} />);
    expect(screen.getByText("Draw polygon")).toBeInTheDocument();
    expect(screen.getByText(/tap the first corner to close/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalled();
  });

  it("is hidden with no tool", () => {
    const { container } = render(<DrawModeBar tool={null} snapEnabled onToggleSnap={vi.fn()} onDone={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Add data", () => {
  it("adds each GeoJSON file as a layer and closes", async () => {
    const onAdd = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <AddDataDialog open onOpenChange={onOpenChange} onAddGeoJSONLayer={onAdd} onAddWMSLayer={vi.fn()} />,
    );
    const fc = JSON.stringify({ type: "FeatureCollection", features: [] });
    // jsdom's File has no arrayBuffer().
    const file = (name: string) =>
      Object.assign(new File([fc], name), { arrayBuffer: async () => new TextEncoder().encode(fc).buffer });
    fireEvent.change(screen.getByTestId("geojson-input"), {
      target: { files: [file("roads.geojson"), file("rivers.json")] },
    });
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalledTimes(2));
    expect(onAdd.mock.calls.map((c) => c[0]).sort()).toEqual(["rivers", "roads"]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("the status bar on a phone", () => {
  it("folds into an ⓘ that shows the details", () => {
    render(<MapStatusBar compact status={{ zoom: 7, lat: 51.5, lng: -0.1 }} attribution="© OpenStreetMap" />);
    expect(screen.queryByText("z7.0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /map details/i }));
    expect(screen.getByText("z7.0")).toBeInTheDocument();
    expect(screen.getByText("© OpenStreetMap")).toBeInTheDocument();
  });
});
