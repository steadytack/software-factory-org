import { CloudUpload } from "lucide-react";

import { isPending } from "../lib/pendingRecords";

/** On a record made or changed offline: it's on this device and will
 *  upload when there's a signal (lib/pendingRecords.ts). */
export function PendingBadge({ record }: { record: unknown }) {
  if (!isPending(record)) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-warning-border bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning-fg">
      <CloudUpload className="size-3.5" />
      Waiting to upload
    </span>
  );
}
