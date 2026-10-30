import * as React from "react";

import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

type ButtonProps = React.ComponentProps<typeof Button>;

export interface IconButtonProps extends Omit<ButtonProps, "aria-label" | "title"> {
  /** Accessible name and tooltip text — required, since the button has no
   *  visible label. */
  label: string;
  /** Extra tooltip content after the label, e.g. a keyboard hint. */
  hint?: React.ReactNode;
  tooltipSide?: React.ComponentProps<typeof TooltipContent>["side"];
}

/** The app's one icon-only button: a shadcn Button plus the shared Tooltip,
 *  so every icon action (toolbars, rows, header, map) shows the same hover
 *  label instead of a mix of native `title` popups and styled tooltips. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, hint, tooltipSide, variant = "ghost", size = "icon", className, children, ...props },
    ref,
  ) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={ref}
            variant={variant}
            size={size}
            aria-label={label}
            className={cn(className)}
            {...props}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide}>
          {label}
          {hint}
        </TooltipContent>
      </Tooltip>
    );
  },
);
