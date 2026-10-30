import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "../src/components/ui/tooltip";
import { useMapContextMenu } from "../src/components/map/MapContextMenu";

vi.mock("../src/components/map/utils/geocode", () => ({
  reversePostcode: vi.fn(async () => "SW1A 1AA"),
  reverseAddress: vi.fn(async () => ({ postcode: "SW1A 1AA", address: "10 Downing Street" })),
}));

// Map page: the press-and-hold menu used to vanish the moment the finger lifted, because the click that
// ends the press landed on the full-screen backdrop that had just mounted under it.

type Handler = (e: unknown) => void;

function fakeMap() {
  const handlers = new Map<string, Handler[]>();
  const canvas = document.createElement("canvas");
  return {
    on: (name: string, fn: Handler) => handlers.set(name, [...(handlers.get(name) ?? []), fn]),
    off: (name: string, fn: Handler) =>
      handlers.set(name, (handlers.get(name) ?? []).filter((h) => h !== fn)),
    getCanvas: () => canvas,
    fire: (name: string, e: unknown) => (handlers.get(name) ?? []).forEach((h) => h(e)),
  };
}

function Harness({ map }: { map: ReturnType<typeof fakeMap> }) {
  const ref = useRef(map as never);
  const { menuNode } = useMapContextMenu({ mapRef: ref });
  return <TooltipProvider>{menuNode}</TooltipProvider>;
}

const TOUCH = { point: { x: 40, y: 60 }, points: [{}], lngLat: { lng: -0.12, lat: 51.5 } };

describe("map press-and-hold menu", () => {
  let now = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function holdToOpen(map: ReturnType<typeof fakeMap>) {
    map.fire("touchstart", TOUCH);
    await act(async () => {
      now += 500;
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(screen.getByRole("dialog", { name: "Location details" })).toBeInTheDocument();
  }

  it("stays open through the tap that ends the press, and closes on a later tap outside", async () => {
    const map = fakeMap();
    render(<Harness map={map} />);
    await holdToOpen(map);

    const backdrop = document.querySelector<HTMLElement>("body > div.fixed.inset-0")!;
    // Finger lifts: the browser reports a pointer event and a contextmenu on what is now the backdrop.
    now += 60;
    fireEvent.pointerDown(backdrop);
    fireEvent.contextMenu(backdrop);
    expect(screen.getByRole("dialog", { name: "Location details" })).toBeInTheDocument();

    // A real tap outside, later, closes it.
    now += 800;
    fireEvent.pointerDown(backdrop);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens once when the timer and the native contextmenu event both report the same press", async () => {
    const map = fakeMap();
    render(<Harness map={map} />);
    await holdToOpen(map);
    now += 100;
    await act(async () => {
      map.fire("contextmenu", TOUCH);
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("still closes with Escape and the Close button", async () => {
    const map = fakeMap();
    render(<Harness map={map} />);
    await holdToOpen(map);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    await act(async () => {
      now += 2000;
    });
    await holdToOpen(map);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
