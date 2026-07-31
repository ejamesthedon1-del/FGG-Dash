import { useState, type ComponentType } from "react";
import { Outlet, Link, NavLink, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  BookOpen,
  Boxes,
  CheckSquare,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Package,
  Settings,
  Shirt,
  Sparkles,
  Target,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { cn } from "./ui/utils";
import { useAuth } from "../lib/use-auth";
import { userFirstName, type AppRole } from "../lib/auth-roles";
import { SignInPage } from "./SignInPage";
import { ViewModePicker } from "./ViewModePicker";
import { Button } from "./ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar";
import { useOrderFlowNewCount } from "../lib/use-order-flow-new-count";
import { useSupportEscalationCount } from "../lib/use-support-escalation-count";

const LOGO_SRC = "/fgg-logo.png?v=2";

const CEO_ONLY_PREFIXES = [
  "/brand-hub",
  "/mockups",
  "/creative-assets",
  "/training-center",
  "/our-mission",
];

function isCeoOnlyPath(pathname: string): boolean {
  return CEO_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
  match: (pathname: string) => boolean;
};

const DASHBOARD_ITEM: NavItem = {
  to: "/",
  label: "Dashboard",
  icon: LayoutDashboard,
  end: true,
  match: (pathname) =>
    pathname === "/" ||
    pathname === "/create" ||
    pathname.startsWith("/system/"),
};

const CEO_PRIMARY: NavItem[] = [
  {
    to: "/brand-hub",
    label: "Brand Hub",
    icon: Sparkles,
    match: (pathname) =>
      pathname === "/brand-hub" || pathname.startsWith("/brand-hub/"),
  },
  {
    to: "/mockups",
    label: "Studio",
    icon: Shirt,
    match: (pathname) =>
      pathname === "/mockups" ||
      pathname.startsWith("/mockups") ||
      pathname.startsWith("/creative-assets"),
  },
  {
    to: "/my-tasks",
    label: "My Tasks",
    icon: CheckSquare,
    match: (pathname) =>
      pathname === "/my-tasks" || pathname.startsWith("/my-tasks"),
  },
];

const CEO_OPS: NavItem[] = [
  {
    to: "/order-flow",
    label: "Order Flow",
    icon: Package,
    match: (pathname) =>
      pathname === "/order-flow" || pathname.startsWith("/order-flow"),
  },
  {
    to: "/shop-supplies",
    label: "Inventory",
    icon: Boxes,
    match: (pathname) =>
      pathname === "/shop-supplies" || pathname.startsWith("/shop-supplies"),
  },
  {
    to: "/support",
    label: "Support",
    icon: LifeBuoy,
    match: (pathname) =>
      pathname === "/support" || pathname.startsWith("/support"),
  },
  {
    to: "/sops",
    label: "Knowledge Base",
    icon: ClipboardList,
    match: (pathname) => pathname === "/sops" || pathname.startsWith("/sops/"),
  },
  {
    to: "/training-center",
    label: "Training Center",
    icon: BookOpen,
    match: (pathname) =>
      pathname === "/training-center" ||
      pathname.startsWith("/training-center/"),
  },
  {
    to: "/our-mission",
    label: "Our Mission",
    icon: Target,
    match: (pathname) =>
      pathname === "/our-mission" || pathname.startsWith("/our-mission/"),
  },
];

const OPS_NAV: NavItem[] = [
  {
    to: "/order-flow",
    label: "Order Flow",
    icon: Package,
    match: (pathname) =>
      pathname === "/order-flow" || pathname.startsWith("/order-flow"),
  },
  {
    to: "/shop-supplies",
    label: "Inventory",
    icon: Boxes,
    match: (pathname) =>
      pathname === "/shop-supplies" || pathname.startsWith("/shop-supplies"),
  },
  {
    to: "/support",
    label: "Support",
    icon: LifeBuoy,
    match: (pathname) =>
      pathname === "/support" || pathname.startsWith("/support"),
  },
  {
    to: "/my-tasks",
    label: "My Tasks",
    icon: CheckSquare,
    match: (pathname) =>
      pathname === "/my-tasks" || pathname.startsWith("/my-tasks"),
  },
  {
    to: "/sops",
    label: "Knowledge Base",
    icon: ClipboardList,
    match: (pathname) => pathname === "/sops" || pathname.startsWith("/sops/"),
  },
];

function NavMenuItems({
  items,
  orderFlowNewCount = 0,
  supportEscalationCount = 0,
  onOrderFlowOpen,
}: {
  items: NavItem[];
  orderFlowNewCount?: number;
  supportEscalationCount?: number;
  onOrderFlowOpen?: () => void;
}) {
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        const showNewOrders =
          item.to === "/order-flow" && orderFlowNewCount > 0;
        const showSupportEsc =
          item.to === "/support" && supportEscalationCount > 0;
        const badgeCount = showNewOrders
          ? orderFlowNewCount
          : showSupportEsc
            ? supportEscalationCount
            : 0;
        return (
          <SidebarMenuItem key={item.to}>
            <SidebarMenuButton
              asChild
              tooltip={
                badgeCount > 0
                  ? `${item.label} (+${badgeCount})`
                  : item.label
              }
              isActive={item.match(pathname)}
            >
              <NavLink
                to={item.to}
                end={item.end}
                onClick={() => {
                  if (item.to === "/order-flow") onOrderFlowOpen?.();
                  if (isMobile) setOpenMobile(false);
                }}
              >
                <Icon />
                <span>{item.label}</span>
              </NavLink>
            </SidebarMenuButton>
            {badgeCount > 0 ? (
              <SidebarMenuBadge
                className={
                  showSupportEsc
                    ? "bg-amber-600 text-white"
                    : "bg-brand text-brand-foreground"
                }
              >
                +{badgeCount > 99 ? "99" : badgeCount}
              </SidebarMenuBadge>
            ) : null}
          </SidebarMenuItem>
        );
      })}
    </>
  );
}

