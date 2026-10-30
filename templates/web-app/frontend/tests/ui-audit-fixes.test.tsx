import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecordFormDialog, type FormField } from "../src/components/RecordFormDialog";
import { StatusBadge } from "../src/components/StatusBadge";

// UI audit 2026-09-30 (run 2026-09-30-4): UI-FORM-1, UI-A11Y-3, UI-COPY-1, UI-THEME-1.

const FIELDS: FormField[] = [
  { name: "name", label: "Name", kind: "text", required: true },
  { name: "notes", label: "Notes", kind: "textarea" },
];

function Harness({ onSubmit }: { onSubmit: () => void }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({ name: "", notes: "" });
  return (
    <>
      <button onClick={() => setOpen(true)}>Add thing</button>
      <RecordFormDialog
        open={open}
        title="Add thing"
        fields={FIELDS}
        values={values}
        onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))}
        onClose={() => setOpen(false)}
        onSubmit={onSubmit}
      />
    </>
  );
}

describe("RecordFormDialog", () => {
  it("shows a missing required field next to it, marks it invalid and focuses it", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Add thing" }));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));

    const name = screen.getByLabelText(/Name/);
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAttribute("aria-describedby", "rf-name-error");
    expect(name).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();

    // Typing clears it, and Save goes through.
    await userEvent.type(name, "Bridge");
    expect(screen.queryByText("Name is required")).toBeNull();
    expect(name).not.toHaveAttribute("aria-invalid");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("treats a blank (spaces only) required field as missing", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Add thing" }));
    await userEvent.type(await screen.findByLabelText(/Name/), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("gives focus back to the button that opened it when it closes", async () => {
    render(<Harness onSubmit={() => undefined} />);
    const opener = screen.getByRole("button", { name: "Add thing" });
    opener.focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(opener).toHaveFocus();
  });
});

describe("StatusBadge", () => {
  it("writes statuses in sentence case, as the rest of the UI does", () => {
    render(
      <>
        <StatusBadge value="in_progress" kind="survey" />
        <StatusBadge value="not_assessed" kind="site" />
        <StatusBadge value="active" kind="site" />
      </>,
    );
    for (const text of ["In progress", "Not assessed", "Active"]) {
      const chip = screen.getByText(text).closest("[data-slot=badge]") ?? screen.getByText(text);
      expect(chip.className).not.toMatch(/capitalize/);
    }
  });
});

describe("theme-init.js (runs before first paint)", () => {
  const code = readFileSync("public/theme-init.js", "utf8");
  function run(stored: string | null, osDark: boolean): boolean {
    document.documentElement.classList.remove("dark");
    if (stored === null) localStorage.removeItem("theme");
    else localStorage.setItem("theme", stored);
    vi.stubGlobal("matchMedia", () => ({ matches: osDark }));
    new Function(code)();
    return document.documentElement.classList.contains("dark");
  }
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.removeItem("theme");
    document.documentElement.classList.remove("dark");
  });

  it("follows the device when the person chose System (it used to flash light on a dark device)", () => {
    expect(run("system", true)).toBe(true);
    expect(run("system", false)).toBe(false);
  });

  it("still honours an explicit choice and the default", () => {
    expect(run("dark", false)).toBe(true);
    expect(run("light", true)).toBe(false);
    expect(run(null, true)).toBe(true);
    expect(run(null, false)).toBe(false);
  });
});
