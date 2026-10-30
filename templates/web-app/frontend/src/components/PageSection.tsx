import type { ReactNode } from "react";

import { cn } from "../lib/utils";

interface PageSectionProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** An unframed page section: heading + optional description/action above
 *  its content, separated from siblings by a hairline rather than a card. */
export function PageSection({ title, description, action, children, className }: PageSectionProps) {
  return (
    <section className={cn("min-w-0 space-y-4 border-t border-border pt-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
