import { Outlet, Link, NavLink, useLocation } from "react-router";
import { Button } from "./ui/button";
import { BookOpen, ClipboardList, LayoutDashboard, Plus, Shield, Sparkles, Target } from "lucide-react";
import { cn } from "./ui/utils";

const LOGO_SRC = "/logo.svg";

const sidebarNavClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
    isActive
      ? "bg-blue-50 text-blue-700"
      : "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
  );

export function DashboardLayout() {
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Top bar */}
      <header className="z-50 shrink-0 border-b border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={LOGO_SRC}
              alt="Training Systems"
              className="h-10 w-10 shrink-0 object-contain"
              decoding="async"
            />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-gray-900 sm:text-lg">
                Training Systems
              </h1>
              <p className="truncate text-xs text-gray-500 sm:text-sm">Employee Knowledge Base</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link to="/admin">
              <Button variant="secondary" size="sm" className="gap-2">
                <Shield className="h-4 w-4" />
                Admin
              </Button>
            </Link>
            <Link to="/create">
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New System</span>
              </Button>
            </Link>
            <Link to="/sops/create">
              <Button variant="outline" size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New SOP</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Sidebar + main */}
      <div className="flex min-h-0 flex-1">
        <aside
          className="flex w-52 shrink-0 flex-col border-r border-gray-200 bg-white sm:w-56 lg:w-64"
          aria-label="Main navigation"
        >
          <nav className="flex flex-col gap-0.5 p-3 sm:p-4">
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
              All Systems
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
              SOPs
            </NavLink>
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
          </nav>
        </aside>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="min-h-full px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
