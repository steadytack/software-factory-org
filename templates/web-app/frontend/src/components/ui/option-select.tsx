import { cn } from "cn";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

export interface Option {
  value: string;
  label: string;
}

/** A compact single-choice dropdown for toolbars and filter rows: the app's
 *  themed Select, sized to sit beside an h-8 search box. Use this rather
 *  than a native <select>, which renders as the OS control (and ignores
 *  dark mode). Values must be non-empty strings. */
export function OptionSelect({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  ariaLabel: string;
  className?: string;
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label={ariaLabel} className={cn("text-xs", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
