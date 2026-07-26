import { useState } from "react";
import { Outlet, Link, NavLink, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  BookOpen,
  CheckSquare,
  ChevronDown,
  ClipboardList,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  Sparkles,
  Target,
  User,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { cn } from "./ui/utils";
import { useAuth } from "../lib/use-auth";
import { userFirstName, type AppRole } from "../lib/auth-roles";
import { SignInPage } from "./SignInPage";
import { ViewModePicker } from "./ViewModePicker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const LOGO_SRC = "/fgg-logo.png?v=2";

const CEO_ONLY_PREFIXES = [
  "/brand-hub",
  "/creative-assets",
  "/training-center",
  "/our-mission",
];

function isCeoOnlyPath(pathname: string): boolean {
  return CEO_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

const sidebarNavClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
    isActive
      ? "bg-blue-50 text-blue-700"
      : "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
  );

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
      <div className="flex min-h-dvh items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading…</p>
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
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-gray-50">
      {/* Top bar */}
      <header className="z-50 shrink-0 border-b border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <img
              src={LOGO_SRC}
              alt="Future Garment Group, LLC"
              className="h-[4.5rem] w-auto max-w-[280px] shrink-0 object-contain object-left sm:h-24 sm:max-w-[340px]"
              decoding="async"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {accountIsCeo ? (
              <div
                className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5"
                role="group"
                aria-label="Dashboard view"
              >
                <button
                  type="button"
                  onClick={() => handleViewMode("ceo")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    viewMode === "ceo"
                      ? "bg-white text-brand shadow-sm"
                      : "text-gray-500 hover:text-gray-800",
                  )}
                >
                  CEO
                </button>
                <button
                  type="button"
                  onClick={() => handleViewMode("ops")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    viewMode === "ops"
                      ? "bg-white text-brand shadow-sm"
                      : "text-gray-500 hover:text-gray-800",
                  )}
                >
                  Ops
                </button>
              </div>
            ) : null}

            <div className="min-w-0 text-right">
              {firstName ? (
                <p className="truncate text-sm font-semibold text-gray-900 sm:text-base">
                  Hi {firstName}
                </p>
              ) : null}
              <p className="truncate text-xs font-medium text-gray-500 sm:text-sm">
                {isCeo ? "CEO dashboard" : "Ops / Productions"}
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-gray-500 outline-none transition-colors hover:text-gray-800 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
                  >
                    My profile
                    <ChevronDown className="h-3 w-3 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[11rem]">
                  {user?.email ? (
                    <>
                      <DropdownMenuLabel className="font-normal">
                        <p className="text-xs text-muted-foreground">Signed in as</p>
                        <p className="truncate text-sm font-medium text-foreground">
                          {user.email}
                        </p>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  {accountIsCeo ? (
                    <>
                      <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                        Switch view
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        onSelect={() => handleViewMode("ceo")}
                        disabled={viewMode === "ceo"}
                      >
                        CEO view
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => handleViewMode("ops")}
                        disabled={viewMode === "ops"}
                      >
                        Ops view
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  <DropdownMenuItem asChild>
                    <Link to="/settings" className="cursor-pointer">
                      <User className="h-4 w-4" />
                      View profile details
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={signingOut}
                    onSelect={(event) => {
                      event.preventDefault();
                      void handleSignOut();
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    {signingOut ? "Signing out…" : "Sign out"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Sidebar + main */}
      <div className="flex min-h-0 flex-1">
        <aside
          className="flex h-full w-52 shrink-0 flex-col border-r border-gray-200 bg-white sm:w-56 lg:w-64"
          aria-label="Main navigation"
        >
          <nav className="flex min-h-0 flex-1 flex-col gap-0.5 p-3 sm:p-4">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                sidebarNavClass({
                  isActive:
                    isActive ||
                    pathname === "/create" ||
                    pathname.startsWith("/system/"),
                })
              }
            >
              <LayoutDashboard className="h-4 w-4 shrink-0 opacity-80" />
              Dashboard
            </NavLink>
            <NavLink
              to="/order-flow"
              className={({ isActive }) =>
                sidebarNavClass({
                  isActive: isActive || pathname.startsWith("/order-flow"),
                })
              }
            >
              <Package className="h-4 w-4 shrink-0 opacity-80" />
              Order Flow
            </NavLink>
            <NavLink
              to="/my-tasks"
              className={({ isActive }) =>
                sidebarNavClass({
                  isActive: isActive || pathname.startsWith("/my-tasks"),
                })
              }
            >
              <CheckSquare className="h-4 w-4 shrink-0 opacity-80" />
              My Tasks
            </NavLink>
            <NavLink
              to="/sops"
              className={({ isActive }) =>
                sidebarNavClass({
                  isActive: isActive || pathname.startsWith("/sops/"),
                })
              }
            >
              <ClipboardList className="h-4 w-4 shrink-0 opacity-80" />
              Knowledge Base
            </NavLink>

            {isCeo ? (
              <>
                <div className="my-2 border-t border-gray-100" />
                <NavLink
                  to="/brand-hub"
                  className={({ isActive }) =>
                    sidebarNavClass({
                      isActive: isActive || pathname.startsWith("/brand-hub/"),
                    })
                  }
                >
                  <Sparkles className="h-4 w-4 shrink-0 opacity-80" />
                  Brand Hub
                </NavLink>
                <NavLink
                  to="/creative-assets"
                  className={({ isActive }) =>
                    sidebarNavClass({
                      isActive: isActive || pathname.startsWith("/creative-assets/"),
                    })
                  }
                >
                  <FolderOpen className="h-4 w-4 shrink-0 opacity-80" />
                  Creative Assets
                </NavLink>
                <NavLink
                  to="/training-center"
                  className={({ isActive }) =>
                    sidebarNavClass({
                      isActive: isActive || pathname.startsWith("/training-center/"),
                    })
                  }
                >
                  <BookOpen className="h-4 w-4 shrink-0 opacity-80" />
                  Training Center
                </NavLink>
                <NavLink
                  to="/our-mission"
                  className={({ isActive }) =>
                    sidebarNavClass({
                      isActive: isActive || pathname.startsWith("/our-mission/"),
                    })
                  }
                >
                  <Target className="h-4 w-4 shrink-0 opacity-80" />
                  Our Mission
                </NavLink>
              </>
            ) : null}

            <div className="mt-auto border-t border-gray-100 pt-2">
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  sidebarNavClass({
                    isActive:
                      isActive ||
                      pathname.startsWith("/settings") ||
                      pathname.startsWith("/admin"),
                  })
                }
              >
                <Settings className="h-4 w-4 shrink-0 opacity-80" />
                Settings
              </NavLink>
            </div>
          </nav>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          {pathname.startsWith("/settings") ? (
            <div className="min-h-0 flex-1">
              <Outlet />
            </div>
          ) : (
            <div className="min-h-full px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
              <Outlet />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
