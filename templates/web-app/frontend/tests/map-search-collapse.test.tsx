import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MapSearchBar } from "../src/components/map/MapSearchBar";

// Phone map: the search starts as one button, opens into the bar, and folds away after a choice.
const props: Parameters<typeof MapSearchBar>[0] = {
  query: "",
  suggestions: [{ id: "a", label: "Albert Bridge", sublabel: "London" } as never],
  loading: false,
  onQueryChange: vi.fn(),
  onSearch: vi.fn(),
  onSelectSuggestion: vi.fn(),
  onClearSearch: vi.fn(),
};

describe("MapSearchBar on a phone (collapsible)", () => {
  it("starts collapsed, expands on tap, and collapses after choosing a place", async () => {
    render(<MapSearchBar {...props} collapsible />);
    expect(screen.queryByRole("textbox")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Search for a location" }));
    const input = screen.getByRole("textbox", { name: "Search for a location" });
    expect(input).toHaveFocus();

    await userEvent.click(screen.getByRole("option", { name: /Albert Bridge/ }));
    expect(props.onSelectSuggestion).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("collapses with the back button and Escape", async () => {
    render(<MapSearchBar {...props} suggestions={[]} collapsible />);
    await userEvent.click(screen.getByRole("button", { name: "Search for a location" }));
    await userEvent.click(screen.getByRole("button", { name: "Collapse search" }));
    expect(screen.queryByRole("textbox")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Search for a location" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("is a plain always-open bar on desktop", () => {
    render(<MapSearchBar {...props} suggestions={[]} />);
    expect(screen.getByRole("textbox", { name: "Search for a location" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Collapse search" })).toBeNull();
  });
});
