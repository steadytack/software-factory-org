import { describe, expect, it } from "vitest";

import { NEAR_SITE_METRES, accuracyNote, formatDistance, nearestSite } from "../src/lib/geolocate";

const sites = [
  { id: "a", name: "North Pier", latitude: 51.5, longitude: -0.1 },
  { id: "b", name: "South Yard", latitude: 51.4, longitude: -0.1 },
];

describe("the nearest site", () => {
  it("is the closest one, and close when within 500 m", () => {
    // About 55 m north of the North Pier.
    const hit = nearestSite({ lat: 51.5005, lng: -0.1 }, sites)!;
    expect(hit.site.id).toBe("a");
    expect(hit.metres).toBeGreaterThan(40);
    expect(hit.metres).toBeLessThan(70);
    expect(hit.close).toBe(true);
  });

  it("is not close when every site is further than 500 m, but still says which is nearest", () => {
    const hit = nearestSite({ lat: 51.45, lng: -0.1 }, sites)!;
    expect(hit.close).toBe(false);
    expect(hit.metres).toBeGreaterThan(NEAR_SITE_METRES);
  });

  it("treats exactly the limit as close, and returns null with no sites", () => {
    expect(nearestSite({ lat: 0, lng: 0 }, [])).toBeNull();
  });
});

describe("saying where and how well", () => {
  it("formats distances in metres, then kilometres", () => {
    expect(formatDistance(42.4)).toBe("42 m");
    expect(formatDistance(1530)).toBe("1.5 km");
    expect(formatDistance(23_000)).toBe("23 km");
  });

  it("flags a rough fix", () => {
    expect(accuracyNote(12)).toEqual({ text: "±12 m", poor: false });
    expect(accuracyNote(120).poor).toBe(true);
  });
});
