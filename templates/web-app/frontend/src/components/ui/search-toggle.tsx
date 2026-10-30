import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { cn } from "../../lib/utils";
import { IconButton } from "./icon-button";
import { Input } from "./input";

/** A list's search: an icon button that opens the field in its own row, so a toolbar of icons stays one tidy line. A
 *  search in use shows a dot on the icon; Escape or × closes the field (the text stays applied, the dot says so). */
export function SearchToggle({
  value,
  onChange,
  label,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name and tooltip, e.g. "Search comments". */
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <IconButton
        label={value ? `${label} (filter applied)` : label}
        variant="outline"
        onClick={() => setOpen(true)}
        className={cn("relative", className)}
      >
        <Search />
        {value && <span aria-hidden className="absolute top-1 right-1 size-2 rounded-full bg-primary" />}
      </IconButton>
    );
  }
  return (
    <div className="flex basis-full items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder ?? "Search…"}
          aria-label={label}
          className="h-8 pl-8 text-dense pointer-coarse:h-11 pointer-coarse:text-base"
        />
      </div>
      <IconButton
        label={value ? "Clear search" : "Close search"}
        variant="ghost"
        onClick={() => {
          if (value) onChange("");
          setOpen(false);
        }}
      >
        <X />
      </IconButton>
    </div>
  );
}
