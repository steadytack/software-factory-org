import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "./dropdown-menu";
import { IconButton } from "./icon-button";
import type { Option } from "./option-select";

/** A single choice (sort order, a filter) as an icon button that opens a menu of the options, the current one ticked.
 *  `highlighted` puts a dot on the icon when the choice is not the default (a filter in use). */
export function IconSelect({
  icon,
  label,
  value,
  onChange,
  options,
  highlighted = false,
  className,
}: {
  icon: ReactNode;
  /** Accessible name and tooltip, e.g. "Sort comments". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  highlighted?: boolean;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={label} variant="outline" className={cn("relative", className)}>
          {icon}
          {highlighted && <span aria-hidden className="absolute top-1 right-1 size-2 rounded-full bg-primary" />}
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
