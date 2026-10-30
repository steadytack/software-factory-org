/** Getting around the map on desktop: zoom, reset view, my location, full page, then Layers, Draw and Export, as a column under
 *  the search bar. (On a phone, Reset and Locate sit in the bottom bar and you pinch to zoom.) Styled with
 *  theme tokens so it adapts to light/dark. */
import type { ReactNode } from "react";
import { FileDown, House, Layers, LocateFixed, Maximize2, Minimize2, PencilRuler, ZoomIn, ZoomOut } from "lucide-react";
import { IconButton } from "../ui/icon-button";
import { cn } from "../../lib/utils";

interface Props {
  isFullscreen: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onHome: () => void;
  onFullscreen: () => void;
  onLocate: () => void;
  /** Desktop: open the side panel on its Layers, Draw or Export tab (the tools live there). */
  onLayers?: () => void;
  onDraw?: () => void;
  onExport?: () => void;
  /** Which panel tab is open, so its button shows as active. */
  openTab?: "layers" | "draw" | "export" | null;
  className?: string;
}

function CtrlBtn({
  title,
  active,
  onClick,
  children,
  tooltipSide,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  tooltipSide: "left" | "right";
}) {
  return (
    <IconButton
      label={title}
      tooltipSide={tooltipSide}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "size-8 shrink-0",
        active
          ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
          : "text-foreground/70",
      )}
    >
      {children}
    </IconButton>
  );
}

export function MapNavControls({
  isFullscreen,
  onZoomIn,
  onZoomOut,
  onHome,
  onFullscreen,
  onLocate,
  onLayers,
  onDraw,
  onExport,
  openTab,
  className,
}: Props) {
  const side = "right";
  return (
    <div
      role="toolbar"
      aria-label="Map navigation"
      aria-orientation="vertical"
      className={cn(
        "map-panel absolute z-(--z-sticky) flex flex-col items-center gap-0.5 p-1",
        className,
      )}
    >
      <CtrlBtn title="Zoom in" onClick={onZoomIn} tooltipSide={side}><ZoomIn className="size-4" /></CtrlBtn>
      <CtrlBtn title="Zoom out" onClick={onZoomOut} tooltipSide={side}><ZoomOut className="size-4" /></CtrlBtn>
      <div className="my-0.5 h-px w-6 bg-border" />
      <CtrlBtn title="Reset view" onClick={onHome} tooltipSide={side}><House className="size-4" /></CtrlBtn>
      <CtrlBtn title="My location" onClick={onLocate} tooltipSide={side}><LocateFixed className="size-4" /></CtrlBtn>
      <CtrlBtn
        title={isFullscreen ? "Exit full page" : "Expand full page"}
        active={isFullscreen}
        onClick={onFullscreen}
        tooltipSide={side}
      >
        {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </CtrlBtn>
      {(onLayers || onDraw || onExport) && <div className="my-0.5 h-px w-6 bg-border" />}
      {onLayers && (
        <CtrlBtn title="Layers" active={openTab === "layers"} onClick={onLayers} tooltipSide={side}>
          <Layers className="size-4" />
        </CtrlBtn>
      )}
      {onDraw && (
        <CtrlBtn title="Draw and measure" active={openTab === "draw"} onClick={onDraw} tooltipSide={side}>
          <PencilRuler className="size-4" />
        </CtrlBtn>
      )}
      {onExport && (
        <CtrlBtn title="Export" active={openTab === "export"} onClick={onExport} tooltipSide={side}>
          <FileDown className="size-4" />
        </CtrlBtn>
      )}
    </div>
  );
}
