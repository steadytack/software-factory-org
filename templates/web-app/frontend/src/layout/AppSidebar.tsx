import { Link, useLocation } from "react-router-dom";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "../components/ui/sidebar";
import { useAuth } from "../hooks/useAuth";
import { BRAND } from "../lib/brand";
import { LogoMark } from "../components/brand/Logo";
import { NAV_ACCOUNT, NAV_MAIN, isNavActive, type NavItem } from "./nav";
import { handleArrowNav } from "../lib/arrowNav";

function NavGroup({ label, items, className }: { label: string; items: NavItem[]; className?: string }) {
  const location = useLocation();
  return (
    <SidebarGroup className={className}>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = isNavActive(item.to, location.pathname);
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.label}
                  // Quiet by default (secondary colour); the current page is a filled pill with full-strength text and an accent icon (not colour alone).
                  className="relative text-dense text-muted-foreground transition-colors duration-(--duration-fast) hover:bg-sidebar-hover hover:text-foreground data-[active=true]:bg-sidebar-active data-[active=true]:font-medium data-[active=true]:text-foreground data-[active=true]:shadow-[var(--shadow-raised)] data-[active=true]:ring-1 data-[active=true]:ring-border data-[active=true]:[&_svg]:text-sidebar-primary [&_svg]:size-4"
                >
                  <Link to={item.to}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** App navigation rail built on the shadcn Sidebar primitives, styled with
 *  the theme's sidebar-* tokens. Collapses to an icon rail (Ctrl/Cmd+B). */
export function AppSidebar() {
  const { isAdmin } = useAuth();
  const accountItems = NAV_ACCOUNT.filter((item) => item.to !== "/admin" || isAdmin);
  return (
    <>
      <Sidebar collapsible="icon">
        {/* Same height and bottom rule as the app header, so they read as one bar. */}
        <SidebarHeader className="h-12 justify-center border-b border-sidebar-border py-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                size="lg"
                tooltip={BRAND.name}
                className="h-10 gap-3 group-data-[collapsible=icon]:justify-center"
              >
                <Link to="/">
                  <LogoMark className="size-7!" />
                  <span className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-dense font-semibold tracking-tight">
                      {BRAND.name}
                    </span>
                    <span className="truncate text-micro text-tertiary">
                      Sites &amp; surveys
                    </span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        {/* ↑/↓/Home/End move between nav items once one has focus. */}
        <SidebarContent onKeyDown={(e) => handleArrowNav(e, '[data-sidebar="menu-button"]')}>
          <NavGroup label="Workspace" items={NAV_MAIN} />
          {/* Anchored to the bottom, so the account links do not float mid-sidebar. */}
          <NavGroup label="Account" items={accountItems} className="mt-auto" />
        </SidebarContent>
        <SidebarFooter />
        <SidebarRail />
      </Sidebar>
    </>
  );
}
