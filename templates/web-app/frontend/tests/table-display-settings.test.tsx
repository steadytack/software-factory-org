import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { TableDisplaySettings } from "../src/components/TableDisplaySettings";
import { loadPrefs, savePrefs } from "../src/lib/prefs";

describe("Profile → Display: table settings", () => {
  beforeEach(() => localStorage.clear());

  it("starts dense, with wrap and freeze off", () => {
    render(<TableDisplaySettings />);
    expect(screen.getByRole("radio", { name: /dense/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: /wrap text/i })).toHaveAttribute("aria-checked", "false");
  });

  it("saves changes to the profile straight away, keeping other preferences", () => {
    savePrefs({ ...loadPrefs(), displayName: "Sam" });
    render(<TableDisplaySettings />);
    fireEvent.click(screen.getByRole("radio", { name: /roomy/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /freeze first column/i }));
    expect(loadPrefs().table).toEqual({ density: "comfortable", wrap: false, freezeFirstColumn: true });
    expect(loadPrefs().displayName).toBe("Sam");
  });

  it("shows a change made from a table's gear", () => {
    render(<TableDisplaySettings />);
    act(() =>
      savePrefs({ ...loadPrefs(), table: { density: "compact", wrap: true, freezeFirstColumn: false } }),
    );
    expect(screen.getByRole("radio", { name: /standard/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: /wrap text/i })).toHaveAttribute("aria-checked", "true");
  });
});
