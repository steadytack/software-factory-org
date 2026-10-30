import { useEffect, useState } from "react";

/** How much of the layout viewport's bottom the on-screen keyboard covers,
 *  in px (0 with no keyboard, or where `visualViewport` is unsupported).
 *  Mobile browsers overlay the keyboard on fixed elements by default, so a
 *  bottom sheet lifts itself by this much to keep its buttons visible. */
export function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) {
      setInset(0);
      return;
    }
    const update = () =>
      setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);
  return inset;
}
