import type { KeyboardEvent } from "react";

/** Arrow-key list navigation, shared by the help drawer, shortcuts sheet,
 *  sidebar and similar vertical lists: ↑/↓ move focus between the items
 *  matching `selector` inside the event's container, Home/End jump to the
 *  ends. Returns true when it handled the key.
 *
 *  Attach it to the list container's `onKeyDown`. Items stay in the normal
 *  tab order, so Tab still works; arrows are an addition, not a trap. */
export function handleArrowNav(e: KeyboardEvent<HTMLElement>, selector: string): boolean {
  if (e.altKey || e.ctrlKey || e.metaKey) return false;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
  );
  if (items.length === 0) return false;
  const current = items.indexOf(document.activeElement as HTMLElement);
  let next: number;
  switch (e.key) {
    case "ArrowDown":
      next = current < 0 ? 0 : Math.min(items.length - 1, current + 1);
      break;
    case "ArrowUp":
      next = current < 0 ? items.length - 1 : Math.max(0, current - 1);
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = items.length - 1;
      break;
    default:
      return false;
  }
  e.preventDefault();
  items[next].focus();
  items[next].scrollIntoView({ block: "nearest" });
  return true;
}
