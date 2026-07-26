import { useState } from "react";
import { Link, Navigate } from "react-router";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "../lib/use-auth";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { ArrowLeft, Shield } from "lucide-react";
import { toast } from "sonner";

export function AdminPage() {
  const { loading, isSignedIn, user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-100">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/" replace />;
  }

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
          <p className="text-sm text-gray-600">Your FGG dashboard profile.</p>
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>Profile details</CardTitle>
            <CardDescription>Signed-in account information.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
