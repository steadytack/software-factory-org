/** "Add data" for the Layers tab: GeoJSON files and zipped shapefiles
 *  (chosen or dropped, several at once, read off the main thread and
 *  converted from British National Grid if need be), suggested services
 *  such as the EA flood zones, and any WMS / WFS / OGC API service — in a
 *  dialog so the layer list stays short. */
import { useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import { FileUp, Globe, Loader2 } from "lucide-react";

import type { DataLayerStyle, MapDataLayer } from "../layers/types";
import { SUGGESTED_SERVICES, type SuggestedService, type ViewBox } from "../layers/external";
import { importFile } from "../utils/importClient";
import { MAX_FILE_MB } from "../utils/importData";
import { ExternalLayerAdder } from "./ExternalLayerAdder";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function AddDataDialog({
  open,
  onOpenChange,
  onAddGeoJSONLayer,
  onAddWMSLayer,
  onNotify,
  getView,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddGeoJSONLayer: (
    name: string,
    data: FeatureCollection,
    style?: Partial<DataLayerStyle>,
    service?: MapDataLayer["service"],
  ) => void;
  onAddWMSLayer: (name: string, tileUrl: string, attribution?: string, legendUrl?: string) => void;
  onNotify?: (message: string, tone?: "info" | "error") => void;
  getView?: () => ViewBox | undefined;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dropping, setDropping] = useState(false);
  const [reading, setReading] = useState(0);
  const [preset, setPreset] = useState<SuggestedService | null>(null);

  /** Each file becomes its own layer (a zip may hold several); one bad file
   *  doesn't stop the rest. The dialog stays open while they're read. */
  async function addFiles(files: File[]) {
    let added = 0;
    setReading((n) => n + files.length);
    await Promise.all(
      files.map(async (file) => {
        try {
          const { layers, warning } = await importFile(file);
          if (warning) onNotify?.(warning);
          for (const layer of layers) {
            onAddGeoJSONLayer(layer.name, layer.data);
            for (const note of layer.notes) onNotify?.(`${layer.name}: ${note}`);
            added++;
          }
        } catch (err) {
          onNotify?.(err instanceof Error ? err.message : `Could not read ${file.name}`, "error");
        } finally {
          setReading((n) => n - 1);
        }
      }),
    );
    if (added) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add data</DialogTitle>
          <DialogDescription className="sr-only">Add a file or a web map service as a layer.</DialogDescription>
        </DialogHeader>
        <input
          ref={fileRef}
          type="file"
          accept=".geojson,.json,.zip"
          multiple
          className="hidden"
          data-testid="geojson-input"
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setDropping(true);
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDropping(false);
            void addFiles(Array.from(e.dataTransfer.files));
          }}
          onClick={() => fileRef.current?.click()}
          className={`flex w-full flex-col items-center gap-1 rounded-md border border-dashed px-3 py-5 text-dense transition-colors ${
            dropping ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:bg-muted/40"
          }`}
        >
          {reading > 0 ? <Loader2 className="size-5 animate-spin" /> : <FileUp className="size-5" />}
          <span className="text-foreground">
            {reading > 0 ? `Reading ${reading} file${reading === 1 ? "" : "s"}…` : "GeoJSON or zipped shapefile"}
          </span>
          <span className="text-xs">Drop files here or click to choose, up to {MAX_FILE_MB} MB each</span>
        </button>
        <div className="min-w-0">
          <p className="pb-2 text-xs font-medium text-muted-foreground">Suggested</p>
          <ul className="grid gap-2">
            {SUGGESTED_SERVICES.map((svc) => (
              <li key={svc.url}>
                <button
                  type="button"
                  onClick={() => setPreset(svc)}
                  aria-pressed={preset?.url === svc.url}
                  className="flex w-full min-w-0 items-start gap-2 rounded-md border border-border px-3 py-2 text-left hover:bg-muted/40 aria-pressed:border-primary"
                >
                  <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block text-dense text-foreground">{svc.title}</span>
                    <span className="block text-xs text-muted-foreground">{svc.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <p className="pb-2 text-xs font-medium text-muted-foreground">Or a web map service</p>
          <ExternalLayerAdder
            key={preset?.url ?? "custom"}
            preset={preset}
            getView={getView}
            onAddGeoJSONLayer={(...args) => {
              onAddGeoJSONLayer(...args);
              onOpenChange(false);
            }}
            onAddWMSLayer={(...args) => {
              onAddWMSLayer(...args);
              onOpenChange(false);
            }}
            onNotify={onNotify}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
