import { useState } from "react";
import { Link } from "react-router";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { useAuth } from "../lib/use-auth";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ArrowLeft, Shield } from "lucide-react";
import { toast } from "sonner";

export function AdminPage() {
  const { isSignedIn, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          <p className="text-sm text-gray-600">Sign in to your FGG dashboard account.</p>
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              {isSupabaseConfigured()
                ? "Enter your email and password."
                : "Supabase env vars are missing. Add them to enable login."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isSignedIn ? (
              <div className="space-y-3">
                <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  Signed in as <span className="font-medium">{user?.email ?? "—"}</span>
                </p>
                <Button
                  type="button"
                  variant="tertiary"
                  className="w-full"
                  onClick={handleSignOut}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Signing out..." : "Sign out"}
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="admin-email">Email</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    autoComplete="username"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isSubmitting}
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
                    disabled={isSubmitting}
                  />
                </div>
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleSignIn}
                  disabled={isSubmitting || !isSupabaseConfigured()}
                >
                  {isSubmitting ? "Signing in..." : "Sign in"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
