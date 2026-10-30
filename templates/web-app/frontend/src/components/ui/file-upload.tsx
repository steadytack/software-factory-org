import { UploadCloud } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { cn } from "../../lib/utils";
import { WithTooltip } from "./with-tooltip";

interface FileUploadProps {
  /** Called with each batch of accepted files. */
  onFiles: (files: File[]) => void;
  accept?: string;
  /** Allow several files at once (default true). */
  multiple?: boolean;
  /** Max size in MB per file (default 10). */
  maxSizeMb?: number;
  hint?: string;
  /** An icon button (the toolbar's Add) instead of the large panel; the label is its tooltip and accessible name. */
  compact?: boolean;
  /** Replaces the default label, e.g. "Add files". */
  label?: ReactNode;
  className?: string;
}

/** Splits a batch into files within the size limit and a message naming the
 *  ones left out, so one oversized file doesn't block the rest. */
export function splitBySize(files: File[], maxSizeMb: number): { ok: File[]; skipped: string | null } {
  const limit = maxSizeMb * 1_048_576;
  const ok = files.filter((f) => f.size <= limit);
  const tooBig = files.filter((f) => f.size > limit).map((f) => `"${f.name}"`);
  const skipped = tooBig.length
    ? `${tooBig.join(", ")} ${tooBig.length === 1 ? "is" : "are"} over the ${maxSizeMb} MB limit and ${tooBig.length === 1 ? "was" : "were"} skipped.`
    : null;
  return { ok, skipped };
}

/** Drag-and-drop / click file upload zone with a per-file size guard. */
export function FileUpload({
  onFiles,
  accept,
  multiple = true,
  maxSizeMb = 10,
  hint,
  compact = false,
  label,
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFiles(files: FileList | null): void {
    const { ok, skipped } = splitBySize(Array.from(files ?? []), maxSizeMb);
    setError(skipped);
    if (ok.length) onFiles(multiple ? ok : ok.slice(0, 1));
  }

  const zone = (
    <div
        role="button"
        tabIndex={0}
        aria-label={typeof label === "string" ? label : "Upload files"}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer items-center border border-dashed text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "size-8 justify-center rounded-md border-transparent bg-primary text-primary-foreground hover:bg-primary/90 pointer-coarse:size-11" : "flex-col gap-2 rounded-lg px-6 py-8",
          compact ? dragOver && "ring-2 ring-ring" : dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
        )}
      >
        <UploadCloud className={cn(compact ? "size-4" : "size-6 text-muted-foreground/70")} />
        <p className={cn(compact ? "sr-only" : "text-sm font-medium text-foreground")}>
          {label ?? (compact ? "Drop files or browse" : "Drop files here or click to browse")}
        </p>
        {hint && !compact && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
  );

  return (
    <div className={className}>
      {compact ? <WithTooltip label={label ?? "Add files"}>{zone}</WithTooltip> : zone}
      {error && <p className="mt-1 text-xs font-medium text-destructive">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        data-testid="file-upload-input"
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
