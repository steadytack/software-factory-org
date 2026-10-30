import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";

interface UnsavedChangesDialogProps {
  open: boolean;
  saving?: boolean;
  onStay: () => void;
  onDiscard: () => void;
  onSaveAndLeave: () => void;
}

/** Shown when navigating away from a record with unsaved edits. */
export function UnsavedChangesDialog({
  open,
  saving = false,
  onStay,
  onDiscard,
  onSaveAndLeave,
}: UnsavedChangesDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onStay()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>You have unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>
            Leave this page and your edits will be lost. Save them first, or stay and keep editing.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <Button variant="destructive" onClick={onDiscard}>
            Leave without saving
          </Button>
          <Button onClick={onSaveAndLeave} disabled={saving}>
            {saving ? "Saving…" : "Save and leave"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
