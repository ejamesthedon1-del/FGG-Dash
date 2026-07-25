import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { OperatorDashboardStorage } from "../lib/storage";
import { useAuth } from "../lib/use-auth";
import { getCeoEmailAllowlist, roleLabel } from "../lib/auth-roles";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { ArrowLeft, Shield } from "lucide-react";
import { toast } from "sonner";

export function AdminPage() {
  const { isSignedIn, isCeo, canManageContent, role, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialPriorities = useMemo(
    () => OperatorDashboardStorage.getContent(),
    [],
  );
  const [prioritiesText, setPrioritiesText] = useState(initialPriorities.priorities.join("\n"));
  const [updatesText, setUpdatesText] = useState(initialPriorities.updates.join("\n"));
  const [tasksText, setTasksText] = useState(initialPriorities.tasksDueToday.join("\n"));
  const [issuesText, setIssuesText] = useState(initialPriorities.openIssues.join("\n"));
  const [quickLinksText, setQuickLinksText] = useState(
    initialPriorities.quickLinks.map((item) => `${item.label} | ${item.to}`).join("\n"),
  );

  const reloadOperatorForm = () => {
    const c = OperatorDashboardStorage.getContent();
    setPrioritiesText(c.priorities.join("\n"));
    setUpdatesText(c.updates.join("\n"));
    setTasksText(c.tasksDueToday.join("\n"));
    setIssuesText(c.openIssues.join("\n"));
    setQuickLinksText(c.quickLinks.map((item) => `${item.label} | ${item.to}`).join("\n"));
  };

  useEffect(() => {
    window.addEventListener("fgg-storage-sync", reloadOperatorForm);
    return () => window.removeEventListener("fgg-storage-sync", reloadOperatorForm);
  }, []);

  const handleSignIn = async () => {
    if (!supabase) {
      toast.error("Supabase is not configured yet");
      return;
    }
    if (!email.trim() || !password) {
      toast.error("Enter email and password");
      return;
    }
    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setIsSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPassword("");
    toast.success("Signed in");
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    setIsSubmitting(true);
    const { error } = await supabase.auth.signOut();
    setIsSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Signed out");
  };

  const saveOperatorDashboard = () => {
    if (!canManageContent) {
      toast.error("Sign in as CEO or Ops to edit the daily brief");
      return;
    }
    const priorities = prioritiesText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const updates = updatesText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const tasksDueToday = tasksText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const openIssues = issuesText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const quickLinks = quickLinksText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, to] = line.split("|").map((segment) => segment.trim());
        return { label: label ?? "", to: to ?? "" };
      })
      .filter((link) => link.label && link.to);
    OperatorDashboardStorage.saveContent({
      priorities,
      updates,
      tasksDueToday,
      openIssues,
      quickLinks,
    });
    toast.success("Daily brief updated");
  };

  const ceoAllowlistConfigured = getCeoEmailAllowlist().length > 0;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="rounded-full bg-blue-100 p-3">
            <Shield className="h-8 w-8 text-blue-700" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Account</h1>
          <p className="text-sm text-gray-600">
            Sign in as CEO (profits) or Ops / Productions (daily brief).
          </p>
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              {isSupabaseConfigured()
                ? "Use your Supabase account. CEO emails are set via VITE_CEO_EMAILS."
                : "Supabase env vars are missing. Add them to enable login."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="username"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting || isSignedIn}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting || isSignedIn}
              />
            </div>
            {isSignedIn ? (
              <div className="space-y-3">
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  <p>
                    <span className="font-medium">Signed in:</span> {user?.email ?? "—"}
                  </p>
                  <p className="mt-1">
                    <span className="font-medium">Role:</span> {roleLabel(role)}
                    {isCeo ? " · full profit dashboards" : " · daily brief only (no financials)"}
                  </p>
                  {!isCeo && !ceoAllowlistConfigured ? (
                    <p className="mt-2 text-xs text-amber-700">
                      No VITE_CEO_EMAILS set — all signed-in users are Ops. Add your email on Vercel to unlock CEO.
                    </p>
                  ) : null}
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={handleSignOut} disabled={isSubmitting}>
                  {isSubmitting ? "Signing out..." : "Sign out"}
                </Button>
              </div>
            ) : (
              <Button type="button" className="w-full" onClick={handleSignIn} disabled={isSubmitting || !isSupabaseConfigured()}>
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            )}
          </CardContent>
        </Card>
        <Card className="mt-6 w-full">
          <CardHeader>
            <CardTitle>Daily ops brief</CardTitle>
            <CardDescription>
              Edit priorities, tasks, and issues shown on the home page for Ops / Productions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="operator-priorities">Today&apos;s priorities (one per line)</Label>
              <Textarea
                id="operator-priorities"
                rows={6}
                value={prioritiesText}
                onChange={(e) => setPrioritiesText(e.target.value)}
                placeholder="Review SOPs marked Needs Update."
                disabled={!canManageContent}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="operator-quick-links">Quick links (Label | /path)</Label>
              <Textarea
                id="operator-quick-links"
                rows={4}
                value={quickLinksText}
                onChange={(e) => setQuickLinksText(e.target.value)}
                placeholder="SOP Library | /sops"
                disabled={!canManageContent}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="operator-updates">Updates (one per line)</Label>
              <Textarea
                id="operator-updates"
                rows={4}
                value={updatesText}
                onChange={(e) => setUpdatesText(e.target.value)}
                placeholder="Ops sync at 2:00 PM."
                disabled={!canManageContent}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="operator-tasks">Tasks due today (one per line)</Label>
              <Textarea
                id="operator-tasks"
                rows={4}
                value={tasksText}
                onChange={(e) => setTasksText(e.target.value)}
                placeholder="Confirm shipment exception handling checklist."
                disabled={!canManageContent}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="operator-issues">Open issues (one per line)</Label>
              <Textarea
                id="operator-issues"
                rows={4}
                value={issuesText}
                onChange={(e) => setIssuesText(e.target.value)}
                placeholder="Outstanding SOP reviews are pending follow-up."
                disabled={!canManageContent}
              />
            </div>
            <Button type="button" className="w-full" onClick={saveOperatorDashboard} disabled={!canManageContent}>
              Save daily brief
            </Button>
            {!canManageContent && (
              <p className="text-xs text-gray-500">Sign in as CEO or Ops to edit the daily brief.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
