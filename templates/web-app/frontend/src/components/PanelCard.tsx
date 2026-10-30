import type { ReactNode } from "react";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

/** A titled card for settings and admin pages: the same header as every other card (a title and an optional
 *  one-line description), then the content. */
export function PanelCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  /** Sits at the right of the header, level with the title (a status, a link). */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {action && <CardAction>{action}</CardAction>}
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  );
}
