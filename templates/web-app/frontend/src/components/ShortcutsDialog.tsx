import { Fragment } from "react";

import { GO_TO, useShortcutsStore } from "../hooks/useGlobalShortcuts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Kbd, KbdGroup } from "./ui/kbd";
import { handleArrowNav } from "../lib/arrowNav";

interface Shortcut {
  keys: string[][];
  label: string;
  /** How key groups relate: pressed in sequence ("then", the default) or
   *  alternatives ("or"). */
  sep?: "then" | "or";
}

const GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: "General",
    items: [
      { keys: [["Ctrl", "K"]], label: "Search sites, surveys and pages" },
      { keys: [["?"]], label: "Show keyboard shortcuts" },
      { keys: [["Esc"]], label: "Close a dialog, menu or panel" },
      { keys: [["Ctrl", "B"]], label: "Collapse or expand the sidebar" },
    ],
  },
  {
    title: "Go to",
    items: GO_TO.map((g) => ({ keys: [["G"], [g.key.toUpperCase()]], label: g.label })),
  },
  {
    title: "Tables",
    items: [
      { keys: [["/"]], label: "Focus the table search" },
      { keys: [["↓"]], label: "From the search box, move into the rows" },
      { keys: [["↑"], ["↓"]], sep: "or", label: "Previous / next row" },
      { keys: [["Home"], ["End"]], sep: "or", label: "First / last row" },
      { keys: [["Enter"]], label: "Open the focused row in the side panel" },
      { keys: [["Shift", "Enter"]], label: "Open the focused row's full page" },
      { keys: [["Space"]], label: "Select the focused row" },
      { keys: [["N"]], label: "Add a new record (on list pages)" },
    ],
  },
  {
    title: "Side panel",
    items: [
      { keys: [["↑"], ["↓"]], sep: "or", label: "Previous / next record" },
      { keys: [["Esc"]], label: "Close the panel and return to the row" },
    ],
  },
  {
    title: "Lists and menus",
    items: [
      { keys: [["↑"], ["↓"]], sep: "or", label: "Move through the sidebar, help topics, notifications and menus" },
      { keys: [["Home"], ["End"]], sep: "or", label: "Jump to the first / last item" },
      { keys: [["←"], ["→"]], sep: "or", label: "Switch tabs (e.g. on a site's page)" },
    ],
  },
];

/** Keyboard shortcuts reference (the Jira/Atlassian "?" sheet). Keys in one
 *  group are pressed together; separate groups are pressed in sequence. */
export function ShortcutsDialog() {
  const open = useShortcutsStore((s) => s.open);
  const setOpen = useShortcutsStore((s) => s.setOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Single-key shortcuts don&apos;t fire while you&apos;re typing in a field.
          </DialogDescription>
        </DialogHeader>
        {/* Rows are focusable so the list can be walked with ↑/↓. */}
        <div className="flex flex-col gap-5" onKeyDown={(e) => handleArrowNav(e, "[data-shortcut-row]")}>
          {GROUPS.map((group) => (
            <section key={group.title} className="flex flex-col gap-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </h3>
              <dl className="flex flex-col">
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    data-shortcut-row
                    tabIndex={0}
                    className="-mx-2 flex items-center justify-between gap-4 rounded-sm border-b border-border px-2 py-2 last:border-b-0 focus-visible:bg-muted"
                  >
                    <dt className="text-sm text-foreground">{item.label}</dt>
                    <dd className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      {item.keys.map((combo, i) => (
                        <Fragment key={i}>
                          {i > 0 && <span>{item.sep ?? "then"}</span>}
                          <KbdGroup>
                            {combo.map((k) => (
                              <Kbd key={k} className="border border-border bg-background text-foreground">
                                {k}
                              </Kbd>
                            ))}
                          </KbdGroup>
                        </Fragment>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
