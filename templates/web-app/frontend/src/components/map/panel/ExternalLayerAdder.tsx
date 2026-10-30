/** "Add external layer" form: paste a WMS/WFS GetCapabilities URL or an OGC
 *  API Features landing URL, pick a layer/feature-type/collection from the
 *  list the server returns, and add it to the map. */
import { useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";
import type { DataLayerStyle } from "../layers/types";
import {
  fetchCapabilities,
  fetchExternalFeatures,
  buildWmsLegendUrl,
  buildWmsTileUrl,
  type ExternalLayerOption,
  type ExternalServiceType,
  type SuggestedService,
  type ViewBox,
} from "../layers/external";
import type { MapDataLayer } from "../layers/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SERVICE_LABELS: Record<ExternalServiceType, string> = {
  wms: "WMS",
  wfs: "WFS",
  "ogc-features": "OGC API Features",
};

export interface ExternalLayerAdderProps {
  onAddGeoJSONLayer: (
    name: string,
    data: FeatureCollection,
    style?: Partial<DataLayerStyle>,
    service?: MapDataLayer["service"],
  ) => void;
  onAddWMSLayer: (name: string, tileUrl: string, attribution?: string, legendUrl?: string) => void;
  onNotify?: (message: string, tone?: "info" | "error") => void;
  /** The map's current view: WFS / OGC API fetch only what's in it. */
  getView?: () => ViewBox | undefined;
  /** A suggested service to start from (fills in the form and fetches). */
  preset?: SuggestedService | null;
}

export function ExternalLayerAdder({
  onAddGeoJSONLayer,
  onAddWMSLayer,
  onNotify,
  getView,
  preset,
}: ExternalLayerAdderProps) {
  const [serviceType, setServiceType] = useState<ExternalServiceType>(preset?.type ?? "wms");
  const [url, setUrl] = useState(preset?.url ?? "");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<ExternalLayerOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleFetch(target = url) {
    const trimmed = target.trim();
    if (!trimmed) return;
    setLoading(true);
    setOptions([]);
    setSelectedId("");
    try {
      const found = await fetchCapabilities(serviceType, trimmed);
      setOptions(found);
      setSelectedId(found[0].id);
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : "Could not fetch capabilities from that URL",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    const option = options.find((o) => o.id === selectedId);
    if (!option) return;
    setAdding(true);
    try {
      const attribution = preset && preset.url === url.trim() ? preset.attribution : undefined;
      if (serviceType === "wms") {
        onAddWMSLayer(option.title, buildWmsTileUrl(url.trim(), option.id), attribution, buildWmsLegendUrl(url.trim(), option.id));
      } else {
        const { data, truncated } = await fetchExternalFeatures(serviceType, url.trim(), option.id, getView?.());
        if (truncated) {
          onNotify?.(
            `Showing the first ${data.features.length.toLocaleString("en-GB")} features in view — zoom in and use Refresh for this view for the rest.`,
          );
        }
        onAddGeoJSONLayer(option.title, data, undefined, { type: serviceType, url: url.trim(), id: option.id });
      }
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : "Could not load that layer", "error");
    } finally {
      setAdding(false);
    }
  }

  // A suggested service: fill in and list its layers straight away.
  useEffect(() => {
    if (!preset) return;
    setServiceType(preset.type);
    setUrl(preset.url);
    void handleFetch(preset.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(SERVICE_LABELS) as ExternalServiceType[]).map((t) => (
          <Button
            key={t}
            type="button"
            size="sm"
            variant={serviceType === t ? "secondary" : "outline"}
            aria-pressed={serviceType === t}
            className="min-w-0 truncate px-2"
            onClick={() => {
              setServiceType(t);
              setOptions([]);
              setSelectedId("");
            }}
          >
            {t === "ogc-features" ? "OGC API" : SERVICE_LABELS[t]}
          </Button>
        ))}
      </div>

      <Input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={
          serviceType === "ogc-features"
            ? "OGC API Features landing URL…"
            : `${SERVICE_LABELS[serviceType]} endpoint URL…`
        }
        aria-label="Service URL"
        className="h-8 min-w-0 text-xs"
      />

      <Button type="button" variant="secondary" onClick={() => void handleFetch()}>
        {loading ? "Fetching…" : "Fetch layers"}
      </Button>

      {options.length > 0 && (
        <>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger size="sm" className="w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" onClick={() => void handleAdd()}>
            {adding ? "Adding…" : "Add layer"}
          </Button>
        </>
      )}
    </div>
  );
}
