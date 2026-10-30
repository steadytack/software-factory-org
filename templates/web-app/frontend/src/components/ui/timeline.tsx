import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

export interface TimelineItem {
  id: string;
  title: ReactNode;
  meta?: ReactNode;
  body?: ReactNode;
  /** Optional dot colour (hex) — always paired with text, never colour-only. */
  color?: string;
}

interface TimelineProps {
  items: TimelineItem[];
  className?: string;
}

/** Vertical timeline with connector line. */
export function Timeline({ items, className }: TimelineProps) {
  if (items.length === 0) return null;
  return (
    <ol className={cn("flex flex-col", className)}>
      {items.map((item, i) => (
        <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
          {/* Connector */}
          {i < items.length - 1 && (
            <span
              aria-hidden="true"
              className="absolute top-4 left-[5px] h-full w-px bg-border"
            />
          )}
          <span
            className="relative z-10 mt-2 size-2.5 shrink-0 rounded-full border-2 border-background shadow"
            style={{ background: item.color ?? "var(--primary)" }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{item.title}</p>
            {item.meta && (
              <p className="mt-0.5 text-xs text-muted-foreground">{item.meta}</p>
            )}
            {item.body}
          </div>
        </li>
      ))}
    </ol>
  );
}
