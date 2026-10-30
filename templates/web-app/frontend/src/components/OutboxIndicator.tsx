import { useEffect, useState, useSyncExternalStore } from "react";
import { CloudOff, CloudUpload, Loader2, RotateCw, Trash2, TriangleAlert } from "lucide-react";

import { discard, flush, snapshot, subscribe } from "../lib/outbox";
import { RelativeTime } from "./RelativeTime";
import { Button } from "./ui/button";
import { IconButton } from "./ui/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { RowActionButton } from "./ui/row-actions";

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Header chip: offline state and changes waiting to upload (lib/outbox.ts).
 *  Hidden when online with nothing waiting. */
export function OutboxIndicator() {
  const entries = useSyncExternalStore(subscribe, snapshot, snapshot);
  const online = useOnline();
  const [sending, setSending] = useState(false);
  const failed = entries.filter((e) => e.error);

  if (online && entries.length === 0) return null;

  const label = !online
    ? entries.length
      ? `Offline · ${entries.length} waiting`
      : "Offline"
    : failed.length
      ? `${failed.length} couldn't upload`
      : `${entries.length} waiting to upload`;

  async function sendNow() {
    setSending(true);
    await flush({ retryFailed: true });
    setSending(false);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton
          label={label}
          variant="ghost"
          className={`relative ${failed.length ? "text-destructive" : "text-warning"}`}
        >
          {!online ? <CloudOff /> : failed.length ? <TriangleAlert /> : <CloudUpload />}
          {entries.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-warning px-1 text-micro font-semibold text-warning-foreground">
              {entries.length}
            </span>
          )}
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-2 p-3">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">
          {online
            ? "Changes made without a connection upload in order, automatically."
            : "You can keep working. Changes are saved on this device and upload when you're back online."}
        </p>
        {entries.length > 0 && (
          <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{e.label}</p>
                  <p className="text-xs text-muted-foreground">
                    <RelativeTime value={e.createdAt} />
                  </p>
                  {e.error && <p className="text-xs text-destructive">{e.error}</p>}
                </div>
                <RowActionButton
                  label="Discard this change"
                  tone="destructive"
                  onClick={() => void discard(e.id)}
                >
                  <Trash2 />
                </RowActionButton>
              </li>
            ))}
          </ul>
        )}
        {online && entries.length > 0 && (
          <Button size="sm" onClick={() => void sendNow()} disabled={sending}>
            {sending ? <Loader2 className="animate-spin" /> : <RotateCw />}
            Send now
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
