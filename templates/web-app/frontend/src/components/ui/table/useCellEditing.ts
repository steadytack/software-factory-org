import { useRef, useState } from "react";

/** Inline cell editing: which cell is open, its draft value, and saving it
 *  through the page's `onCellEdit`. */
export function useCellEditing<T>(
  onCellEdit?: (row: T, columnId: string, value: string) => Promise<void>,
) {
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  // The value the cell had when editing started: saving an unchanged value
  // is a no-op, and a changed one is never saved (or lost) by accident.
  const [editOriginal, setEditOriginal] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const pickedRef = useRef(false);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const editDirty = editingCell !== null && editValue !== editOriginal;

  function startEdit(rowId: string, columnId: string, currentValue: string) {
    // One edit at a time: an unsaved change keeps the focus rather than
    // being silently dropped (or saved) by clicking another cell.
    if (editDirty) {
      editInputRef.current?.focus();
      return;
    }
    pickedRef.current = false;
    setEditingCell({ rowId, columnId });
    setEditValue(currentValue);
    setEditOriginal(currentValue);
  }

  function cancelEdit() {
    setEditingCell(null);
    setEditValue("");
    setEditOriginal("");
  }

  /** Save only on an explicit action (Enter, the ✓ button, or picking an
   *  option) — never on blur. Unchanged values don't hit the server. */
  async function commitEdit(row: T, value = editValue) {
    if (!editingCell || !onCellEdit) return;
    if (value === editOriginal) {
      cancelEdit();
      return;
    }
    const { rowId, columnId } = editingCell;
    const key = `${rowId}:${columnId}`;
    if (savingCell === key) return; // already committing
    setSavingCell(key);
    try {
      await onCellEdit(row, columnId, value);
    } finally {
      setSavingCell((s) => (s === key ? null : s));
      cancelEdit();
    }
  }

  return {
    editingCell,
    editValue,
    setEditValue,
    editOriginal,
    editInputRef,
    pickedRef,
    savingCell,
    editDirty,
    startEdit,
    cancelEdit,
    commitEdit,
    /** Close the open cell without touching the draft (leaving edit mode). */
    closeEditor: () => setEditingCell(null),
  };
}
