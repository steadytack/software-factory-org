/** Attachments tab: real file upload, list, download and delete.
 *  Files are stored on the backend filesystem (Docker volume) via the
 *  multipart upload endpoint; downloads go through an authenticated route. */
import { useMemo, useRef, useState } from "react";
import { ArrowUpDown, Camera, Download, Eye, ListFilter, Paperclip, Trash2 } from "lucide-react";

import { useAttachments, useCreateAttachment, useDeleteAttachment } from "../hooks/useComments";
import { useCan } from "../hooks/useCan";
import { cn, formatSize } from "../lib/utils";
import { toast } from "sonner";
import { FileUpload, splitBySize } from "./ui/file-upload";
import { RelativeTime } from "./RelativeTime";
import { IconButton } from "./ui/icon-button";
import { LoadError } from "./LoadError";
import { EmptyState } from "./ui/empty-state";
import type { EntityName } from "../lib/vocabularies";
import { PageCapBanner } from "./PageCapBanner";
import { RowActionButton, RowActions } from "./ui/row-actions";
import { IconSelect } from "./ui/icon-select";
import { SearchToggle } from "./ui/search-toggle";
import { ListSkeleton } from "./ui/list-skeleton";
import {
  AttachmentPreviewDialog,
  previewKind,
  type PreviewableAttachment,
} from "./AttachmentPreviewDialog";

const MAX_MB = 10;

