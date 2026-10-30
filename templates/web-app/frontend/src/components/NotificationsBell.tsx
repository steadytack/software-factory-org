/** Notifications popover: unread badge on the bell; the list supports
 *  mark-read, dismiss, mark all read and dismiss all. Built on the shadcn
 *  Popover (focus management, Escape, outside-click) with ↑/↓ between items. */
import { useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellOff, Check, CheckCheck, X } from "lucide-react";

import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDismissNotification,
  useDismissAllNotifications,
  type NotificationItem,
} from "../hooks/useNotifications";
import { cn, isSafeRelativePath } from "../lib/utils";
import { RelativeTime } from "./RelativeTime";
import { IconButton } from "./ui/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { RowActionButton, RowActions } from "./ui/row-actions";
import { ListSkeleton } from "./ui/list-skeleton";
import { LoadError } from "./LoadError";

function targetFor(n: NotificationItem): string | null {
  // Prefer the explicit in-app url; fall back to a legacy "site:<uuid>" link.
  if (isSafeRelativePath(n.url)) return n.url;
  return n.link?.startsWith("site:") ? `/sites/${n.link.slice(5)}` : null;
}

/** ↑/↓/Home/End move focus between the notification titles. */
function onListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-notif-item]"));
  const i = items.indexOf(document.activeElement as HTMLElement);
  let next = -1;
  if (e.key === "ArrowDown") next = Math.min(items.length - 1, i + 1);
  else if (e.key === "ArrowUp") next = Math.max(0, i - 1);
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = items.length - 1;
  if (next >= 0) {
    e.preventDefault();
    items[next]?.focus();
  }
}

export function NotificationsBell({ triggerClassName }: { triggerClassName?: string } = {}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data, isPending, isError, error, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const dismiss = useDismissNotification();
  const dismissAll = useDismissAllNotifications();

  const unread = data?.unread ?? 0;
  const items: NotificationItem[] = data?.items ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton
          label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
          className={cn("relative", triggerClassName)}
        >
          <Bell />
          {unread > 0 && (
            <span className="absolute right-0.5 top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-destructive px-0.5 text-micro font-semibold text-destructive-foreground ring-2 ring-sidebar">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] gap-0 overflow-hidden p-0">
        <div className="flex items-center gap-1 border-b border-border py-2 pl-3 pr-2">
          <span className="flex-1 text-dense font-semibold text-foreground">Notifications</span>
          <IconButton
            label="Mark all read"
            disabled={unread === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            <CheckCheck />
          </IconButton>
          <IconButton
            label="Dismiss all"
            disabled={items.length === 0 || dismissAll.isPending}
            onClick={() => dismissAll.mutate()}
          >
            <BellOff />
          </IconButton>
        </div>
        <div className="max-h-96 overflow-y-auto" onKeyDown={onListKeyDown}>
          {isPending ? (
            <ListSkeleton className="space-y-4 px-3 py-4" />
          ) : isError ? (
            <div className="p-3">
              <LoadError error={error} what="notifications" onRetry={() => void refetch()} />
            </div>
          ) : items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              You're all caught up.
            </p>
          ) : (
            items.map((n) => {
              const target = targetFor(n);
              return (
                <div
                  key={n.id}
                  className={cn(
                    "group/notif flex items-start gap-2 border-b border-border py-2 pl-3 pr-2 last:border-b-0",
                    !n.read && "bg-sidebar-accent/50",
                  )}
                >
                  {!n.read && (
                    <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
                  )}
                  <div className={cn("min-w-0 flex-1", n.read && "pl-4")}>
                    <button
                      type="button"
                      data-notif-item
                      className="block w-full truncate rounded-sm text-left text-dense font-semibold text-foreground hover:text-primary"
                      onClick={() => {
                        if (!n.read) markRead.mutate(n.id);
                        if (target) {
                          navigate(target);
                          setOpen(false);
                        }
                      }}
                    >
                      {n.title}
                      {!n.read && <span className="sr-only"> (unread)</span>}
                    </button>
                    {n.body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <RelativeTime value={n.created_at} />
                    </p>
                  </div>
                  <RowActions>
                    {!n.read && (
                      <RowActionButton label="Mark read" size="icon-xs" onClick={() => markRead.mutate(n.id)}>
                        <Check />
                      </RowActionButton>
                    )}
                    <RowActionButton label="Dismiss" size="icon-xs" onClick={() => dismiss.mutate(n.id)}>
                      <X />
                    </RowActionButton>
                  </RowActions>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
