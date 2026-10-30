import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const PORTALED_LISTS = '[data-slot="select-content"], [role="listbox"], [role="menu"]';

interface Options {
  /** When false the effect is inert (dialog closed). */
  active: boolean;
  /** Called when Escape is pressed while the dialog is open. */
  onEscape?: () => void;
}

/**
 * Modal accessibility: focus trap, Escape-to-close and focus restore.
 *
 * On open, remembers the previously-focused element and moves focus into the
 * container (first focusable, else the container itself); Tab cycles within
 * the container; on close focus returns to where it came from. (Audit U1/U7.)
 */
export function useModalA11y(
  containerRef: React.RefObject<HTMLElement | null>,
  { active, onEscape }: Options,
) {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    const focusFirst = () => {
      const target =
        container?.querySelector<HTMLElement>(FOCUSABLE) ?? container;
      target?.focus();
    };
    // Defer so the dialog content is mounted before focusing.
    const raf = requestAnimationFrame(focusFirst);

    const handleKeyDown = (e: KeyboardEvent) => {
      // A Select/menu opened from inside the container renders its list in
      // a portal. While it has focus its own Escape/Tab/arrows win: Escape
      // closes just that list, not the whole dialog.
      if ((document.activeElement as HTMLElement | null)?.closest(PORTALED_LISTS)) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onEscape?.();
        return;
      }
      if (e.key !== "Tab" || !container) return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (focusable.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (current === first || !container.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", handleKeyDown, true);
      // Restore focus to the trigger element when the dialog unmounts/closes.
      previouslyFocused.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
