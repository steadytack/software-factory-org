/** Shared building blocks for the map side-panel tabs, so every tab uses the
 *  same section headings, field layout and controls as the rest of the app. */
import { useId, type ReactNode } from "react";
import type { FeatureCollection } from "geojson";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BRAND_BLUE } from "../layers/colors";
import { WithTooltip } from "../../ui/with-tooltip";

export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-border px-3 py-3 last:border-b-0", className)}>
      <div className="mb-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-dense font-semibold text-foreground">{title}</h3>
          {description && <p className="mt-0.5 truncate text-dense text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-0.5">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Label above a control. */
export function FieldRow({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-(--field-gap)", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
          {label}
        </Label>
        {hint && <span className="text-xs tabular-nums text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const SWATCHES = [
  BRAND_BLUE, "#1d7afc", "#22a06b", "#e2b203", "#f38a3f", "#c9372c",
  "#ae4787", "#8270db", "#172b4d", "#626f86", "#ffffff", "#000000",
];

/** Colour control: a swatch button opening preset colours + a custom picker
 *  (replaces bare `<input type="color">` boxes). */
export function ColorField({
  label,
  value,
  onChange,
  compact = false,
  mixed = false,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  /** Several things with different colours are being edited at once: say so instead of showing one. */
  mixed?: boolean;
  /** Just the swatch (for lists), named by `label` for screen readers. */
  compact?: boolean;
}) {
  const id = useId();
  const popover = (
      <Popover>
        {compact ? (
          // The tooltip wraps the trigger (not the other way round) so the popover's handlers reach the button.
          <WithTooltip label={`${label} colour`}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`${label} colour`}
                className="size-6 shrink-0 rounded-sm border border-border shadow-xs hover:ring-2 hover:ring-ring/40"
                style={{ background: value }}
              />
            </PopoverTrigger>
          </WithTooltip>
        ) : (
          <PopoverTrigger asChild>
            <button
              id={id}
              type="button"
              className="flex h-8 w-full items-center gap-2 rounded-md border border-input bg-card px-2 text-left text-xs text-foreground hover:bg-muted"
            >
              <span className="size-4 shrink-0 rounded-sm border border-border" style={{ background: mixed ? "transparent" : value }} />
              <span className={mixed ? "text-muted-foreground" : "font-mono uppercase"}>{mixed ? "Mixed" : value}</span>
            </button>
          </PopoverTrigger>
        )}
        <PopoverContent align="start" className="w-52 gap-2 p-2">
          <div className="grid grid-cols-6 gap-2" role="listbox" aria-label={`${label} colour`}>
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                role="option"
                aria-selected={c.toLowerCase() === value.toLowerCase()}
                aria-label={c}
                onClick={() => onChange(c)}
                className="grid size-6 place-items-center rounded-sm border border-border"
                style={{ background: c }}
              >
                {c.toLowerCase() === value.toLowerCase() && (
                  <Check className={cn("size-3.5", c === "#ffffff" ? "text-black" : "text-white")} />
                )}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Custom
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="h-6 w-full cursor-pointer rounded-sm border border-border bg-transparent"
            />
          </label>
        </PopoverContent>
      </Popover>
  );
  if (compact) return popover;
  return (
    <FieldRow label={label} htmlFor={id}>
      {popover}
    </FieldRow>
  );
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  format = (v) => String(v),
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <FieldRow label={label} hint={format(value)}>
      <Slider
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        className="py-2"
      />
    </FieldRow>
  );
}

export function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 py-1">
      <Label htmlFor={id} className="flex flex-col items-start gap-0 text-dense font-normal text-foreground">
        {label}
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </Label>
      <Switch id={id} size="sm" checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/** Runtime guard: a parsed upload must be a GeoJSON FeatureCollection with
 *  an array of feature objects before it reaches MapLibre (malformed GeoJSON
 *  otherwise throws deep inside the renderer). */
export function isFeatureCollection(value: unknown): value is FeatureCollection {
  return (
    value != null &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "FeatureCollection" &&
    Array.isArray((value as { features?: unknown }).features)
  );
}
