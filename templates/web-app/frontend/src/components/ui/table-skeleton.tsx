import { Skeleton } from "./skeleton";

/** Loading placeholder shaped like a `ManagedDataTable`: toolbar + rows. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 max-w-xs flex-1" />
        <Skeleton className="size-9" />
        <Skeleton className="size-9" />
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-3 py-2">
          <Skeleton className="h-3.5 w-40" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-3 py-3">
              <Skeleton className="h-3.5 flex-[2]" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-3.5 flex-[2]" />
              <Skeleton className="h-3.5 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
