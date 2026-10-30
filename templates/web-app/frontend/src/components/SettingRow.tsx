import type { ReactNode } from "react";

import { cn } from "../lib/utils";

/** One setting: its label on the left, the control on the right. Stack them in a `divide-y` list. */
export function SettingRow({ label, labelId, children }: { label: string; labelId?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-(--setting-h) items-center justify-between gap-4 py-1">
      <span id={labelId} className="text-dense text-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

/** A setting that is on or off: the whole row is the switch (`role="checkbox"`, so it keeps its
 *  checkbox semantics and accessible name). */
export function SettingToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-(--setting-h) w-full items-center justify-between gap-4 py-1 text-left"
    >
      <span className="text-dense text-foreground">{label}</span>
      <span
        aria-hidden
        className={cn(
          "relative h-4 w-7 shrink-0 rounded-full transition-colors duration-(--duration-fast)",
          checked ? "bg-primary" : "bg-muted ring-1 ring-input ring-inset",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-3 rounded-full bg-background shadow-sm transition-transform duration-(--duration-fast)",
            checked && "translate-x-3",
          )}
        />
      </span>
    </button>
  );
}
