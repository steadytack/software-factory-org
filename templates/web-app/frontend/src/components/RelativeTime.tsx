import { formatDateTime } from "../lib/format";
import { cn, relTime } from "../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/** "3h ago", with the exact timestamp on hover/focus and in a <time> element. */
export function RelativeTime({ value, className }: { value: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={value} className={cn("tnum", className)} tabIndex={0}>
          {relTime(value)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{formatDateTime(value)}</TooltipContent>
    </Tooltip>
  );
}
