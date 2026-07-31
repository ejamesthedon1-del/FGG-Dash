import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, LifeBuoy, Loader2, LogOut, Settings2, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "../lib/use-auth";
import { roleLabel, userFirstName } from "../lib/auth-roles";
import {
  fetchSupportAutoReplyConfig,
  type SupportAutoReplyConfig,
} from "../lib/support-gmail";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { cn } from "./ui/utils";

type SettingsSection =
  | "account"
  | "preferences"
  | "notifications"
  | "auto-replies";

const GENERAL_NAV: {
  id: Exclude<SettingsSection, "auto-replies">;
  label: string;
  icon: typeof User;
}[] = [
  { id: "account", label: "Account", icon: User },
  { id: "preferences", label: "Preferences", icon: Settings2 },
  { id: "notifications", label: "Notifications", icon: Bell },
];

function formatReplyAt(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { user, role, isCeo } = useAuth();
  const [section, setSection] = useState<SettingsSection>("account");
  const [signingOut, setSigningOut] = useState(false);
  const [autoConfig, setAutoConfig] = useState<SupportAutoReplyConfig | null>(
    null,
  );
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);

  const firstName = userFirstName(user);
  const email = user?.email ?? "—";
  const initial = useMemo(() => {
    const source = firstName || email;
    return source && source !== "—" ? source.charAt(0).toUpperCase() : "?";
  }, [firstName, email]);

  const loadAutoReplies = useCallback(async () => {
    if (!isCeo) return;
    setAutoLoading(true);
    setAutoError(null);
    try {
      const data = await fetchSupportAutoReplyConfig();
      setAutoConfig(data);
    } catch (err) {
      setAutoError(
        err instanceof Error ? err.message : "Failed to load auto-replies",
      );
    } finally {
      setAutoLoading(false);
    }
  }, [isCeo]);

  useEffect(() => {
    if (section === "auto-replies" && isCeo) {
      void loadAutoReplies();
    }
  }, [section, isCeo, loadAutoReplies]);

  useEffect(() => {
    if (!isCeo && section === "auto-replies") {
      setSection("account");
    }
  }, [isCeo, section]);

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

          {isCeo ? (
            <div>
              <p className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Support
              </p>
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => setSection("auto-replies")}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors",
                    section === "auto-replies"
                      ? "bg-gray-100 text-gray-950"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                  )}
                >
                  <LifeBuoy className="h-4 w-4 shrink-0 opacity-70" />
                  Auto-replies
                </button>
              </div>
            </div>
          ) : null}
        </nav>
      </aside>

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
                <h2 className="text-base font-semibold text-gray-950">
                  Account Security
                </h2>
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
              <div className="mt-6 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center">
                <Settings2 className="mx-auto h-5 w-5 text-gray-400" />
                <p className="mt-2 text-sm font-medium text-gray-800">Coming soon</p>
                <p className="mt-1 text-sm text-gray-500">
                  Dashboard and display preferences will live here.
                </p>
              </div>
            </section>
          ) : null}

          {section === "notifications" ? (
            <section>
              <h2 className="text-base font-semibold text-gray-950">
                Notifications
              </h2>
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

          {section === "auto-replies" && isCeo ? (
            <div className="space-y-8">
              <section>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-gray-950">
                      Support auto-replies
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Stage templates and a log of replies sent from Support.
                      CEO view only.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={autoLoading}
                    onClick={() => void loadAutoReplies()}
                  >
                    {autoLoading ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : null}
                    Refresh
                  </Button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {autoConfig?.liveEnabled ? (
                    <Badge variant="default">Live sending ON</Badge>
                  ) : (
                    <Badge variant="secondary">Test mode — no customer emails</Badge>
                  )}
                  {autoConfig?.connected ? (
                    <Badge variant="outline">
                      Gmail: {autoConfig.email || "connected"}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Gmail not connected</Badge>
                  )}
                  {autoConfig && !autoConfig.canSend ? (
                    <Badge variant="secondary">Needs send permission</Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Live mode is controlled by{" "}
                  <code className="text-[11px]">SUPPORT_AUTO_REPLY_LIVE</code> on
                  the backend. Leave it off until you&apos;re ready.
                </p>
                {autoError ? (
                  <p className="mt-3 text-sm text-red-600">{autoError}</p>
                ) : null}
              </section>

              <section>
                <h3 className="text-sm font-semibold text-gray-950">
                  Reply templates by Order Flow stage
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  These are the bodies customers get (plus greeting / order
                  number / closing).
                </p>
                {autoLoading && !autoConfig ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="size-4 animate-spin" />
                    Loading…
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {(autoConfig?.templates || []).map((t) => (
                      <div
                        key={t.stage}
                        className="rounded-lg border border-gray-200 p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-gray-950">
                            {t.label}
                          </p>
                          <code className="text-[10px] text-gray-400">
                            {t.stage}
                          </code>
                        </div>
                        <pre className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                          {t.body}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold text-gray-950">
                  Sent auto-replies
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Recorded when a live (or test-to-self) send succeeds. Empty
                  while you&apos;re still in test mode with no sends.
                </p>
                {(autoConfig?.replies || []).length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center">
                    <LifeBuoy className="mx-auto h-5 w-5 text-gray-400" />
                    <p className="mt-2 text-sm font-medium text-gray-800">
                      No auto-replies logged yet
                    </p>
                  </div>
                ) : (
                  <ul className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {(autoConfig?.replies || []).map((r) => (
                      <li
                        key={`${r.threadId}-${r.at || r.gmailMessageId || ""}`}
                        className="px-4 py-3 text-sm"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="font-medium text-gray-950">
                            {r.orderName || "Order"}
                            {r.stage ? (
                              <span className="ml-2 text-xs font-normal text-gray-500">
                                {r.stage}
                              </span>
                            ) : null}
                          </p>
                          <span className="text-xs text-gray-500">
                            {formatReplyAt(r.at)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {r.customerEmail || "—"}
                          {r.brand ? ` · ${r.brand}` : ""}
                          {r.testToSelf ? " · test to self" : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
