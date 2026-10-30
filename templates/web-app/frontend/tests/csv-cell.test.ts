import { describe, expect, it } from "vitest";

import { csvCell } from "../src/components/ui/table/csv";

describe("csvCell", () => {
  it("leaves ordinary text and plain numbers alone, including negative ones", () => {
    expect(csvCell("Harbour Wall")).toBe("Harbour Wall");
    expect(csvCell("51.5")).toBe("51.5");
    // Audit R2-EXP-1: a west-of-Greenwich longitude is a number, not a formula.
    expect(csvCell("-0.12")).toBe("-0.12");
    expect(csvCell("-2")).toBe("-2");
  });

  it("still guards anything that could run as a formula", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+1+cmd|' /C calc'!A0")).toBe("'+1+cmd|' /C calc'!A0");
    expect(csvCell("@SUM(1)")).toBe("'@SUM(1)");
    expect(csvCell("-1+2")).toBe("'-1+2");
    expect(csvCell("-cmd")).toBe("'-cmd");
    expect(csvCell("-1.5e3")).toBe("'-1.5e3");
    expect(csvCell("+5")).toBe("'+5");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("Bravo, Ltd")).toBe('"Bravo, Ltd"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });
});
