import { cn } from "../../lib/utils";

/** A small segmented control: one choice from a few, shown as a row of options in a muted track. Keeps
 *  the radio semantics (`role="radiogroup"` / `role="radio"`), so it reads and works like a radio group. */
export function Segmented<T extends string>({
  labelId,
  options,
  value,
  onChange,
}: {
  /** The id of the element that labels the group. */
  labelId: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="inline-flex rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-6 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors duration-(--duration-fast) pointer-coarse:h-10",
            "hover:text-foreground aria-checked:bg-background aria-checked:text-foreground aria-checked:shadow-sm aria-checked:ring-1 aria-checked:ring-border",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
