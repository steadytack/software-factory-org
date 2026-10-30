import type { ReactNode, RefObject } from "react";
import type { Row } from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

import { Button } from "../button";
import { IconButton } from "../icon-button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../sheet";

/** What the side panel shows for a row (see the `peek` prop of ManagedDataTable). */
export interface PeekConfig<T> {
  title: (row: T) => string;
  description?: (row: T) => ReactNode;
  render: (row: T) => ReactNode;
  /** Label for the full-page button, e.g. "Open site". */
  fullPageLabel?: string;
}

/** Desktop side panel: the record beside the list, so scroll, filters and
 *  selection stay put. ↑/↓ in the panel move to the previous/next row. */
export function PeekPanel<T>({
  peek,
  peekRow,
  peekIndex,
  rowTotal,
  scrollRef,
  onClose,
  onMove,
  onOpenFullPage,
  onRestoreFocus,
}: {
  peek: PeekConfig<T>;
  /** The row shown, or null when the panel is closed. */
  peekRow: Row<T> | null;
  peekIndex: number;
  rowTotal: number;
  /** The table's scroll area: clicks inside it switch the record, not close the panel. */
  scrollRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onMove: (delta: number) => void;
  onOpenFullPage?: (row: T) => void;
  /** Called when the panel closes, to put keyboard focus back on the row. */
  onRestoreFocus: () => void;
}) {
  return (
    <Sheet open={peekRow !== null} onOpenChange={(open) => !open && onClose()} modal={false}>
      <SheetContent
        overlay={false}
        className="w-full gap-0 data-[side=right]:sm:max-w-lg"
        // Clicking another row switches the record instead of closing.
        onInteractOutside={(e) => {
          if (scrollRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
        // Focus the panel itself: ↑/↓ work straight away, and no button
        // tooltip pops up over the title.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onRestoreFocus();
        }}
        onKeyDown={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest("input, textarea, select, [contenteditable=true], [role=tablist]")) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            onMove(e.key === "ArrowDown" ? 1 : -1);
          }
        }}
      >
        {peekRow && (
          <>
            <SheetHeader className="gap-2 border-b border-border pr-12">
              <SheetTitle className="text-base">{peek.title(peekRow.original)}</SheetTitle>
              {peek.description ? (
                <SheetDescription>{peek.description(peekRow.original)}</SheetDescription>
              ) : (
                <SheetDescription className="sr-only">Record details</SheetDescription>
              )}
              <div className="flex items-center gap-1">
                <IconButton
                  label="Previous (↑)"
                  variant="secondary"
                  disabled={peekIndex <= 0}
                  onClick={() => onMove(-1)}
                >
                  <ChevronUp />
                </IconButton>
                <IconButton
                  label="Next (↓)"
                  variant="secondary"
                  disabled={peekIndex >= rowTotal - 1}
                  onClick={() => onMove(1)}
                >
                  <ChevronDown />
                </IconButton>
                <span className="ml-1 text-xs text-muted-foreground tnum">
                  {peekIndex + 1} of {rowTotal}
                </span>
                {onOpenFullPage && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="ml-auto"
                    onClick={() => onOpenFullPage(peekRow.original)}
                  >
                    <ExternalLink />
                    {peek.fullPageLabel ?? "Open"}
                  </Button>
                )}
              </div>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">{peek.render(peekRow.original)}</div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
