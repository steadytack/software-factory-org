import { Skeleton } from "./skeleton";

/** A placeholder for a list of rows (comments, files, notifications, history) while it loads: a round
 *  or square lead and two lines of text per row, so the real list replaces it without a jump. */
export function ListSkeleton({
  rows = 3,
  shape = "round",
  className,
}: {
  rows?: number;
  shape?: "round" | "square";
  className?: string;
}) {
  return (
    <div role="status" aria-label="Loading" className={className ?? "space-y-4 py-2"}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className={shape === "round" ? "size-8 shrink-0 rounded-full" : "size-8 shrink-0"} />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
