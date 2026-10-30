import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

import { cn } from "../../lib/utils";
import { IconButton, type IconButtonProps } from "./icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

/** Row actions convention (tables, lists, file rows):
 *
 *  - Actions with an obvious icon (open, download, preview, delete) are
 *    small ghost icon buttons with a tooltip — never text buttons.
 *  - Anything not clearly expressible as an icon ("Revoke admin",
 *    "Set password") goes in a single ⋯ menu at the end of the row.
 *  - Destructive actions use `tone="destructive"` (red on hover only). */
export function RowActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center justify-end gap-0.5", className)}>{children}</div>;
}

export function RowActionButton({
  tone,
  className,
  ...props
}: IconButtonProps & { tone?: "destructive" }) {
  return (
    <IconButton
      size="icon-sm"
      className={cn(
        "text-tertiary group-hover:text-muted-foreground group-focus-within:text-muted-foreground hover:text-foreground",
        tone === "destructive" && "hover:bg-destructive-subtle hover:text-destructive-fg",
        className,
      )}
      {...props}
    />
  );
}

export interface RowMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "destructive";
  disabled?: boolean;
  /** Draw a separator above this item. */
  separated?: boolean;
}

/** The ⋯ ("meatballs") overflow menu for a row. */
export function RowActionsMenu({ items, label = "More actions" }: { items: RowMenuItem[]; label?: string }) {
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <RowActionButton label={label}>
          <MoreHorizontal />
        </RowActionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {items.map((item) => (
          <div key={item.label}>
            {item.separated && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={item.disabled}
              variant={item.tone === "destructive" ? "destructive" : "default"}
              onSelect={item.onSelect}
            >
              {item.icon}
              {item.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
