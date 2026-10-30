import { useEffect, useRef, type ReactNode } from "react";

import { TabsList } from "./ui/tabs";

/** The tab row of a record page (Site, Survey). On a phone it stays pinned under the header while
 *  the page scrolls, and the active tab is scrolled into view so "Attachments" and "History" never
 *  hide off the edge. From `sm` up it is an ordinary row. */
export function RecordTabsList({ value, children }: { value: string; children: ReactNode }) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [value]);
  return (
    // -top-4 cancels the page's 16px padding, so the pinned row sits flush under the header.
    <div className="max-sm:sticky max-sm:-top-4 max-sm:z-(--z-sticky) max-sm:-mx-4 max-sm:bg-background max-sm:px-4 max-sm:py-2">
      <TabsList
        ref={listRef}
        className="no-scrollbar w-full justify-start overflow-x-auto bg-muted/60 max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]"
      >
        {children}
      </TabsList>
    </div>
  );
}
