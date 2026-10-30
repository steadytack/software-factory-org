import { useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";
import type { Row, RowSelectionState } from "@tanstack/react-table";

/** How long a press on a card starts selection. */
const LONG_PRESS_MS = 450;

/** Card mode selection: long-press a card to start selecting; while any
 *  card is selected, a tap toggles instead of opening it. (Space on a
 *  focused card works as on a table row.) */
export function useCardSelection<T>({
  enableSelection,
  rowSelection,
}: {
  enableSelection?: boolean;
  rowSelection: RowSelectionState;
}) {
  const selecting = Boolean(enableSelection) && Object.keys(rowSelection).length > 0;
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const cancelLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current.timer);
    longPress.current = null;
  };
  const cardPressProps = (row: Row<T>) =>
    enableSelection
      ? {
          onPointerDown: (e: PointerEvent) => {
            if (e.button !== 0) return;
            cancelLongPress();
            longPress.current = {
              x: e.clientX,
              y: e.clientY,
              timer: setTimeout(() => {
                longPress.current = null;
                suppressClick.current = true;
                row.toggleSelected(true);
                navigator.vibrate?.(10);
              }, LONG_PRESS_MS),
            };
          },
          onPointerMove: (e: PointerEvent) => {
            const p = longPress.current;
            // A scroll, not a press.
            if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancelLongPress();
          },
          onPointerUp: cancelLongPress,
          onPointerCancel: cancelLongPress,
          onPointerLeave: cancelLongPress,
          // No browser link menu on a long press.
          onContextMenu: (e: MouseEvent) => e.preventDefault(),
          onClickCapture: (e: MouseEvent) => {
            if (suppressClick.current || selecting) {
              e.preventDefault();
              e.stopPropagation();
              if (!suppressClick.current) row.toggleSelected();
              suppressClick.current = false;
            }
          },
        }
      : {};
  return { selecting, cardPressProps };
}
