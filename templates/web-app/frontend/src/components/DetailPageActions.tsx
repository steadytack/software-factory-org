import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { IconButton } from "./ui/icon-button";
import { WithTooltip } from "./ui/with-tooltip";

export interface DetailAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Shown as the tooltip when disabled, e.g. why it can't be used now. */
  disabledReason?: string;
  /** The page's main action: filled rather than outlined. */
  primary?: boolean;
  /** Not shown on a phone, where the bottom bar already does it. */
  phoneHidden?: boolean;
  /** On a phone, only the icon (the label stays as its accessible name and tooltip). */
  phoneIconOnly?: boolean;
}

export interface DetailMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Delete and the like: red, and separated from the others. */
  destructive?: boolean;
}

/** A record page's header actions: labelled buttons for the everyday ones,
 *  and a "⋯" menu for the rare or destructive ones (archive, delete), so
 *  they're never one slip away from Save. Shared by the site, survey,
 *  finding and action pages. */
export function DetailPageActions({
  actions = [],
  menu = [],
  menuLabel = "More actions",
}: {
  actions?: DetailAction[];
  menu?: DetailMenuItem[];
  menuLabel?: string;
}) {
  const everyday = menu.filter((m) => !m.destructive);
  const destructive = menu.filter((m) => m.destructive);
  return (
    <>
      {actions.map((a) => {
        const button = (
          <Button
            key={a.label}
            variant={a.primary ? "default" : "outline"}
            size="sm"
            className={cn(a.phoneHidden && "max-sm:hidden", a.phoneIconOnly && "max-sm:w-7 max-sm:px-0 pointer-coarse:max-sm:w-11")}
            aria-label={a.phoneIconOnly ? a.label : undefined}
            disabled={a.disabled}
            onClick={a.onClick}
          >
            {a.icon}
            <span className={a.phoneIconOnly ? "max-sm:sr-only" : undefined}>{a.label}</span>
          </Button>
        );
        return a.disabled && a.disabledReason ? (
          <WithTooltip key={a.label} label={a.disabledReason}>
            <span className={a.phoneHidden ? "inline-flex max-sm:hidden" : "inline-flex"} tabIndex={0}>
              {button}
            </span>
          </WithTooltip>
        ) : (
          button
        );
      })}
      {menu.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label={menuLabel} variant="outline" size="icon-sm">
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            {everyday.map((m) => (
              <DropdownMenuItem key={m.label} disabled={m.disabled} onSelect={m.onClick}>
                {m.icon}
                {m.label}
              </DropdownMenuItem>
            ))}
            {everyday.length > 0 && destructive.length > 0 && <DropdownMenuSeparator />}
            {destructive.map((m) => (
              <DropdownMenuItem
                key={m.label}
                disabled={m.disabled}
                onSelect={m.onClick}
                variant="destructive"
              >
                {m.icon}
                {m.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}
