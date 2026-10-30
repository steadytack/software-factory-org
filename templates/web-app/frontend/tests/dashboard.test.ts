// Regression test for the dashboard chart label bug: toPoints used
// a length check (key.length === 10) to decide whether a key was a date, which
// mislabelled 10-character category names ("structural", "electrical") as
// dates and rendered "Invalid Date" on the axis.
//
// Updated for the data-integrity audit (run 2026-09-16-3):
//   * DSP-3 — an empty aggregate returns **null** instead of a zero-filled
//     point list. The old behaviour drew "no data yet" as a real chart with
//     every bar at zero, which is fabricated data, and the fallback label
//     list it invented was only 3 of the 7 category values anyway. The
//     `fallbackLabels` parameter is gone with it.
//   * VOC-4 — category keys render through `vocabularyLabel`, so the stored
//     code and its display label are no longer the same string.
import { describe, expect, it } from "vitest";

import { toPoints } from "../src/pages/DashboardPage";

describe("toPoints", () => {
  it("reformats ISO date keys as weekday labels", () => {
    const points = toPoints({ "2026-09-14": 3 });
    expect(points).toHaveLength(1);
    expect(points![0].value).toBe(3);
    // A real date becomes a short weekday, never "Invalid Date".
    expect(points![0].label).not.toBe("Invalid Date");
    expect(points![0].label).not.toBe("2026-09-14");
  });

  it("keeps 10-character category names as labels (not treated as dates)", () => {
    const points = toPoints({ structural: 2, electrical: 5 });
    const labels = points!.map((p) => p.label);
    // Labelled, not raw codes — but recognisably the same values.
    expect(labels).toContain("Structural");
    expect(labels).toContain("Electrical");
    expect(labels).not.toContain("Invalid Date");
  });

  it("returns null for an absent aggregate so the caller can show an empty state", () => {
    // previously this fabricated a chart of zeros.
    expect(toPoints(undefined)).toBeNull();
  });

  it("returns null for an empty aggregate", () => {
    expect(toPoints({})).toBeNull();
  });

  it("treats an all-zero aggregate as real data, not as empty", () => {
    // the backend now returns every vocabulary value with an explicit
    // 0, and "we measured, and there are none" is a genuine answer — quite
    // different from "nothing has been recorded yet".
    const points = toPoints({ structural: 0, safety: 0 });
    expect(points).toHaveLength(2);
    expect(points!.every((p) => p.value === 0)).toBe(true);
  });
});
