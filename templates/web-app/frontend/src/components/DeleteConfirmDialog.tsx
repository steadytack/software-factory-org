import { Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "./ui/alert-dialog";

interface DeleteConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Display name of the item being deleted — quoted in the message body.
   *  Ignored when `count` is set (bulk delete uses a pluralized message
   *  instead of a single quoted name). */
  name?: string;
  /** Singular entity label used in the title, e.g. "site" (also pluralized
   *  with a trailing "s" for the bulk message). */
  entityLabel?: string;
  /** Plural form when it isn't just `entityLabel + "s"` (e.g. "sketches"). */
  entityLabelPlural?: string;
  /** Disables the confirm button while the delete mutation is in flight. */
  loading?: boolean;
  /** When set (>1), renders "Delete {count} {entityLabel}s?" instead of the
   *  single quoted-name message — the bulk-delete case. */
  count?: number;
  /** Goes to the recycle bin (surveys) rather than being
   *  destroyed; the wording says so. */
  recoverable?: boolean;
  /** What else is removed with it, e.g. "Its surveys, comments and files are
   *  deleted too." Shown after the main sentence of a permanent delete. */
  consequence?: string;
}

/** Uniform confirmation dialog for destructive delete actions. Radix handles
 *  focus trap, Escape and focus restore. */
export function DeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  name,
  entityLabel = "item",
  entityLabelPlural,
  loading = false,
  count,
  recoverable = false,
  consequence,
}: DeleteConfirmDialogProps) {
  const bulk = count !== undefined && count > 1;
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {bulk ? `Delete ${count} ${entityLabelPlural ?? `${entityLabel}s`}?` : `Delete ${entityLabel}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {recoverable ? (
              <>
                {!bulk && name ? (
                  <strong className="text-foreground">&ldquo;{name}&rdquo;</strong>
                ) : (
                  "They"
                )}{" "}
                {!bulk && name ? "moves" : "move"} to the recycle bin, with anything recorded
                under {!bulk && name ? "it" : "them"}. An admin can restore{" "}
                {!bulk && name ? "it" : "them"} from there.
              </>
            ) : !bulk && name ? (
              <>
                <strong className="text-foreground">&ldquo;{name}&rdquo;</strong> will be
                permanently deleted. {consequence} This cannot be undone.
              </>
            ) : (
              <>{consequence} This cannot be undone.</>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={loading} onClick={onConfirm}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
