import {
  ClipboardList,
  LayoutDashboard,
  MapPin,
  Map as MapIcon,
  ShieldCheck,
  UserRound,
} from "lucide-react";

/** Shared navigation model: the desktop sidebar and the mobile bottom bar
 *  both render from these lists so they never drift apart. */
export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

export const NAV_MAIN: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/sites", label: "Sites", icon: MapPin },
  { to: "/surveys", label: "Surveys", icon: ClipboardList },
  { to: "/map", label: "Map", icon: MapIcon },
];

export const NAV_ACCOUNT: NavItem[] = [
  { to: "/profile", label: "Profile", icon: UserRound },
  { to: "/admin", label: "Admin", icon: ShieldCheck },
];

export function isNavActive(to: string, pathname: string): boolean {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

/** Every main page is on the phone tab bar (four tabs, then "+" and More): at 320px that is still a 46px target each. */
export const MOBILE_TABS = NAV_MAIN;
