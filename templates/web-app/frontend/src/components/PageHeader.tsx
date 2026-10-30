import { Fragment, type ReactNode, useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { pageTitle } from "../lib/brand";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";

export interface Crumb {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Trail above the title; the last crumb is the current page. */
  breadcrumbs?: Crumb[];
  /** Inline next to the title, e.g. a status badge. */
  badge?: ReactNode;
  /** Secondary facts row under the subtitle (type, address, updated…). */
  meta?: ReactNode;
  /** What kind of record this is ("Site", "Survey"). When set, the header uses the
   *  record layout: breadcrumbs, a bold title, then one row with a type pill, the
   *  status badges and the meta. Without it, the plain list-page header is used. */
  kind?: string;
}

/** The one page-header pattern: breadcrumbs, title (+badge), subtitle, meta
 *  row on the left; actions on the right. Also sets the document title. */
export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
  badge,
  meta,
  kind,
}: PageHeaderProps) {
  useEffect(() => {
    document.title = pageTitle(title);
  }, [title]);

  // On a phone the trail is one way back (its parent), not the whole path: the title already says where you are.
  const parent = breadcrumbs && breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2] : null;

  return (
    <header className="flex flex-col gap-3">
      {parent?.to && (
        <Link
          to={parent.to}
          aria-label={`Back to ${parent.label}`}
          className="tap-area -mb-1 flex max-w-full items-center gap-1 self-start text-dense text-muted-foreground hover:text-foreground sm:hidden"
        >
          <ChevronLeft aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{parent.label}</span>
        </Link>
      )}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb className="max-sm:hidden">
          <BreadcrumbList>
            {breadcrumbs.map((c, i) => (
              <Fragment key={`${c.label}-${i}`}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {c.to && i < breadcrumbs.length - 1 ? (
                    <BreadcrumbLink asChild>
                      <Link to={c.to}>{c.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{c.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      {kind ? (
        <>
          <div className="flex items-start justify-between gap-3 sm:flex-wrap sm:gap-4">
            <h1 className="min-w-0 max-sm:flex-1 text-title text-foreground [overflow-wrap:anywhere] md:text-display">{title}</h1>
            {actions && (
              <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground tnum sm:gap-x-2">
            <span className="rounded-full bg-muted px-3 py-0.5 text-xs font-semibold text-foreground max-sm:hidden">
              {kind}
            </span>
            {badge}
            {meta}
          </div>
          {subtitle && <p className="max-w-prose text-sm text-muted-foreground">{subtitle}</p>}
        </>
      ) : (
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-title md:text-display text-foreground">
              {title}
            </h1>
            {badge}
          </div>
          {subtitle && (
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{subtitle}</p>
          )}
          {meta && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground tnum">
              {meta}
            </div>
          )}
        </div>
        {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      )}
    </header>
  );
}
