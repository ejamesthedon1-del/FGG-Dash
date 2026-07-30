import { useState } from "react";
import { Outlet, Link, NavLink, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  BookOpen,
  Boxes,
  CheckSquare,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  Shirt,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { cn } from "./ui/utils";
import { useAuth } from "../lib/use-auth";
import { userFirstName, type AppRole } from "../lib/auth-roles";
import { SignInPage } from "./SignInPage";
import { ViewModePicker } from "./ViewModePicker";
import { Button } from "./ui/button";

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

const sidebarNavClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand/35",
    isActive
      ? "bg-gray-100 text-gray-950"
      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  const closeMobile = () => setMobileNavOpen(false);

  const renderNav = () => (
    <>
      <NavLink
        to="/"
        end
        onClick={closeMobile}
        className={({ isActive }) =>
          sidebarNavClass({
            isActive:
              isActive || pathname === "/create" || pathname.startsWith("/system/"),
          })
        }
      >
        <LayoutDashboard className="h-4 w-4 shrink-0 opacity-80" />
        Dashboard
      </NavLink>

      {isCeo ? (
        <>
          <NavLink
            to="/brand-hub"
            onClick={closeMobile}
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
            to="/my-tasks"
            onClick={closeMobile}
            className={({ isActive }) =>
              sidebarNavClass({
                isActive: isActive || pathname.startsWith("/my-tasks"),
              })
            }
          >
            <CheckSquare className="h-4 w-4 shrink-0 opacity-80" />
            My Tasks
          </NavLink>

          <div className="my-2 border-t border-gray-100" />

          <NavLink
            to="/order-flow"
            onClick={closeMobile}
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
            to="/shop-supplies"
            onClick={closeMobile}
            className={({ isActive }) =>
              sidebarNavClass({
                isActive: isActive || pathname.startsWith("/shop-supplies"),
              })
            }
          >
            <Boxes className="h-4 w-4 shrink-0 opacity-80" />
            Inventory
          </NavLink>
          <NavLink
            to="/mockups"
            onClick={closeMobile}
            className={({ isActive }) =>
              sidebarNavClass({
                isActive:
                  isActive ||
                  pathname.startsWith("/mockups") ||
                  pathname.startsWith("/creative-assets"),
              })
            }
          >
            <Shirt className="h-4 w-4 shrink-0 opacity-80" />
            Mockups
          </NavLink>
          <NavLink
            to="/sops"
            onClick={closeMobile}
            className={({ isActive }) =>
              sidebarNavClass({
                isActive: isActive || pathname.startsWith("/sops/"),
              })
            }
          >
            <ClipboardList className="h-4 w-4 shrink-0 opacity-80" />
            Knowledge Base
          </NavLink>
          <NavLink
            to="/training-center"
            onClick={closeMobile}
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
            onClick={closeMobile}
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
      ) : (
        <>
          <NavLink
            to="/order-flow"
            onClick={closeMobile}
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
            to="/shop-supplies"
            onClick={closeMobile}
            className={({ isActive }) =>
              sidebarNavClass({
                isActive: isActive || pathname.startsWith("/shop-supplies"),
              })
            }
          >
            <Boxes className="h-4 w-4 shrink-0 opacity-80" />
            Inventory
          </NavLink>
          <NavLink
            to="/my-tasks"
            onClick={closeMobile}
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
            onClick={closeMobile}
            className={({ isActive }) =>
              sidebarNavClass({
                isActive: isActive || pathname.startsWith("/sops/"),
              })
            }
          >
            <ClipboardList className="h-4 w-4 shrink-0 opacity-80" />
            Knowledge Base
          </NavLink>
        </>
      )}

      <div className="mt-auto space-y-3 border-t border-gray-100 pt-3">
        <NavLink
          to="/settings"
          onClick={closeMobile}
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

        {accountIsCeo ? (
          <div
            className="inline-flex w-full rounded-lg border border-gray-100 bg-white p-0.5"
            role="group"
            aria-label="Dashboard view"
          >
            <button
              type="button"
              onClick={() => handleViewMode("ceo")}
              className={cn(
                "flex-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                viewMode === "ceo"
                  ? "bg-white text-brand shadow-xs"
                  : "text-gray-500 hover:text-gray-800",
              )}
            >
              CEO
            </button>
            <button
              type="button"
              onClick={() => handleViewMode("ops")}
              className={cn(
                "flex-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                viewMode === "ops"
                  ? "bg-white text-brand shadow-xs"
                  : "text-gray-500 hover:text-gray-800",
              )}
            >
              Ops
            </button>
          </div>
        ) : null}

        <div className="rounded-xl border border-gray-100 bg-white p-3">
          <p className="truncate text-sm font-semibold text-gray-950">
            {firstName || "Signed in"}
          </p>
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {user?.email || (isCeo ? "CEO dashboard" : "Ops / Productions")}
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
              onClick={() => void handleSignOut()}
            >
              <LogOut className="size-3.5" />
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-white">
      {/* Desktop sidebar */}
      <aside
        className="hidden h-full w-64 shrink-0 flex-col border-r border-gray-100 bg-white lg:flex"
        aria-label="Main navigation"
      >
        <div className="flex h-16 shrink-0 items-center border-b border-gray-100 px-4">
          <img
            src={LOGO_SRC}
            alt="Future Garment Group, LLC"
            className="h-10 w-auto max-w-full object-contain object-left"
            decoding="async"
          />
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-3">{renderNav()}</nav>
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-gray-950/40"
            aria-label="Close navigation"
            onClick={closeMobile}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col border-r border-gray-100 bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-gray-100 px-3">
              <img
                src={LOGO_SRC}
                alt="Future Garment Group, LLC"
                className="h-8 w-auto object-contain object-left"
                decoding="async"
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="size-8"
                onClick={closeMobile}
                aria-label="Close menu"
              >
                <X className="size-4" />
              </Button>
            </div>
            <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-3">
              {renderNav()}
            </nav>
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-100 bg-white px-4 lg:hidden">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="size-8"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-4" />
          </Button>
          <img
            src={LOGO_SRC}
            alt="Future Garment Group, LLC"
            className="h-8 w-auto object-contain object-left"
            decoding="async"
          />
        </header>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-white">
          {pathname.startsWith("/settings") ? (
            <div className="min-h-0 flex-1">
              <Outlet />
            </div>
          ) : (
            <div className="mx-auto min-h-full w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-8">
              <Outlet />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
