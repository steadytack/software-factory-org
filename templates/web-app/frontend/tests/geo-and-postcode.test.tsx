import { afterEach, describe, expect, it, vi } from "vitest";

import { checkPostcode } from "../src/components/map/utils/geocode";
import { isUkPostcode } from "../src/lib/postcode";

describe("isUkPostcode", () => {
  it("accepts well-formed UK postcodes, in any case and spacing", () => {
    for (const ok of ["SW1A 1AA", "sw1a1aa", " se1  2up ", "E3 5NR", "M1 1AA", "EH1 1YZ", "GIR 0AA", "DG11 3ND"]) {
      expect(isUkPostcode(ok), ok).toBe(true);
    }
  });

  it("refuses anything else", () => {
    for (const bad of ["ABCDEFGHIJ", "12345", "SW1A", "SW1A 1A", "QQ1 1AA", "SW1A 1AAA", "A 1AA", ""]) {
      expect(isUkPostcode(bad), bad).toBe(false);
    }
  });
});

describe("checkPostcode", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports a postcode postcodes.io knows, with its position", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ status: 200, result: { latitude: 51.5, longitude: -0.12, postcode: "SW1A 1AA" } }),
          { status: 200 },
        ),
      ),
    );
    expect(await checkPostcode("SW1A 1AA")).toEqual({
      status: "found",
      hit: { lat: 51.5, lng: -0.12, label: "SW1A 1AA" },
    });
  });

  it("reports a definite no only for a 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
    expect(await checkPostcode("ZZ99 9ZZ")).toEqual({ status: "unknown" });
  });

  it("treats offline, timeouts and server trouble as unavailable, never as a bad postcode", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await checkPostcode("SW1A 1AA")).toEqual({ status: "unavailable" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    expect(await checkPostcode("SW1A 1AA")).toEqual({ status: "unavailable" });
    warn.mockRestore();
  });
});
