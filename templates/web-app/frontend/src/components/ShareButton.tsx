import { useRef, useState } from "react";
import { Check, Copy, Mail, Share2 } from "lucide-react";
import { toast } from "sonner";

import { BRAND } from "../lib/brand";
import { Button } from "./ui/button";
import { IconButton } from "./ui/icon-button";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

/** Share the page you're on. Where the browser has a native share sheet
 *  (phones, Windows, macOS, ChromeOS — over https) that opens; elsewhere a
 *  popover offers Copy link and Email. The app keeps its state in the URL
 *  (record ids, table filters, the map's position), so the link is enough. */
export function ShareButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);
  // Read when pressed: the page (and its title) may have changed since.
  const [page, setPage] = useState<{ url: string; title: string }>({ url: "", title: BRAND.name });
  const current = () => ({ url: window.location.href, title: document.title || BRAND.name });
  const { url, title } = page;

  async function onClick(e: React.MouseEvent) {
    if (typeof navigator.share !== "function") return; // the popover opens
    e.preventDefault();
    try {
      await navigator.share(current());
    } catch (error) {
      // Cancelled: nothing to do. Refused (e.g. not allowed here): fall back.
      if ((error as DOMException)?.name !== "AbortError") {
        setPage(current());
        setOpen(true);
      }
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      fieldRef.current?.select();
      toast("Press Ctrl+C to copy the link.");
    }
  }

  const mailto = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Opening is left to onClick when there's a native share sheet.
        if (next && typeof navigator.share === "function") return;
        if (next) setPage(current());
        setOpen(next);
        setCopied(false);
      }}
    >
      <PopoverTrigger asChild>
        <IconButton label="Share this page" onClick={(e) => void onClick(e)} className={className}>
          <Share2 />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Share this page</p>
          <p className="truncate text-xs text-muted-foreground">{title}</p>
        </div>
        <Input
          ref={fieldRef}
          readOnly
          value={url}
          aria-label="Link to this page"
          onFocus={(e) => e.currentTarget.select()}
          className="h-8 text-sm"
        />
        <div className="flex gap-2">
          <Button type="button" size="sm" className="flex-1" onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button type="button" size="sm" variant="outline" asChild>
            <a href={mailto}>
              <Mail />
              Email
            </a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">People need a {BRAND.name} account to open it.</p>
      </PopoverContent>
    </Popover>
  );
}
