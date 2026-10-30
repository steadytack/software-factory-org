import type { ReactNode } from "react";

/** A record page's body: the main content, with an aside (the Details card)
 *  in a column on the right on wide screens. Narrower, the aside comes
 *  first, so the facts about the record are read before the long content. */
export function DetailLayout({ children, aside }: { children: ReactNode; aside: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-(--page-gap) xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
      <aside className="flex min-w-0 flex-col gap-(--page-gap) xl:sticky xl:top-4 xl:order-2">{aside}</aside>
      <div className="flex min-w-0 flex-col gap-(--page-gap) xl:order-1">{children}</div>
    </div>
  );
}