function AppSidebar({
  isCeo,
  accountIsCeo,
  viewMode,
  firstName,
  email,
  signingOut,
  onViewMode,
  onSignOut,
}: {
  isCeo: boolean;
  accountIsCeo: boolean;
  viewMode: AppRole | null;
  firstName: string;
  email?: string | null;
  signingOut: boolean;
  onViewMode: (mode: AppRole) => void;
  onSignOut: () => void;
}) {
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const { count: orderFlowNewCount, clearBadge } = useOrderFlowNewCount(email);
  const { count: supportEscalationCount } = useSupportEscalationCount(true);
  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Future Garment Group">
              <Link to="/" onClick={closeMobile}>
                <img
                  src={LOGO_SRC}
                  alt="Future Garment Group, LLC"
                  className="size-8 object-contain"
                  decoding="async"
                />
                <span className="truncate font-semibold">FGG Dash</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavMenuItems items={[DASHBOARD_ITEM]} />
              {isCeo ? <NavMenuItems items={CEO_PRIMARY} /> : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {isCeo ? (
          <Collapsible
            defaultOpen
            className="group/collapsible"
          >
            <SidebarGroup>
              <SidebarGroupLabel
                asChild
                className="cursor-pointer hover:text-sidebar-foreground"
              >
                <CollapsibleTrigger>
                  Operations
                  {orderFlowNewCount > 0 ? (
                    <span className="ml-1.5 rounded-md bg-brand px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-brand-foreground">
                      +{orderFlowNewCount > 99 ? "99" : orderFlowNewCount}
                    </span>
                  ) : null}
                  <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <NavMenuItems
                      items={CEO_OPS}
                      orderFlowNewCount={orderFlowNewCount}
                      supportEscalationCount={supportEscalationCount}
                      onOrderFlowOpen={clearBadge}
                    />
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ) : (
          <SidebarGroup>
            <SidebarGroupLabel>Menu</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavMenuItems
                  items={OPS_NAV}
                  orderFlowNewCount={orderFlowNewCount}
                  supportEscalationCount={supportEscalationCount}
                  onOrderFlowOpen={clearBadge}
                />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Settings"
              isActive={
                pathname.startsWith("/settings") ||
                pathname.startsWith("/admin")
              }
            >
              <NavLink to="/settings" onClick={closeMobile}>
                <Settings />
                <span>Settings</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {accountIsCeo ? (
          <div
            className="mx-2 inline-flex rounded-lg border border-sidebar-border bg-sidebar p-0.5 group-data-[collapsible=icon]:hidden"
            role="group"
            aria-label="Dashboard view"
          >
            <button
              type="button"
              onClick={() => onViewMode("ceo")}
              className={cn(
                "flex-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                viewMode === "ceo"
                  ? "bg-background text-brand shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              CEO
            </button>
            <button
              type="button"
              onClick={() => onViewMode("ops")}
              className={cn(
                "flex-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                viewMode === "ops"
                  ? "bg-background text-brand shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Ops
            </button>
          </div>
        ) : null}

        <div className="mx-2 mb-1 rounded-lg border border-sidebar-border bg-sidebar p-3 group-data-[collapsible=icon]:hidden">
          <p className="truncate text-sm font-semibold text-sidebar-foreground">
            {firstName || "Signed in"}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {email || (isCeo ? "CEO dashboard" : "Ops / Productions")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link to="/settings" onClick={closeMobile}>
                Profile
              </Link>
            </Button>
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              className="gap-1"
              disabled={signingOut}
              onClick={onSignOut}
            >
              <LogOut className="size-3.5" />
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export function DashboardLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const {
    loading,
    isSignedIn,
    isCeo,
    accountIsCeo,
    needsViewPick,
    viewMode,
    setViewMode,
    user,
    isDevAuthBypass,
  } = useAuth();
  const firstName = userFirstName(user);
  const [signingOut, setSigningOut] = useState(false);

  const handleViewMode = (mode: AppRole) => {
    setViewMode(mode);
    if (mode === "ops" && isCeoOnlyPath(pathname)) {
      navigate("/", { replace: true });
    }
  };

  const handleSignOut = async () => {
    if (isDevAuthBypass) {
      toast.message("Local preview — sign-in is bypassed here");
      return;
    }
    if (!supabase) {
      toast.error("Supabase is not configured yet");
      return;
    }
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    setSigningOut(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Signed out");
    navigate("/");
  };

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return <SignInPage />;
  }

  if (needsViewPick) {
    return <ViewModePicker />;
  }

  return (
    <SidebarProvider className="h-dvh min-h-0 overflow-hidden">
      <AppSidebar
        isCeo={isCeo}
        accountIsCeo={accountIsCeo}
        viewMode={viewMode}
        firstName={firstName}
        email={user?.email}
        signingOut={signingOut}
        onViewMode={handleViewMode}
        onSignOut={() => void handleSignOut()}
      />
      <SidebarInset className="min-h-0 overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
          <img
            src={LOGO_SRC}
            alt="Future Garment Group, LLC"
            className="h-8 w-auto object-contain object-left md:hidden"
            decoding="async"
          />
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          {pathname.startsWith("/settings") ? (
            <div className="min-h-0 flex-1">
              <Outlet />
            </div>
          ) : (
            <div className="mx-auto min-h-full w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-8">
              <Outlet />
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
