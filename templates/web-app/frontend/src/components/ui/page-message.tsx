import { useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";

import { cn } from "../../lib/utils";
import { WithTooltip } from "./with-tooltip";

type Tone = "info" | "warning" | "error" | "success";

const TONE: Record<Tone, { icon: typeof Info; box: string; iconClass: string }> = {
  info: { icon: Info, box: "border-l-info bg-info-subtle", iconClass: "text-info-fg" },
  warning: { icon: TriangleAlert, box: "border-l-warning bg-warning-subtle", iconClass: "text-warning-fg" },
  error: { icon: CircleAlert, box: "border-l-destructive bg-destructive-subtle", iconClass: "text-destructive-fg" },
  success: { icon: CircleCheck, box: "border-l-success bg-success-subtle", iconClass: "text-success-fg" },
};

function readDismissed(key?: string): boolean {
  if (!key) return false;
  try {
    return sessionStorage.getItem(`page-message:${key}`) === "1";
  } catch {
    return false;
  }
}

interface PageMessageProps {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  /** Optional inline action, e.g. a link-styled button. */
  action?: ReactNode;
  /** When set, the message shows a close button and stays dismissed for the
   *  rest of the browser session under this key. */
  dismissKey?: string;
  className?: string;
}

/** Persistent, in-page status message: the Fluent "MessageBar" / Atlassian
 *  "section message" pattern. Use it for conditions that last as long as
 *  the page does (capped lists, permissions, sync state); toasts remain for
 *  one-off events. */
export function PageMessage({
  tone = "info",
  title,
  children,
  action,
  dismissKey,
  className,
}: PageMessageProps) {
  const [dismissed, setDismissed] = useState(() => readDismissed(dismissKey));
  if (dismissed) return null;
  const { icon: Icon, box, iconClass } = TONE[tone];

  return (
    <div
      // Only errors interrupt a screen reader; the rest are announced politely.
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex shrink-0 items-start gap-3 rounded-md border-l-4 px-3 py-3 text-sm text-foreground",
        box,
        className,
      )}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", iconClass)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-foreground/90">{children}</div>}
        {action && <div className="mt-1">{action}</div>}
      </div>
      {dismissKey && (
        <WithTooltip label="Dismiss">
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              setDismissed(true);
              try {
                sessionStorage.setItem(`page-message:${dismissKey}`, "1");
              } catch {
                // Storage unavailable: stays dismissed until the page remounts.
              }
            }}
            className="-m-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </WithTooltip>
      )}
    </div>
  );
}
