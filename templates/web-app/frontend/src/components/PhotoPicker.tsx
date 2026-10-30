import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";

import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { WithTooltip } from "./ui/with-tooltip";

/** Photos chosen in a form before the record exists: "Take photo" opens the
 *  rear camera on a phone (an image picker on a desktop), "Choose photos"
 *  picks several from the library. Previews come from local object URLs;
 *  the caller uploads the files once the record has an id. */
export function PhotoPicker({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const [dropping, setDropping] = useState(false);
  function addFiles(list: File[]) {
    const picked = list.filter((f) => f.type.startsWith("image/"));
    if (picked.length) onChange([...files, ...picked]);
  }
  function add(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles([...(e.target.files ?? [])]);
    e.target.value = "";
  }

  return (
    // Photos can also be dropped anywhere on this field.
    <div
      className={`space-y-(--field-gap) rounded-md transition-colors ${dropping ? "bg-primary/5 outline-2 outline-dashed outline-primary outline-offset-4" : ""}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        addFiles([...e.dataTransfer.files]);
      }}
    >
      <Label>Photos</Label>
      {files.length > 0 && (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {files.map((file, i) => (
            <li key={previews[i]} className="relative">
              <img
                src={previews[i]}
                alt={file.name}
                className="aspect-square w-full rounded-md border border-border object-cover"
              />
              <WithTooltip label={`Remove ${file.name}`}>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => onChange(files.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full border border-border bg-popover text-muted-foreground shadow-sm hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </WithTooltip>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => cameraRef.current?.click()}>
          <Camera />
          Take photo
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => libraryRef.current?.click()}>
          <ImagePlus />
          Choose photos
        </Button>
        <span className="text-xs text-muted-foreground">
          <span className="hidden md:inline">Or drop them here · </span>uploaded when you save · max 10 MB each
        </span>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={add}
        data-testid="photo-camera-input"
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={add}
        data-testid="photo-library-input"
      />
    </div>
  );
}
