/** Export tab: a print-ready map sheet (PDF or PNG — map-first layout,
 *  title block, location, locator, BNG grid, north arrow, scale bar,
 *  legend, credits) plus sketch data downloads. */
import { useState } from "react";
import { Braces, Eye, FileDown, Loader2, Sheet } from "lucide-react";

import type { Orientation, PaperSize, PrintFormat, PrintOptions, SheetStatus } from "../utils/printMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { FieldRow, Section, SwitchRow } from "./primitives";

export type PrintRequest = Omit<PrintOptions, "legendFor" | "describeLocation" | "attribution" | "copyright" | "dpi">;

export interface ExportTabProps {
  defaultAuthor: string;
  onPrint: (req: PrintRequest) => Promise<void>;
  onPreview: (req: PrintRequest) => Promise<string>;
  onExportGeoJSON: () => void;
  onExportCSV: () => void;
  sketchCount: number;
}

const SCALES: { value: string; label: string }[] = [
  { value: "fit", label: "Fit current view" },
  { value: "500", label: "1:500" },
  { value: "1250", label: "1:1,250" },
  { value: "2500", label: "1:2,500" },
  { value: "10000", label: "1:10,000" },
  { value: "25000", label: "1:25,000" },
];

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  className?: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <FieldRow label={label} className={className}>
      <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-muted p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-6 flex-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors duration-(--duration-fast) hover:text-foreground",
              value === o.value && "bg-background text-foreground shadow-sm",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </FieldRow>
  );
}

export function ExportTab({ defaultAuthor, onPrint, onPreview, onExportGeoJSON, onExportCSV, sketchCount }: ExportTabProps) {
  const [format, setFormat] = useState<PrintFormat>("pdf");
  const [paper, setPaper] = useState<PaperSize>("a4");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [title, setTitle] = useState("Site plan");
  const [subtitle, setSubtitle] = useState("");
  const [scale, setScale] = useState("fit");
  const [showGrid, setShowGrid] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showNorthArrow, setShowNorthArrow] = useState(true);
  const [showScaleBar, setShowScaleBar] = useState(true);
  const [showLocator, setShowLocator] = useState(true);
  const [address, setAddress] = useState("");
  const [drawingNo, setDrawingNo] = useState("");
  const [revision, setRevision] = useState("");
  const [status, setStatus] = useState<SheetStatus>("Draft");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<"export" | "preview" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const request = (): PrintRequest => ({
    format,
    paper,
    orientation,
    title,
    subtitle,
    author: defaultAuthor,
    scale: scale === "fit" ? null : Number(scale),
    showGrid,
    showLegend,
    showNorthArrow,
    showScaleBar,
    showLocator,
    address,
    drawingNo,
    revision,
    status,
    notes,
  });

  async function run(kind: "export" | "preview") {
    setBusy(kind);
    try {
      if (kind === "export") await onPrint(request());
      else setPreview(await onPreview(request()));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <Section title="Map sheet">
        {/* Three groups split by a hairline, like Draw → Labels: what the sheet says, how it is laid out, what it shows. */}
        <div className="grid grid-cols-2 gap-(--card-gap)">
          <FieldRow label="Title" className="col-span-2">
            <Input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-dense" />
          </FieldRow>
          <FieldRow label="Subtitle" className="col-span-2">
            <Input
              aria-label="Subtitle"
              value={subtitle}
              placeholder="Optional"
              onChange={(e) => setSubtitle(e.target.value)}
              className="h-8 text-dense"
            />
          </FieldRow>
          <FieldRow label="Location" className="col-span-2">
            <Input
              aria-label="Location"
              value={address}
              placeholder="Automatic"
              onChange={(e) => setAddress(e.target.value)}
              className="h-8 text-dense"
            />
          </FieldRow>
          <FieldRow label="Drawing no.">
            <Input aria-label="Drawing no." value={drawingNo} placeholder="e.g. FL-001" onChange={(e) => setDrawingNo(e.target.value)} className="h-8 text-dense" />
          </FieldRow>
          <FieldRow label="Revision">
            <Input aria-label="Revision" value={revision} placeholder="e.g. A" onChange={(e) => setRevision(e.target.value)} className="h-8 text-dense" />
          </FieldRow>
          <FieldRow label="Status" className="col-span-2">
            <Select value={status} onValueChange={(v) => setStatus(v as SheetStatus)}>
              <SelectTrigger size="sm" className="w-full" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["Draft", "For information", "Issued"] as const).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Notes" className="col-span-2">
            <Textarea
              aria-label="Notes"
              value={notes}
              rows={2}
              placeholder="Optional"
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-14 text-dense"
            />
          </FieldRow>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-(--card-gap) border-t border-border pt-3">
          <Segmented label="Paper" value={paper} onChange={setPaper} options={[{ value: "a4", label: "A4" }, { value: "a3", label: "A3" }]} />
          <Segmented label="Format" value={format} onChange={setFormat} options={[{ value: "pdf", label: "PDF" }, { value: "png", label: "PNG" }]} />
          <Segmented
            className="col-span-2"
            label="Orientation"
            value={orientation}
            onChange={setOrientation}
            options={[{ value: "landscape", label: "Landscape" }, { value: "portrait", label: "Portrait" }]}
          />
          <FieldRow label="Scale" className="col-span-2">
            <Select value={scale} onValueChange={setScale}>
              <SelectTrigger size="sm" className="w-full" aria-label="Scale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCALES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
        </div>
        <div className="mt-3 border-t border-border pt-3">
          <SwitchRow label="British National Grid" checked={showGrid} onCheckedChange={setShowGrid} />
          <SwitchRow label="Legend" checked={showLegend} onCheckedChange={setShowLegend} />
          <SwitchRow label="Locator map" checked={showLocator} onCheckedChange={setShowLocator} />
          <SwitchRow label="North arrow" checked={showNorthArrow} onCheckedChange={setShowNorthArrow} />
          <SwitchRow label="Scale bar" checked={showScaleBar} onCheckedChange={setShowScaleBar} />
        </div>
        <div className="mt-3 flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void run("preview")}>
            {busy === "preview" ? <Loader2 className="animate-spin" /> : <Eye />}
            Preview
          </Button>
          <Button type="button" size="sm" className="flex-1" disabled={busy !== null} onClick={() => void run("export")}>
            {busy === "export" ? <Loader2 className="animate-spin" /> : <FileDown />}
            {busy === "export" ? "Exporting…" : `Export ${format.toUpperCase()}`}
          </Button>
        </div>
        {preview && (
          <img
            src={preview}
            alt="Preview of the exported map sheet"
            className="mt-3 w-full rounded-md border border-border bg-white shadow-sm"
          />
        )}
      </Section>

      <Section title="Sketch data">
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={sketchCount === 0} onClick={onExportGeoJSON}>
            <Braces />
            GeoJSON
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={sketchCount === 0} onClick={onExportCSV}>
            <Sheet />
            CSV
          </Button>
        </div>
      </Section>
    </div>
  );
}
