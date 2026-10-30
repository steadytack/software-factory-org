import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { toast } from "sonner";
import { Toaster } from "../components/ui/sonner";
import { Header } from "./Header";
import { AppSidebar } from "./AppSidebar";
import { MobileNav } from "./MobileNav";
import { SidebarInset, SidebarProvider } from "../components/ui/sidebar";
import { TooltipProvider } from "../components/ui/tooltip";
import { SearchModal } from "../search/SearchModal";
import { useSearch } from "../search/useSearch";
import { useSiteSearchItems } from "../search/useSiteSearchItems";
import { useSearchStore } from "../search/searchStore";
import { HelpProvider } from "../help/HelpContext";
import { HelpDrawer } from "../help/HelpDrawer";
import { useRegisterHelpTopics } from "../help/useRegisterHelpTopics";
import { CORE_HELP_TOPICS } from "../help/coreTopics";
import { applyDensity, loadPrefs } from "../lib/prefs";
import { useGlobalShortcuts } from "../hooks/useGlobalShortcuts";
import { ShortcutsDialog } from "../components/ShortcutsDialog";
import { useBackgroundSync } from "../lib/backgroundSync";

interface AppLayoutProps {
  children?: React.ReactNode;
}

function HelpTopicsRegistrar() {
  useRegisterHelpTopics(CORE_HELP_TOPICS);
  return null;
}

/** App shell: fixed header, collapsible sidebar, scrollable content area.
 *  Map route goes full-bleed (no padding); other routes get standard padding. */
/** Routes whose primary content is one scrollable data table: the page
 *  shell doesn't scroll (`overflow-hidden`), so the page title and toolbar
 *  stay pinned while the table manages its own internal scroll region. */
const FULL_HEIGHT_ROUTES = ["/sites", "/surveys"];

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMap = location.pathname === "/map";
  const isFullHeightPage = FULL_HEIGHT_ROUTES.includes(location.pathname);
  useSearch();
  useGlobalShortcuts();
  useSiteSearchItems();
  // Keep every record on the device for offline use.
  useBackgroundSync(true);
  const modalOpen = useSearchStore((s) => s.modalOpen);
  const setModalOpen = useSearchStore((s) => s.setModalOpen);

  // Landing-page preference: right after login (flag set by LoginPage), send
  // the user to their preferred page instead of the dashboard.
  useEffect(() => {
    if (location.pathname !== "/") return;
    if (sessionStorage.getItem("post-login") !== "1") return;
    sessionStorage.removeItem("post-login");
    const target = loadPrefs().defaultPage;
    if (target && target !== "/") navigate(target, { replace: true });
  }, [location.pathname, navigate]);

  // Density preference (compact / comfortable) drives CSS variables keyed on
  // <html data-density>. Re-apply when another tab changes it.
  useEffect(() => {
    const update = () => applyDensity(loadPrefs().density);
    update();
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);

  // Global error surface: failed mutations dispatch "app-error" from the
  // MutationCache; surface them as toasts so every failure has feedback.
  useEffect(() => {
    const onError = (e: Event) => {
      const message = (e as CustomEvent<string>).detail;
      toast.error(message);
    };
    window.addEventListener("app-error", onError);
    return () => window.removeEventListener("app-error", onError);
  }, []);

  // Offline outbox feedback (lib/outbox.ts).
  useEffect(() => {
    const queued = () =>
      toast("Saved on this device", {
        description: "No connection — it will upload automatically when you're back online.",
      });
    const sent = (e: Event) => {
      const n = (e as CustomEvent<number>).detail;
      toast.success(`Uploaded ${n} change${n === 1 ? "" : "s"} made offline.`);
    };
    window.addEventListener("outbox-queued", queued);
    window.addEventListener("outbox-sent", sent);
    return () => {
      window.removeEventListener("outbox-queued", queued);
      window.removeEventListener("outbox-sent", sent);
    };
  }, []);

  return (
    <HelpProvider>
      <HelpTopicsRegistrar />
      <HelpDrawer />
      <TooltipProvider delayDuration={0}>
        <SidebarProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-(--z-toast) focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg"
          >
            Skip to main content
          </a>
          <div className="flex h-dvh w-full overflow-hidden">
            <AppSidebar />
            <SidebarInset>
              <Header />
              {/* SidebarInset is already the <main> landmark. */}
              <div
                id="main-content"
                tabIndex={-1}
                className={
                  // Below md the floating tab pill overlays the viewport bottom,
                  // so routes reserve room for it (the map runs underneath it).
                  // Every non-map route shares one padding + gap so page titles
                  // land in exactly the same spot; only scrolling differs.
                  isMap
                    ? "flex min-w-0 flex-1 flex-col overflow-hidden pb-0"
                    : `flex min-w-0 flex-1 flex-col p-4 ${
                        isFullHeightPage
                          ? "pb-[calc(5.5rem+env(safe-area-inset-bottom))] overflow-hidden md:p-6"
                          : "pb-[calc(6.5rem+env(safe-area-inset-bottom))] overflow-y-auto md:p-6"
                      }`
                }
              >
                {isMap ? (
                  (children ?? <Outlet />)
                ) : (
                  // Left-aligned so the title never shifts sideways between
                  // pages; table pages run full width, others keep a readable
                  // measure. Pages render header + content as direct children.
                  <div
                    className={`flex w-full min-w-0 flex-col gap-(--page-gap) ${
                      isFullHeightPage ? "h-full min-h-0" : "max-w-[100rem]"
                    }`}
                  >
                    {children ?? <Outlet />}
                  </div>
                )}
              </div>
            </SidebarInset>
          </div>
          <MobileNav />
          <ShortcutsDialog />
          <SearchModal open={modalOpen} onClose={() => setModalOpen(false)} />
          {/* Lift toasts clear of the floating mobile tab pill. */}
          <Toaster position="bottom-center" mobileOffset={{ bottom: "calc(6rem + env(safe-area-inset-bottom))" }} />
        </SidebarProvider>
      </TooltipProvider>
    </HelpProvider>
  );
}