export function AttachmentsTab({
  entity,
  entityId,
  onPhotoLocation,
}: {
  /** Typed to the vocabulary: the API now refuses an unknown
   *  or wrong-case entity with a 422 instead of returning an empty 200. */
  entity: EntityName;
  entityId: string;
  /** Called with a photo's GPS position after upload (the server strips it
   *  from the file and reports it back once). */
  onPhotoLocation?: (location: { latitude: number; longitude: number }) => void;
}) {
  const { data, isPending, isError, error } = useAttachments(entity, entityId);
  const createAttachment = useCreateAttachment(entity, entityId);
  const deleteAttachment = useDeleteAttachment(entity, entityId);
  const can = useCan();
  const cameraRef = useRef<HTMLInputElement>(null);
  // Files dragged over anywhere on the tab.
  const [dropping, setDropping] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"date_desc" | "name">("date_desc");
  const [kind, setKind] = useState<"all" | "photos" | "documents">("all");
  const [previewing, setPreviewing] = useState<PreviewableAttachment | null>(null);

  const attachments = useMemo(() => data?.items ?? [], [data]);

  const filtered = useMemo(() => {
    let result = attachments.filter((a) => kind === "all" || (kind === "photos") === a.has_thumbnail);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) => a.name.toLowerCase().includes(q) || a.uploaded_by.toLowerCase().includes(q),
      );
    }
    result.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return result;
  }, [attachments, search, sortKey, kind]);
  // The photo grid follows the search and filter, like the list under it.
  const photos = filtered.filter((a) => a.has_thumbnail);

  /** Uploads each file in turn under one progress toast. Offline, each
   *  one waits in the outbox (see lib/outbox.ts). */
  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    const many = files.length > 1;
    const id = many ? toast.loading(`Uploading 1 of ${files.length}…`) : undefined;
    let done = 0;
    let queued = 0;
    let offeredLocation = false;
    for (const [i, file] of files.entries()) {
      if (id !== undefined) toast.loading(`Uploading ${i + 1} of ${files.length}…`, { id });
      try {
        const created = await createAttachment.mutateAsync(file);
        if (created.queued) queued += 1;
        else done += 1;
        // Offer the first photo's position; one prompt, not one per photo.
        if (created.photo_location && !offeredLocation) {
          offeredLocation = true;
          onPhotoLocation?.(created.photo_location);
        }
      } catch {
        // named by the global mutation-error toast
      }
    }
    if (id === undefined) return;
    const failed = files.length - done - queued;
    if (failed > 0) toast.error(`${failed} of ${files.length} ${files.length === 1 ? "file" : "files"} didn't upload.`, { id });
    else if (queued > 0) toast.success(`${files.length} ${files.length === 1 ? "file" : "files"} saved. ${files.length === 1 ? "It" : "They"} will upload when you're back online.`, { id });
    else toast.success(`${done} ${done === 1 ? "file" : "files"} added.`, { id });
  }

  function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    void uploadFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  }

  // Drop anywhere on the tab, not only on the drop zone.
  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      setDropping(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDropping(false);
      const { ok, skipped } = splitBySize(Array.from(e.dataTransfer.files), MAX_MB);
      setDropError(skipped);
      void uploadFiles(ok);
    },
  };

  return (
    <div
      {...dropProps}
      className={cn(
        "relative rounded-lg border border-border bg-card p-3 transition-colors",
        dropping && "border-primary bg-primary/5",
      )}
    >
      {dropping && (
        <div className="pointer-events-none absolute inset-0 z-(--z-sticky) grid place-items-center rounded-lg border-2 border-dashed border-primary bg-background/70 text-sm font-medium text-foreground">
          Drop to upload
        </div>
      )}
      {/* FLT-5: same honesty banner as the comments tab and the data table. */}
      <PageCapBanner loaded={attachments.length} total={data?.total} noun="attachments" />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FileUpload
          compact
          maxSizeMb={MAX_MB}
          label="Add files or drop them here"
          onFiles={(files) => {
            setDropError(null);
            void uploadFiles(files);
          }}
        />
        {/* On a phone `capture` opens the rear camera straight away; on a
            desktop it falls back to picking an image file. */}
        <IconButton label="Take photo" variant="outline" onClick={() => cameraRef.current?.click()}>
          <Camera />
        </IconButton>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPicked}
        />
        <SearchToggle value={search} onChange={setSearch} label="Search attachments" placeholder="Search attachments…" />
        <IconSelect
          icon={<ListFilter />}
          label="Filter by type"
          highlighted={kind !== "all"}
          value={kind}
          onChange={(v) => setKind(v as "all" | "photos" | "documents")}
          options={[
            { value: "all", label: "All files" },
            { value: "photos", label: "Photos" },
            { value: "documents", label: "Documents" },
          ]}
        />
        <IconSelect
          icon={<ArrowUpDown />}
          label="Sort attachments"
          value={sortKey}
          onChange={(v) => setSortKey(v as "date_desc" | "name")}
          options={[
            { value: "date_desc", label: "Newest first" },
            { value: "name", label: "Name A–Z" },
          ]}
        />
        <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-muted-foreground tnum">
          {/* Server total, not the loaded array length. */}
          {filtered.length} / {data?.total ?? attachments.length}
        </span>
      </div>
      {dropError && <p className="-mt-2 mb-3 text-xs font-medium text-destructive">{dropError}</p>}

      {/* Photos first, as a grid: on a survey they're the evidence. */}
      {photos.length > 0 && (
        <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {photos.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setPreviewing(a)}
                className="group block aspect-square w-full overflow-hidden rounded-md border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Open ${a.name}`}
              >
                <img
                  src={`/api/attachments/${a.id}/thumbnail`}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover transition-transform group-hover:scale-105"
                />
              </button>
            </li>
          ))}
        </ul>
      )}


      {isPending ? (
        <ListSkeleton shape="square" />
      ) : isError ? (
        <LoadError error={error} what="files" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Paperclip className="size-8" />}
          title={attachments.length === 0 ? "No attachments" : "No matches"}
          description={
            attachments.length === 0
              ? "Files uploaded to this record will show up here."
              : "No attachments match your search."
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
                {(a.name.split(".").pop() ?? "?").slice(0, 3).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                {previewKind(a.content_type) ? (
                  <button
                    type="button"
                    onClick={() => setPreviewing(a)}
                    className="block max-w-full truncate text-left text-dense font-medium text-foreground hover:text-primary hover:underline tap-area"
                  >
                    {a.name}
                  </button>
                ) : (
                  <p className="truncate text-dense font-medium text-foreground">{a.name}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {formatSize(a.size_bytes)} · {a.uploaded_by} ·{" "}
                  <RelativeTime value={a.created_at} />
                </p>
              </div>
              <RowActions>
                {previewKind(a.content_type) && (
                  <RowActionButton label="Preview" onClick={() => setPreviewing(a)}>
                    <Eye />
                  </RowActionButton>
                )}
                <RowActionButton label="Download" asChild>
                  <a href={`/api/attachments/${a.id}/download`} download>
                    <Download />
                  </a>
                </RowActionButton>
                {can.remove && (
                  <RowActionButton
                    label="Delete attachment"
                    tone="destructive"
                    onClick={() => deleteAttachment.mutate(a.id)}
                  >
                    <Trash2 />
                  </RowActionButton>
                )}
              </RowActions>
            </li>
          ))}
        </ul>
      )}
      <AttachmentPreviewDialog attachment={previewing} onClose={() => setPreviewing(null)} />
    </div>
  );
}
