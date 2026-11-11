import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { useEffect } from "react";

import { ALL_GUIDES, guidesFor, parseGuide } from "../src/help/guides";
import { HelpProvider, useHelpContext } from "../src/help/HelpContext";
import { HelpDrawer } from "../src/help/HelpDrawer";

const SAMPLE = `---
group: Sites
pages: [/sites, /sites/:siteId]
---

## Adding a site {#sites-add}
<!-- keywords: new, create -->

Press **New site**.

## Saved views

Use the \`bookmark\`.
`;

describe("guides", () => {
  it("turns each ## heading into a section with its group, pages and keywords", () => {
    const [first, second] = parseGuide(SAMPLE, "sites");
    expect(first).toMatchObject({
      id: "sites-add",
      title: "Adding a site",
      group: "Sites",
      keywords: ["new", "create"],
      pages: ["/sites", "/sites/:siteId"],
      body: "Press **New site**.",
    });
    expect(second.id).toBe("sites-saved-views");
    expect(second.order).toBeGreaterThan(first.order ?? 0);
  });

  it("shows page guides only on their pages, and the rest everywhere", () => {
    const guides = parseGuide(SAMPLE, "sites").concat(parseGuide("---\ngroup: Start\n---\n## Hello\n\nHi.", "start"));
    expect(guidesFor("/sites/42", guides).map((g) => g.title)).toEqual(["Adding a site", "Saved views", "Hello"]);
    expect(guidesFor("/map", guides).map((g) => g.title)).toEqual(["Hello"]);
  });

  it("loads the template's guide files, with unique ids", () => {
    expect(ALL_GUIDES.length).toBeGreaterThan(0);
    const ids = ALL_GUIDES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("renders a section's markdown when it is expanded", async () => {
    function Open() {
      const { openHelp } = useHelpContext();
      useEffect(() => openHelp(), [openHelp]);
      return null;
    }
    render(
      <MemoryRouter initialEntries={["/"]}>
        <HelpProvider>
          <Open />
          <HelpDrawer />
        </HelpProvider>
      </MemoryRouter>,
    );
    const first = guidesFor("/")[0];
    await userEvent.click(await screen.findByRole("button", { name: new RegExp(first.title.replace(/[()+?]/g, "\\$&")) }));
    // Markdown, not the raw text: no ** or backticks left in the expanded section.
    await waitFor(() => expect(document.querySelector(".help-markdown p")).not.toBeNull());
    expect(document.querySelector(".help-markdown")?.textContent).not.toMatch(/\*\*|`/);
  });
});
