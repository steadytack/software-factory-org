/** Shown while a drawing or measuring tool is active: which tool, how to
 *  use it, snapping, and Done to put the tool away. On a phone it is a frosted
 *  capsule above the tab pill; on desktop it sits bottom-centre. */
import { Check, Magnet } from "lucide-react";

import type { DrawTool } from "./hooks/useMapDraw";
import { drawToolInfo } from "./draw/tools";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { IconButton } from "../ui/icon-button";

export function DrawModeBar({
  tool,
  snapEnabled,
  onToggleSnap,
  onDone,
  className,
}: {
  tool: DrawTool;
  snapEnabled: boolean;
  onToggleSnap: () => void;
  onDone: () => void;
  className?: string;
}) {
  const info = drawToolInfo(tool);
  if (!info) return null;
  return (
    <div
      role="status"
      className={cn(
        "glass absolute z-(--z-dock) flex items-center gap-2 rounded-xl p-2 pl-4 md:map-panel md:pl-4",
        className,
      )}
    >
      <span aria-hidden className="block size-5 shrink-0 text-primary">
        {info.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-dense font-medium leading-tight text-foreground">{info.title}</p>
        <p className="text-xs leading-tight text-muted-foreground">{info.hint}</p>
      </div>
      <IconButton
        type="button"
        variant={snapEnabled ? "secondary" : "ghost"}
        size="icon"
        aria-pressed={snapEnabled}
        label={snapEnabled ? "Snapping on" : "Snapping off"}
        onClick={onToggleSnap}
        className={cn("shrink-0", snapEnabled && "text-primary")}
      >
        <Magnet />
      </IconButton>
      <Button type="button" onClick={onDone} className="shrink-0">
        <Check />
        Done
      </Button>
    </div>
  );
}
