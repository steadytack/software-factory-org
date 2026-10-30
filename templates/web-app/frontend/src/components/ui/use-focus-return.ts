import * as React from "react"

/** Gives focus back to the control that opened a dialog, sheet or alert when it closes.
 *
 *  Radix does this itself only for a `<DialogTrigger>`; most dialogs here are opened by state from a
 *  plain button, so closing them (Escape, Cancel, Save) dropped focus on `<body>` and keyboard and
 *  screen-reader users lost their place (UI audit 2026-09-30, UI-A11Y-3). The control that had focus
 *  when the content opened is remembered and focused again on close, unless a caller handles it
 *  (`preventDefault` in their own `onCloseAutoFocus`) or the control is gone (a menu item that
 *  closed with the menu), in which case Radix's own behaviour applies. */
export function useFocusReturn(handlers: {
  onOpenAutoFocus?: (event: Event) => void
  onCloseAutoFocus?: (event: Event) => void
}) {
  const opener = React.useRef<HTMLElement | null>(null)
  return {
    onOpenAutoFocus: (event: Event) => {
      const active = document.activeElement
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null
      handlers.onOpenAutoFocus?.(event)
    },
    onCloseAutoFocus: (event: Event) => {
      handlers.onCloseAutoFocus?.(event)
      if (event.defaultPrevented) return
      const element = opener.current
      opener.current = null
      if (element?.isConnected) {
        event.preventDefault()
        element.focus()
      }
    },
  }
}
