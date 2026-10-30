import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Shared empty-state block: icon + title + optional description/action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-10 text-center",
        className,
      )}
    >
      <div className="text-muted-foreground/60">{icon ?? <Inbox className="size-8" />}</div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="max-w-[360px] text-xs text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

