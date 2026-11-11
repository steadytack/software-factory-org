import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "../lib/utils";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

function remembered(key: string | undefined, fallback: boolean): boolean {
  if (!key) return fallback;
  try {
    const value = localStorage.getItem(`webapp.card-open.${key}`);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

/** A titled card for settings and admin pages: the same header as every other card (a title and an optional
 *  one-line description), then the content. With `collapsible`, the title opens and closes it, and the
 *  choice is remembered in this browser under `collapsible.key`. Proven in an app built from this template. */
export function PanelCard({
  title,
  description,
  action,
  collapsible,
  children,
}: {
  title: string;
  description?: string;
  /** Sits at the right of the header, level with the title (a status, a link). */
  action?: ReactNode;
  collapsible?: { defaultOpen: boolean; key?: string };
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => remembered(collapsible?.key, collapsible?.defaultOpen ?? true));
  const contentId = useId();
  const toggle = () => {
    setOpen((was) => {
      try {
        if (collapsible?.key) localStorage.setItem(`webapp.card-open.${collapsible.key}`, was ? "0" : "1");
      } catch {
        // no storage (private mode): the card still opens and closes
      }
      return !was;
    });
  };
  return (
    <Card className={cn(collapsible && !open && "gap-0")}>
      <CardHeader>
        <CardTitle>
          {collapsible ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={contentId}
              onClick={toggle}
              className="tap-area -ml-1 flex items-center gap-1 rounded-sm px-1 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDown aria-hidden className={cn("size-4 transition-transform", !open && "-rotate-90")} />
              {title}
            </button>
          ) : (
            title
          )}
        </CardTitle>
        {action && <CardAction>{action}</CardAction>}
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {(!collapsible || open) && (
        <CardContent id={contentId} className="min-w-0">
          {children}
        </CardContent>
      )}
    </Card>
  );
}
