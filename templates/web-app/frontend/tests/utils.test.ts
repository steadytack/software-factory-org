// Vitest for the class-name utility used by shadcn/ui components.
import { describe, expect, it } from "vitest";

import { cn, isSafeRelativePath } from "../src/lib/utils";

describe("isSafeRelativePath", () => {
  it("accepts in-app paths and rejects absolute or protocol-relative ones", () => {
    expect(isSafeRelativePath("/sites/1?tab=files#x")).toBe(true);
    expect(isSafeRelativePath("//evil.example")).toBe(false);
    expect(isSafeRelativePath("https://evil.example")).toBe(false);
    expect(isSafeRelativePath("")).toBe(false);
    expect(isSafeRelativePath(null)).toBe(false);
  });

  // Audit finding R2-SEC-1 (2026-09-29): browsers read `\` as `/`, so
  // "/\evil.example" is the same as "//evil.example".
  it("rejects backslashes and control characters", () => {
    expect(isSafeRelativePath("/\\evil.example")).toBe(false);
    expect(isSafeRelativePath("/ok\\path")).toBe(false);
    expect(isSafeRelativePath("/ok\npath")).toBe(false);
    expect(isSafeRelativePath("/\t/evil.example")).toBe(false);
  });
});

describe("cn", () => {
  it("joins classes", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("lets later classes win (tailwind-merge)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("ignores falsy values", () => {
    expect(cn("a", undefined, false, "")).toBe("a");
  });
});

describe("localIsoDate", () => {
  it("uses the local calendar date, not the UTC one", async () => {
    const { localIsoDate } = await import("../src/lib/format");
    // 00:30 local time on 2 July is still 1 July in UTC for any UTC+ zone;
    // either way the local parts are what we expect.
    expect(localIsoDate(new Date(2026, 6, 2, 0, 30))).toBe("2026-07-02");
  });
});
