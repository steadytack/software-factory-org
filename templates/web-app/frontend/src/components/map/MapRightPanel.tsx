/** Map panel: Layers · Draw · Export. This file is only the shell (tab
 *  switching + scrolling); the tab bodies live in ./panel/*. The tab is
 *  controlled so the phone's map bar can open the panel on a given tab. */
import { FileDown, Layers, PencilRuler } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayersTab, type LayersTabProps } from "./panel/LayersTab";
import { DrawTab, type DrawTabProps } from "./panel/DrawTab";
import { ExportTab, type ExportTabProps } from "./panel/ExportTab";
import { CountBadge } from "../ui/count-badge";

export type MapPanelTab = "layers" | "draw" | "export";

export interface MapRightPanelProps {
  tab: MapPanelTab;
  onTabChange: (tab: MapPanelTab) => void;
  layers: Omit<LayersTabProps, "onOpenDraw">;
  draw: DrawTabProps;
  exporting: ExportTabProps;
}

export function MapRightPanel({ tab, onTabChange, layers, draw, exporting }: MapRightPanelProps) {
  return (
    <Tabs value={tab} onValueChange={(v) => onTabChange(v as MapPanelTab)} className="flex h-full min-h-0 flex-col gap-0">
      <TabsList variant="line" className="w-full shrink-0 justify-start rounded-none border-b border-border bg-transparent px-2 pt-1">
        <TabsTrigger value="layers" className="flex-none px-3">
          <Layers aria-hidden />
          Layers
        </TabsTrigger>
        <TabsTrigger value="draw" className="flex-none px-3">
          <PencilRuler aria-hidden />
          Draw
          {draw.features.length > 0 && (
            <CountBadge n={draw.features.length} />
          )}
        </TabsTrigger>
        <TabsTrigger value="export" className="flex-none px-3">
          <FileDown aria-hidden />
          Export
        </TabsTrigger>
      </TabsList>
      <TabsContent value="layers" className="min-h-0 flex-1 overflow-y-auto">
        <LayersTab {...layers} onOpenDraw={() => onTabChange("draw")} />
      </TabsContent>
      <TabsContent value="draw" className="min-h-0 flex-1 overflow-y-auto">
        <DrawTab {...draw} />
      </TabsContent>
      <TabsContent value="export" className="min-h-0 flex-1 overflow-y-auto">
        <ExportTab {...exporting} />
      </TabsContent>
    </Tabs>
  );
}
