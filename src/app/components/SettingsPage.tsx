import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, LogOut, Settings2, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "../lib/use-auth";
import { roleLabel, userFirstName, type AppRole } from "../lib/auth-roles";
import { Button } from "./ui/button";
import { cn } from "./ui/utils";

type SettingsSection = "account" | "preferences" | "notifications";

const GENERAL_NAV: {
  id: SettingsSection;
  label: string;
  icon: typeof User;
}[] = [
  { id: "account", label: "Account", icon: User },
  { id: "preferences", label: "Preferences", icon: Settings2 },
  { id: "notifications", label: "Notifications", icon: Bell },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const {
    user,
    role,
    accountIsCeo,
    viewMode,
    setViewMode,
    isCeo,
  } = useAuth();
  const [section, setSection] = useState<SettingsSection>("account");
  const [signingOut, setSigningOut] = useState(false);

  const firstName = userFirstName(user);
  const email = user?.email ?? "—";
  const initial = useMemo(() => {
    const source = firstName || email;
    return source && source !== "—" ? source.charAt(0).toUpperCase() : "?";
  }, [firstName, email]);

  const handleViewMode = (mode: AppRole) => {
    setViewMode(mode);
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

  return (
    <div className="flex min-h-full bg-white">
      {/* Secondary settings nav */}
      <aside
        className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white sm:w-60"
        aria-label="Settings sections"
      >
        <div className="border-b border-gray-100 px-4 py-5">
          <h1 className="text-lg font-semibold tracking-tight text-gray-950">
            Account Settings
          </h1>
          <p className="mt-0.5 text-xs text-gray-500">
            {isCeo ? "CEO view" : "Ops / Productions"}
          </p>
        </div>

        <nav className="flex flex-col gap-4 p-3">
          <div>
            <p className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
              General
            </p>
            <div className="space-y-0.5">
              {GENERAL_NAV.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors",
                    section === id
                      ? "bg-gray-100 text-gray-950"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-70" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </nav>
      </aside>

      {/* Main settings content */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8 sm:px-8 lg:px-10">
          {section === "account" ? (
            <div className="space-y-0">
              <section className="border-b border-gray-200 pb-8">
                <h2 className="text-base font-semibold text-gray-950">My Profile</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Your signed-in identity on the FGG dashboard.
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-xl font-semibold text-brand">
                    {initial}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-950">
                      {firstName ? `Hi ${firstName}` : "Signed in"}
                    </p>
                    <p className="truncate text-sm text-gray-500">{email}</p>
                    {role ? (
                      <span className="mt-2 inline-flex rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        {roleLabel(role)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      Display name
                    </label>
                    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                      {firstName ?? "—"}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      Role
                    </label>
                    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                      {roleLabel(role)}
                    </div>
                  </div>
                </div>
              </section>

              <section className="border-b border-gray-200 py-8">
                <h2 className="text-base font-semibold text-gray-950">Account Security</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Manage how you access this dashboard.
                </p>

                <div className="mt-6 space-y-0 divide-y divide-gray-100 rounded-lg border border-gray-200">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-950">Email</p>
                      <p className="mt-0.5 truncate text-sm text-gray-500">{email}</p>
                    </div>
                    <Button type="button" variant="tertiary" size="sm" disabled>
                      Change email
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-950">Password</p>
                      <p className="mt-0.5 text-sm text-gray-500">
                        Managed through your Supabase account.
                      </p>
                    </div>
                    <Button type="button" variant="tertiary" size="sm" disabled>
                      Change password
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-950">Sign out</p>
                      <p className="mt-0.5 text-sm text-gray-500">
                        End your session on this device.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="tertiary"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => void handleSignOut()}
                      disabled={signingOut}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      {signingOut ? "Signing out…" : "Log out"}
                    </Button>
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {section === "preferences" ? (
            <section>
              <h2 className="text-base font-semibold text-gray-950">Preferences</h2>
              <p className="mt-1 text-sm text-gray-500">
                Choose how the dashboard looks for your account.
              </p>

              <div className="mt-6 rounded-lg border border-gray-200">
                <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4">
                  <div className="min-w-0 max-w-md">
                    <p className="text-sm font-medium text-gray-950">Dashboard view</p>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {accountIsCeo
                        ? "Switch between CEO tools and Ops floor view."
                        : "Ops accounts use the floor / productions view."}
                    </p>
                  </div>

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
                          "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
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
                          "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                          viewMode === "ops"
                            ? "bg-white text-brand shadow-sm"
                            : "text-gray-500 hover:text-gray-800",
                        )}
                      >
                        Ops
                      </button>
                    </div>
                  ) : (
                    <span className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                      Ops / Productions
                    </span>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          {section === "notifications" ? (
            <section>
              <h2 className="text-base font-semibold text-gray-950">Notifications</h2>
              <p className="mt-1 text-sm text-gray-500">
                Alert preferences for Order Flow and floor updates.
              </p>
              <div className="mt-6 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center">
                <Bell className="mx-auto h-5 w-5 text-gray-400" />
                <p className="mt-2 text-sm font-medium text-gray-800">Coming soon</p>
                <p className="mt-1 text-sm text-gray-500">
                  Email and Slack notification controls will live here.
                </p>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
