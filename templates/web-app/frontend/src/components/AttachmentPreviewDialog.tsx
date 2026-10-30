import { useEffect, useState } from "react";
import { Download } from "lucide-react";

import { formatSize } from "../lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { IconButton } from "./ui/icon-button";

export interface PreviewableAttachment {
  id: string;
  name: string;
  size_bytes: number;
  content_type: string | null;
}

type PreviewKind = "image" | "pdf" | "text";

/** Content types the backend will serve inline (see INLINE_PREVIEW_TYPES in
 *  backend/app/api/endpoints/comments.py) and how to render each. */
export function previewKind(contentType: string | null): PreviewKind | null {
  if (!contentType) return null;
  if (contentType.startsWith("image/")) return "image";
  if (contentType === "application/pdf") return "pdf";
  if (
    contentType.startsWith("text/") ||
    contentType === "application/json" ||
    contentType === "application/geo+json"
  )
    return "text";
  return null;
}

const TEXT_PREVIEW_LIMIT = 200_000;

const downloadUrl = (id: string) => `/api/attachments/${id}/download`;

/** In-app preview for common file types (images, PDFs, text/CSV/JSON), so
 *  users don't have to download a file just to look at it. */
export function AttachmentPreviewDialog({
  attachment,
  onClose,
}: {
  attachment: PreviewableAttachment | null;
  onClose: () => void;
}) {
  const kind = attachment ? previewKind(attachment.content_type) : null;
  const inlineUrl = attachment ? `${downloadUrl(attachment.id)}?inline=1` : "";
  const [text, setText] = useState<string | null>(null);
  const [textError, setTextError] = useState(false);

  useEffect(() => {
    setText(null);
    setTextError(false);
    if (!attachment || kind !== "text") return;
    const controller = new AbortController();
    fetch(inlineUrl, { credentials: "include", signal: controller.signal })
      .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
      .then((body) => {
        let shown = body.slice(0, TEXT_PREVIEW_LIMIT);
        // Pretty-print JSON so it's readable.
        if (attachment.content_type?.includes("json") && body.length <= TEXT_PREVIEW_LIMIT) {
          try {
            shown = JSON.stringify(JSON.parse(body), null, 2);
          } catch {
            // not valid JSON — show as-is
          }
        }
        setText(body.length > TEXT_PREVIEW_LIMIT ? `${shown}\n\n… (truncated — download for the full file)` : shown);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setTextError(Boolean(e));
      });
    return () => controller.abort();
  }, [attachment, kind, inlineUrl]);

  return (
    <Dialog open={attachment !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 sm:max-w-4xl">
        <DialogHeader className="flex-row items-start gap-2 pr-8">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate">{attachment?.name}</DialogTitle>
            <DialogDescription>
              {attachment && formatSize(attachment.size_bytes)}
              {attachment?.content_type && ` · ${attachment.content_type}`}
            </DialogDescription>
          </div>
          {attachment && (
            <IconButton label="Download" asChild>
              <a href={downloadUrl(attachment.id)} download>
                <Download />
              </a>
            </IconButton>
          )}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-muted/40">
          {kind === "image" && (
            <img
              src={inlineUrl}
              alt={attachment?.name}
              className="mx-auto max-h-[75dvh] w-auto object-contain"
            />
          )}
          {kind === "pdf" && (
            <iframe src={inlineUrl} title={attachment?.name} className="h-[75dvh] w-full bg-white" />
          )}
          {kind === "text" &&
            (textError ? (
              <p className="p-4 text-sm text-muted-foreground">Couldn't load a preview of this file.</p>
            ) : text === null ? (
              <p className="p-4 text-sm text-muted-foreground">Loading preview…</p>
            ) : (
              <pre className="max-h-[75dvh] whitespace-pre-wrap break-words p-4 font-mono text-xs text-foreground">
                {text}
              </pre>
            ))}
          {!kind && (
            <p className="p-4 text-sm text-muted-foreground">
              No preview for this file type — download it to open.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
