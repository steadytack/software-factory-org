import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PanelCard } from "../src/components/PanelCard";
import { Segmented } from "../src/components/ui/segmented";
import { TABLE_PANEL } from "../src/lib/tablePanel";

// Pieces proven in an app built from this template: the segmented control's keys, the
// collapsible card and the shared table panel.

describe("Segmented", () => {
  it("is one Tab stop, and the arrow keys move the choice", () => {
    const onChange = vi.fn();
    render(
      <>
        <span id="lbl">Show</span>
        <Segmented
          labelId="lbl"
          value="b"
          onChange={onChange}
          options={[
            { value: "a", label: "A" },
            { value: "b", label: "B" },
            { value: "c", label: "C" },
          ]}
        />
      </>,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.keyDown(radios[1], { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("c");
    fireEvent.keyDown(radios[1], { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("a");
  });
});

describe("PanelCard, collapsible", () => {
  beforeEach(() => localStorage.clear());
  const card = () =>
    render(
      <PanelCard title="Environment" collapsible={{ defaultOpen: false, key: "test-card" }}>
        <p>Inside</p>
      </PanelCard>,
    );

  it("opens and closes from its title, says so, and remembers it", () => {
    const first = card();
    const toggle = screen.getByRole("button", { name: "Environment" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Inside")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Inside")).toBeInTheDocument();
    expect(localStorage.getItem("webapp.card-open.test-card")).toBe("1");
    first.unmount();
    card();
    expect(screen.getByText("Inside")).toBeInTheDocument();
  });

  it("is a plain card without the option", () => {
    render(
      <PanelCard title="Plain">
        <p>Always</p>
      </PanelCard>,
    );
    expect(screen.queryByRole("button", { name: "Plain" })).not.toBeInTheDocument();
    expect(screen.getByText("Always")).toBeInTheDocument();
  });
});

describe("TABLE_PANEL", () => {
  it("caps a table's height so it scrolls inside the page", () => {
    expect(TABLE_PANEL).toContain("max-h-[min(34rem,70vh)]");
    expect(TABLE_PANEL).toContain("flex-col");
  });
});
