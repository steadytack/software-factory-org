import { useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import { MIN_COLUMN_WIDTH } from "../../../lib/tableViewPrefs";

/** Keyboard step for ←/→ on a focused handle. */
const KEY_STEP = 16;

/** Drag handle on a header cell's right edge. Drag (or ←/→ when focused) to
 *  resize; double-click (or Delete/Backspace) returns the column to its
 *  natural width. `onPreview` fires during a drag, `onCommit` once at the
 *  end, so storage is written once per drag. */
export function ColumnResizeHandle({
  label,
  width,
  onPreview,
  onCommit,
  onReset,
}: {
  label: string;
  /** Stored width, if the column has one (for aria-valuenow). */
  width?: number;
  onPreview: (px: number) => void;
  onCommit: (px: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number; px: number } | null>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  /** The header cell's content width (its width minus padding). */
  const measure = () => {
    const cell = handleRef.current?.parentElement;
    if (!cell) return MIN_COLUMN_WIDTH;
    const style = getComputedStyle(cell);
    const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    return Math.max(MIN_COLUMN_WIDTH, Math.round(cell.getBoundingClientRect().width - padding));
  };

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const startWidth = measure();
    drag.current = { startX: e.clientX, startWidth, px: startWidth };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    d.px = Math.max(MIN_COLUMN_WIDTH, Math.round(d.startWidth + e.clientX - d.startX));
    onPreview(d.px);
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (d && d.px !== d.startWidth) onCommit(d.px);
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const delta = e.key === "ArrowRight" ? KEY_STEP : -KEY_STEP;
      onCommit(Math.max(MIN_COLUMN_WIDTH, (width ?? measure()) + delta));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onReset();
    }
  }

  return (
    <div
      ref={handleRef}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label} column`}
      aria-valuenow={width}
      aria-valuemin={MIN_COLUMN_WIDTH}
      title="Drag to resize · double-click to reset"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
      className="absolute inset-y-0 -right-1 z-[2] w-2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-2 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border after:opacity-0 after:transition-opacity hover:after:opacity-100 focus-visible:after:w-0.5 focus-visible:after:bg-ring focus-visible:after:opacity-100"
    />
  );
}
