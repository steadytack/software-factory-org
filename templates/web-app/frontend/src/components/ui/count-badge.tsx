import { cn } from "../../lib/utils";

/** A small neutral count pill for tab labels and panel headings. It sits on its own surface with a
 *  hairline ring, so it stays visible on the tab list and inside the active tab alike. */
export function CountBadge({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-background px-1 text-micro leading-none font-medium text-muted-foreground tnum ring-1 ring-border ring-inset",
        className,
      )}
    >
      {n}
    </span>
  );
}
