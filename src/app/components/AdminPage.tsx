import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { OperatorDashboardStorage } from "../lib/storage";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { ArrowLeft, Shield } from "lucide-react";
import { toast } from "sonner";

export function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);

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

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setIsSignedIn(Boolean(data.session));
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(Boolean(session));
    });
    return () => subscription.unsubscribe();
  }, []);

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
    if (!isSignedIn) {
      toast.error("Sign in as admin first");
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
    toast.success("Home page sections updated");
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to employee dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="rounded-full bg-blue-100 p-3">
            <Shield className="h-8 w-8 text-blue-700" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Admin dashboard</h1>
          <p className="text-sm text-gray-600">Sign in to manage content and settings.</p>
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              {isSupabaseConfigured()
                ? "Sign in with your Supabase admin account."
                : "Supabase env vars are missing. Add them to enable admin login."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="username"
                placeholder="admin@company.com"
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
              <Button type="button" variant="outline" className="w-full" onClick={handleSignOut} disabled={isSubmitting}>
                {isSubmitting ? "Signing out..." : "Sign out"}
              </Button>
            ) : (
              <Button type="button" className="w-full" onClick={handleSignIn} disabled={isSubmitting || !isSupabaseConfigured()}>
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            )}
          </CardContent>
        </Card>
        <Card className="mt-6 w-full">
          <CardHeader>
            <CardTitle>Operator dashboard content</CardTitle>
            <CardDescription>
              Edit what appears in Today&apos;s priorities on the employee dashboard.
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
                disabled={!isSignedIn}
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
                disabled={!isSignedIn}
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
                disabled={!isSignedIn}
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
                disabled={!isSignedIn}
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
                disabled={!isSignedIn}
              />
            </div>
            <Button type="button" className="w-full" onClick={saveOperatorDashboard} disabled={!isSignedIn}>
              Save home page sections
            </Button>
            {!isSignedIn && (
              <p className="text-xs text-gray-500">Sign in first to edit and save dashboard priorities.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
