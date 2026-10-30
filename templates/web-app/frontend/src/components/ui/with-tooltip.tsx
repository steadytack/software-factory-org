import type { ComponentProps, ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

/** Gives any single focusable element the app's tooltip. For an icon-only control that is not
 *  an IconButton (a drag handle, a swatch, a clear button inside a field), so every icon-only
 *  control still says what it does on hover and focus. */
export function WithTooltip({
  label,
  side,
  children,
}: {
  label: ReactNode;
  side?: ComponentProps<typeof TooltipContent>["side"];
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
