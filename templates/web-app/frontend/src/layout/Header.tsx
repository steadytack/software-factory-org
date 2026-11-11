import { useEffect, useState } from "react";
import { ChevronDown, Keyboard, LogOut, Search, UserRound } from "lucide-react";
// feature:help:start
import { CircleHelp } from "lucide-react";
// feature:help:end
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { loadPrefs } from "../lib/prefs";
import { useSearchStore } from "../search/searchStore";
// feature:help:start
import { useHelpContext } from "../help/HelpContext";
// feature:help:end
import { useShortcutsStore } from "../hooks/useGlobalShortcuts";
import { NotificationsBell } from "../components/NotificationsBell";
import { OutboxIndicator } from "../components/OutboxIndicator";
// feature:theme:start
import { ThemeToggle } from "../components/ThemeToggle";
// feature:theme:end
// feature:share:start
import { ShareButton } from "../components/ShareButton";
// feature:share:end
import { LogoMark } from "../components/brand/Logo";
import { BRAND } from "../lib/brand";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { IconButton } from "../components/ui/icon-button";
import { Kbd } from "../components/ui/kbd";
import { SidebarTrigger } from "../components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

/** Ghost controls re-toned for the navy header surface. */
const HEADER_BTN =
  "text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground dark:hover:bg-sidebar-hover aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground";

function getInitials(email: string): string {
  const [name] = email.split("@");
  return name.slice(0, 2).toUpperCase();
}

/** Top bar: sidebar trigger, global search trigger, actions, account menu.
 *  The brand lives in the sidebar header only — repeating it here duplicated
 *  the logo and pushed the search off-centre. */
export function Header() {
  const { email, logout } = useAuth();
  const navigate = useNavigate();
  const setModalOpen = useSearchStore((s) => s.setModalOpen);
  // feature:help:start
  const { openHelp } = useHelpContext();
  // feature:help:end
  const openShortcuts = useShortcutsStore((s) => s.setOpen);
  const [displayName, setDisplayName] = useState("");

  // Profile preferences are localStorage-backed; re-read when they change.
  useEffect(() => {
    const update = () => setDisplayName(loadPrefs().displayName);
    update();
    window.addEventListener("profile-prefs-changed", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("profile-prefs-changed", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  const initials = displayName
    ? displayName.slice(0, 2).toUpperCase()
    : email
      ? getInitials(email)
      : "?";

  return (
    <header className="sticky top-0 z-(--z-header) flex h-[calc(3rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 pt-[env(safe-area-inset-top)] text-sidebar-foreground max-md:border-transparent max-md:bg-background/70 max-md:backdrop-blur-xl">
      {/* Desktop: sidebar toggle. Phone: the bottom tab bar handles
          navigation, so the header carries the brand instead. */}
      <SidebarTrigger aria-label="Toggle sidebar" className={`hidden md:inline-flex ${HEADER_BTN}`} />
      <Link
        to="/"
        aria-label={`${BRAND.name} home`}
        className="flex min-w-0 items-center gap-2 min-h-11 rounded-md md:hidden"
      >
        <LogoMark />
        <span className="truncate font-semibold tracking-tight">{BRAND.name}</span>
      </Link>

      {/* Centre: global search trigger (icon-only on phones) */}
      <div className="hidden min-w-0 flex-1 justify-center px-2 md:flex">
        <button
          onClick={() => setModalOpen(true)}
          className="group flex h-8 w-full min-w-0 max-w-[480px] pointer-coarse:h-11 items-center gap-2 rounded-md border border-border bg-card px-3 text-left shadow-sm transition-colors hover:border-input"
        >
          <Search className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
          <span className="flex-1 select-none truncate text-left text-dense text-muted-foreground">
            Search sites, surveys and pages…
          </span>
          <Kbd className="hidden md:inline-flex" aria-hidden="true">Ctrl K</Kbd>
        </button>
      </div>

      {/* Right: (search on phones), share, theme, help, notifications,
          account. Theme and help move to the bottom bar's "More" sheet on
          phones. */}
      <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0">
        <IconButton
          label="Search"
          onClick={() => setModalOpen(true)}
          className={`md:hidden ${HEADER_BTN}`}
        >
          <Search />
        </IconButton>
        {/* feature:share:start */}
        <ShareButton className={HEADER_BTN} />
        {/* feature:share:end */}
        {/* feature:theme:start */}
        <ThemeToggle triggerClassName={`hidden md:inline-flex ${HEADER_BTN}`} />
        {/* feature:theme:end */}
        {/* feature:help:start */}
        <IconButton
          label="Help"
          onClick={() => openHelp()}
          className={`hidden md:inline-flex ${HEADER_BTN}`}
        >
          <CircleHelp />
        </IconButton>
        {/* feature:help:end */}
        {email && <OutboxIndicator />}
        {email && <NotificationsBell triggerClassName={HEADER_BTN} />}
        {email && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={`ml-0.5 h-8 gap-2 px-1 pointer-coarse:h-11 pointer-coarse:min-w-11 ${HEADER_BTN}`}
                aria-label={`Account menu, ${initials}`}
              >
                <Avatar className="size-6">
                  <AvatarFallback className="bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="hidden size-3.5 shrink-0 opacity-70 md:block" />
              </Button>
            </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Account menu</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-2">
                <p className="truncate text-sm font-semibold text-foreground">
                  {displayName || "Signed in"}
                </p>
                {email && (
                  <p className="truncate text-xs text-muted-foreground">
                    {email}
                  </p>
                )}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/profile")}>
                <UserRound />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem className="hidden md:flex" onClick={() => openShortcuts(true)}>
                <Keyboard />
                Keyboard shortcuts
                <span className="ml-auto text-xs text-muted-foreground">?</span>
              </DropdownMenuItem>
              {/* feature:help:start */}
              <DropdownMenuItem onClick={() => openHelp()}>
                <CircleHelp />
                {/* feature:help.feedback:start */}
                Help &amp; feedback
                {/* feature:help.feedback:else */}
                {/* Help */}
                {/* feature:help.feedback:end */}
              </DropdownMenuItem>
              {/* feature:help:end */}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => void logout()}
              >
                <LogOut />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
