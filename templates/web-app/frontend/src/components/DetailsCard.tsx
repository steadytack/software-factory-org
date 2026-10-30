import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export interface DetailRow {
  label: string;
  value: ReactNode;
  /** Not shown on a phone, where the page header already says it. */
  phoneHidden?: boolean;
}

/** A titled card: a list of labelled facts, then anything extra (a map,
 *  photos, buttons). The right-hand column of every record page. */
export function DetailsCard({
  title = "Details",
  rows = [],
  children,
}: {
  title?: string;
  rows?: DetailRow[];
  children?: ReactNode;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="gap-(--card-gap)">
        {rows.length > 0 && (
          <dl className="divide-y divide-border text-dense">
            {rows.map((r) => (
              <div
                key={r.label}
                className={cn("flex items-baseline justify-between gap-4 py-(--kv-py) first:pt-0 last:pb-0", r.phoneHidden && "max-sm:hidden")}
              >
                <dt className="shrink-0 text-muted-foreground">{r.label}</dt>
                <dd className="min-w-0 text-right break-words text-foreground tnum">{r.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

/** A titled section card for a record page's main column (e.g. Location). */
export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card size="sm">
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
