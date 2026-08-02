import { useState, type ComponentType } from "react";
import { Outlet, Link, NavLink, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  BookOpen,
  Boxes,
  ChevronDown,
  Inbox,
  LayoutDashboard,
  Library,
  ListTodo,
  LogOut,
  Package,
  PenTool,
  Settings,
  Shirt,
  Sparkles,
  Target,
  Timer,
  Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { cn } from "./ui/utils";
import { useAuth } from "../lib/use-auth";
import { userFirstName, type AppRole } from "../lib/auth-roles";
import { SignInPage } from "./SignInPage";
import { ViewModePicker } from "./ViewModePicker";
import { TimeClockStickyBar } from "./TimeClockStickyBar";
import { OrdersSpotlightTour } from "./OrdersSpotlightTour";
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar";
import { useOrderFlowNewCount } from "../lib/use-order-flow-new-count";
import { useSupportEscalationCount } from "../lib/use-support-escalation-count";
import { useClockActive } from "../lib/use-clock-active";

const LOGO_SRC = "/fgg-logo.png?v=2";

const CEO_ONLY_PREFIXES = [
  "/brand-hub",
  "/cash",
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
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  end?: boolean;
  match: (pathname: string) => boolean;
};

type NavSection = {
  label?: string;
  /** Collapsible group header — same pattern as CEO Operations/Resources. */
  collapsible?: boolean;
  items: NavItem[];
};

const NAV = {
  dashboard: {
    to: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    end: true,
    match: (pathname: string) =>
      pathname === "/" ||
      pathname === "/create" ||
      pathname.startsWith("/system/"),
  },
  brandHub: {
    to: "/brand-hub",
    label: "Brand Hub",
    icon: Sparkles,
    match: (pathname: string) =>
      pathname === "/brand-hub" || pathname.startsWith("/brand-hub/"),
  },
  cash: {
    to: "/cash",
    label: "Cash",
    icon: Wallet,
    match: (pathname: string) =>
      pathname === "/cash" || pathname.startsWith("/cash/"),
  },
  studio: {
    to: "/mockups",
    label: "Studio",
    icon: Shirt,
    match: (pathname: string) =>
      pathname === "/mockups" ||
      pathname.startsWith("/mockups") ||
      pathname.startsWith("/creative-assets"),
  },
  myTasks: {
    to: "/my-tasks",
    label: "Tasks",
    icon: ListTodo,
    match: (pathname: string) =>
      pathname === "/my-tasks" || pathname.startsWith("/my-tasks"),
  },
  orderFlow: {
    to: "/order-flow",
    label: "Orders",
    icon: Package,
    match: (pathname: string) =>
      pathname === "/order-flow" || pathname.startsWith("/order-flow"),
  },
  inventory: {
    to: "/shop-supplies",
    label: "Inventory",
    icon: Boxes,
    match: (pathname: string) =>
      pathname === "/shop-supplies" || pathname.startsWith("/shop-supplies"),
  },
  support: {
    to: "/support",
    label: "Inbox",
    icon: Inbox,
    match: (pathname: string) =>
      pathname === "/support" || pathname.startsWith("/support"),
  },
  clock: {
    to: "/clock",
    label: "Time",
    icon: Timer,
    match: (pathname: string) =>
      pathname === "/clock" || pathname.startsWith("/clock/"),
  },
  whiteboard: {
    to: "/whiteboard",
    label: "Whiteboard",
    icon: PenTool,
    match: (pathname: string) =>
      pathname === "/whiteboard" || pathname.startsWith("/whiteboard/"),
  },
  knowledgeBase: {
    to: "/sops",
    label: "Library",
    icon: Library,
    match: (pathname: string) =>
      pathname === "/sops" || pathname.startsWith("/sops/"),
  },
  trainingCenter: {
    to: "/training-center",
    label: "Training Center",
    icon: BookOpen,
    match: (pathname: string) =>
      pathname === "/training-center" ||
      pathname.startsWith("/training-center/"),
  },
  ourMission: {
    to: "/our-mission",
    label: "Our Mission",
    icon: Target,
    match: (pathname: string) =>
      pathname === "/our-mission" || pathname.startsWith("/our-mission/"),
  },
} as const satisfies Record<string, NavItem>;

/** CEO: strategy → creative → personal day → floor → resources */
const CEO_SECTIONS: NavSection[] = [
  { label: "Overview", items: [NAV.dashboard] },
  { label: "Business", items: [NAV.brandHub, NAV.cash] },
  { label: "Creative", items: [NAV.studio] },
  { label: "My day", items: [NAV.myTasks, NAV.clock, NAV.whiteboard] },
  { label: "Floor", items: [NAV.orderFlow, NAV.inventory, NAV.support] },
  {
    label: "Resources",
    collapsible: true,
    items: [NAV.knowledgeBase, NAV.trainingCenter, NAV.ourMission],
  },
];

const OPS_OVERVIEW: NavItem = { ...NAV.dashboard, label: "Overview" };

const OPS_SECTIONS: NavSection[] = [
  {
    label: "Menu",
    items: [
      OPS_OVERVIEW,
      NAV.orderFlow,
      NAV.inventory,
      NAV.support,
      NAV.clock,
      NAV.myTasks,
      NAV.whiteboard,
    ],
  },
  {
    label: "Resources",
    collapsible: true,
    items: [NAV.knowledgeBase],
  },
];

const NAV_ICON_PROPS = {
  strokeWidth: 1.75,
  className: "size-4 shrink-0",
} as const;

function NavMenuItems({
  items,
  orderFlowNewCount = 0,
  supportEscalationCount = 0,
  clockActive = false,
  onOrderFlowOpen,
}: {
  items: NavItem[];
  orderFlowNewCount?: number;
  supportEscalationCount?: number;
  clockActive?: boolean;
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
        const showClockLive = item.to === "/clock" && clockActive;
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
                showClockLive
                  ? "Time · live"
                  : badgeCount > 0
                    ? `${item.label} (+${badgeCount})`
                    : item.label
              }
              isActive={item.match(pathname)}
              className="h-[38px] rounded-md border-0 text-[length:var(--text-utility)] font-normal leading-[var(--leading-utility)] tracking-[var(--tracking-utility)] text-sidebar-foreground/80 hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:font-normal data-[active=true]:text-sidebar-foreground data-[active=true]:[&_svg]:text-brand [&_svg]:text-muted-foreground [&>span:last-child]:overflow-visible [&>span:last-child]:whitespace-nowrap"
            >
              <NavLink
                to={item.to}
                end={item.end}
                data-tour={item.to === "/order-flow" ? "nav-orders" : undefined}
                onClick={() => {
                  if (item.to === "/order-flow") onOrderFlowOpen?.();
                  if (isMobile) setOpenMobile(false);
                }}
              >
                <Icon {...NAV_ICON_PROPS} />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {badgeCount > 0 ? (
                  <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center overflow-visible rounded-md bg-brand px-1 text-xs font-medium tabular-nums text-brand-foreground">
                    +{badgeCount > 99 ? "99" : badgeCount}
                  </span>
                ) : showClockLive ? (
                  <span className="ml-auto flex h-5 shrink-0 items-center justify-center overflow-visible rounded-md bg-brand px-1.5 text-xs font-medium text-brand-foreground">
                    Live
                  </span>
                ) : null}
              </NavLink>
            </SidebarMenuButton>
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
  const { user } = useAuth();
  const clockActive = useClockActive(user?.id);
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
                <span className="truncate font-semibold text-sidebar-foreground">
                  FGG Dash
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {(isCeo ? CEO_SECTIONS : OPS_SECTIONS).map((section, index) => {
          const showFloorBadge =
            section.label === "Floor" && orderFlowNewCount > 0;
          const sectionKey = section.label ?? `section-${index}`;
          const groupLabelClass =
            "h-auto py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70 hover:text-muted-foreground";
          const menu = (
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                <NavMenuItems
                  items={section.items}
                  orderFlowNewCount={orderFlowNewCount}
                  supportEscalationCount={supportEscalationCount}
                  clockActive={clockActive}
                  onOrderFlowOpen={clearBadge}
                />
              </SidebarMenu>
            </SidebarGroupContent>
          );

          if (section.collapsible && section.label) {
            const childActive = section.items.some((entry) =>
              entry.match(pathname),
            );
            return (
              <Collapsible
                key={sectionKey}
                defaultOpen={childActive}
                className="group/collapsible"
              >
                <SidebarGroup>
                  <SidebarGroupLabel
                    asChild
                    className={cn(
                      groupLabelClass,
                      "cursor-pointer hover:text-muted-foreground",
                    )}
                  >
                    <CollapsibleTrigger>
                      {section.label}
                      <ChevronDown
                        strokeWidth={1.75}
                        className="ml-auto size-3.5 text-muted-foreground/70 transition-transform group-data-[state=open]/collapsible:rotate-180"
                      />
                    </CollapsibleTrigger>
                  </SidebarGroupLabel>
                  <CollapsibleContent>{menu}</CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            );
          }

          return (
            <SidebarGroup key={sectionKey}>
              {section.label ? (
                <SidebarGroupLabel className={groupLabelClass}>
                  {section.label}
                  {showFloorBadge ? (
                    <span className="ml-1.5 rounded-md bg-brand px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal tabular-nums text-brand-foreground">
                      +{orderFlowNewCount > 99 ? "99" : orderFlowNewCount}
                    </span>
                  ) : null}
                </SidebarGroupLabel>
              ) : null}
              {menu}
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Settings"
              isActive={
                pathname.startsWith("/settings") ||
                pathname.startsWith("/admin")
              }
              className="h-[38px] rounded-md border-0 text-[length:var(--text-utility)] font-normal leading-[var(--leading-utility)] tracking-[var(--tracking-utility)] text-sidebar-foreground/80 hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:font-normal data-[active=true]:text-sidebar-foreground data-[active=true]:[&_svg]:text-brand [&_svg]:text-muted-foreground"
            >
              <NavLink to="/settings" onClick={closeMobile}>
                <Settings {...NAV_ICON_PROPS} />
                <span>Settings</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {accountIsCeo ? (
          <div
            className="mx-2 inline-flex rounded-md border border-sidebar-border bg-sidebar p-0.5 group-data-[collapsible=icon]:hidden"
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

        <div className="mx-2 mb-1 border-t border-sidebar-border pt-3 group-data-[collapsible=icon]:hidden">
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
              <LogOut strokeWidth={1.75} className="size-3.5" />
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
          <TimeClockStickyBar />
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          {pathname.startsWith("/settings") ||
          pathname.startsWith("/whiteboard") ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <Outlet />
            </div>
          ) : (
            <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pt-8">
              <div className="min-w-0 flex-1 pb-10 sm:pb-12">
                <Outlet />
              </div>
              <footer className="mt-auto shrink-0 border-t border-black/[0.06] py-8 text-center text-xs text-muted-foreground">
                Future Garment Group
              </footer>
            </div>
          )}
        </div>
      </SidebarInset>
      <OrdersSpotlightTour />
    </SidebarProvider>
  );
}
