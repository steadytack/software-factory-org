import { TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

const ICON_TONE = {
  neutral: "text-muted-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
} as const;

interface StatCardProps {
  label: string;
  value: number | string;
  /** Change indicator, e.g. "+12%". Colour is paired with an icon. */
  delta?: string;
  trend?: "up" | "down" | "flat";
  meta?: ReactNode;
  icon?: ReactNode;
  /** Colours the icon. Defaults to a neutral grey. */
  tone?: keyof typeof ICON_TONE;
  className?: string;
}

/** KPI/stat card: label, large value, optional delta + meta line. */
export function StatCard({
  label,
  value,
  delta,
  trend = "flat",
  meta,
  icon,
  tone = "neutral",
  className,
}: StatCardProps) {
  const TrendIcon = trend === "down" ? TrendingDown : TrendingUp;
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border border-border bg-card p-(--card-pad) text-card-foreground shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {icon && (
          <span
            className={cn("shrink-0 [&_svg]:size-4", ICON_TONE[tone])}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="text-numeral tnum">{value}</p>
      {(delta || meta) && (
        <p className="flex items-center gap-2 text-xs">
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium tnum",
                // a `flat` delta is neutral. It used to render green like an improvement,
                // because anything that was not "down" was treated as "up".
                trend === "down"
                  ? "bg-destructive-subtle text-destructive-fg"
                  : trend === "up"
                    ? "bg-success-subtle text-success-fg"
                    : "bg-muted text-muted-foreground",
              )}
            >
              <TrendIcon className={cn("size-3", trend === "flat" && "hidden")} />
              {delta}
            </span>
          )}
          {meta && <span className="text-muted-foreground">{meta}</span>}
        </p>
      )}
    </div>
  );
}
