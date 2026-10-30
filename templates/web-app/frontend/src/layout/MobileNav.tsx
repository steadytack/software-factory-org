import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  CircleHelp,
  ClipboardList,
  LogOut,
  MapPin,
  Menu,
  Monitor,
  Moon,
  Plus,
  Sun,
} from "lucide-react";

import { useAuth } from "../hooks/useAuth";
import { useCan } from "../hooks/useCan";
import { useStartNewRecord } from "../hooks/useNewRecord";
import { useHelpContext } from "../help/HelpContext";
import { useTheme, type Theme } from "../components/theme-provider";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import { cn } from "../lib/utils";
import { MOBILE_TABS, NAV_ACCOUNT, isNavActive } from "./nav";

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** One tab in the floating pill: icon-only and the same width as its neighbours. The current page
 *  sits in a soft capsule (and carries `aria-current`, so it is not shown by colour alone). */
function tabClass(active: boolean) {
  return cn(
    "relative flex h-12 min-w-0 items-center justify-center rounded-lg text-xs font-medium leading-none transition-[flex-grow,background-color,color] duration-200 active:scale-95",
    active
      ? "glass-active flex-1 text-foreground"
      : "flex-1 text-muted-foreground active:text-foreground",
  );
}

function TabBody({ icon: Icon }: { icon: typeof Menu }) {
  return <Icon className="size-5 shrink-0" />;
}

/** The "+" sheet: what a field user adds, most frequent first. */
const ADD_ITEMS = [
  { label: "New survey", hint: "A visit to a site", to: "/surveys", icon: ClipboardList },
  { label: "New site", hint: "A place you inspect", to: "/sites", icon: MapPin },
];

const SHEET_ROW =
  "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent active:bg-accent";

/** Phone navigation: a bottom tab bar replacing the sidebar below `md`.
 *  Secondary destinations and header actions that don't fit a phone header
 *  (profile, admin, help, theme, log out) live in the "More" sheet. */
export function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, email, logout } = useAuth();
  const { openHelp } = useHelpContext();
  const { theme, setTheme } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const can = useCan();
  const startNewRecord = useStartNewRecord();
  // On a site's page, a new survey starts on that site.
  const siteId = /^\/sites\/([^/]+)/.exec(location.pathname)?.[1];

  const tabItems = MOBILE_TABS;
  const accountItems = NAV_ACCOUNT.filter((i) => i.to !== "/admin" || isAdmin);
  const sheetItems = accountItems;
  const moreActive = sheetItems.some((i) => isNavActive(i.to, location.pathname));

  const go = (to: string) => {
    setMoreOpen(false);
    navigate(to);
  };

  const renderTab = (item: (typeof tabItems)[number]) => {
    const active = isNavActive(item.to, location.pathname);
    const label = item.to === "/" ? "Home" : item.label;
    return (
      <Link
        key={item.to}
        to={item.to}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={tabClass(active)}
      >
        <TabBody icon={item.icon} />
      </Link>
    );
  };

  return (
    <>
      {/* The wrapper ignores pointer events so the page stays touchable around the pill. */}
      <nav
        aria-label="Primary"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-(--z-tabbar) flex items-center gap-2 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] md:hidden"
      >
        <div className="glass pointer-events-auto flex h-14 min-w-0 flex-1 items-center rounded-xl p-1">
          {tabItems.map(renderTab)}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="More"
            aria-expanded={moreOpen}
            className={tabClass(moreActive)}
          >
            <TabBody icon={Menu} />
          </button>
        </div>
        {can.edit && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            aria-label="Add"
            aria-expanded={addOpen}
            className="pointer-events-auto grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
          >
            <Plus className="size-6" />
          </button>
        )}
      </nav>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent
          side="bottom"
          className="glass-sheet gap-2 rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        >
          <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-foreground/25" />
          <SheetHeader className="pb-0">
            <SheetTitle>Add</SheetTitle>
            <SheetDescription className={siteId ? undefined : "sr-only"}>
              {siteId ? "New surveys start on this site." : "Choose what to add."}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-2">
            {ADD_ITEMS.map((item) => (
              <button
                key={item.to}
                type="button"
                onClick={() => {
                  setAddOpen(false);
                  const withSite = siteId && item.to === "/surveys";
                  startNewRecord(item.to, withSite ? { siteId } : undefined);
                }}
                className={cn(SHEET_ROW, "py-2")}
              >
                <item.icon className="size-5 text-muted-foreground" />
                <span className="flex flex-col items-start">
                  {item.label}
                  <span className="text-xs font-normal text-muted-foreground">{item.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="glass-sheet gap-2 rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        >
          <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-foreground/25" />
          <SheetHeader className="pb-0">
            <SheetTitle>More</SheetTitle>
            {email && <SheetDescription className="truncate">{email}</SheetDescription>}
          </SheetHeader>
          <div className="flex flex-col gap-1 px-2">
            {sheetItems.map((item) => (
              <button
                key={item.to}
                type="button"
                onClick={() => go(item.to)}
                aria-current={isNavActive(item.to, location.pathname) ? "page" : undefined}
                className={cn(SHEET_ROW, "aria-[current=page]:bg-accent")}
              >
                <item.icon className="size-4 text-muted-foreground" />
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                openHelp();
              }}
              className={SHEET_ROW}
            >
              <CircleHelp className="size-4 text-muted-foreground" />
              Help &amp; feedback
            </button>

            <div className="mt-1 flex items-center justify-between gap-3 px-3 py-1">
              <span className="text-sm font-medium text-foreground">Theme</span>
              <div role="radiogroup" aria-label="Theme" className="flex rounded-lg border border-border p-0.5">
                {THEMES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={theme === value}
                    onClick={() => setTheme(value)}
                    className="flex h-9 items-center gap-2 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors aria-checked:bg-accent aria-checked:text-foreground"
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                void logout();
              }}
              className={cn(SHEET_ROW, "text-destructive hover:bg-destructive/10 active:bg-destructive/10")}
            >
              <LogOut className="size-4" />
              Log out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
