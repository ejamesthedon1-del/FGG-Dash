import { useState, type FormEvent } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { cn } from "./ui/utils";
import { toast } from "sonner";

const LOGO_SRC = "/fgg-logo.png?v=2";

type Mode = "sign-in" | "sign-up";

export function SignInPage() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const configured = isSupabaseConfigured();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      toast.error("Supabase is not configured yet");
      return;
    }
    if (!email.trim() || !password) {
      toast.error("Enter email and password");
      return;
    }
    if (mode === "sign-up" && password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (mode === "sign-up" && password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setIsSubmitting(true);
    if (mode === "sign-in") {
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
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setIsSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPassword("");
    setConfirmPassword("");
    if (data.session) {
      toast.success("Account created");
      return;
    }
    toast.success("Check your email to confirm your account");
    setMode("sign-in");
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gray-50 px-4 py-10">
      <div className="flex w-full max-w-sm flex-col items-center">
        <img
          src={LOGO_SRC}
          alt="Future Garment Group, LLC"
          className="h-28 w-auto max-w-[280px] object-contain sm:h-32"
          decoding="async"
        />

        <div className="mt-8 w-full">
          <div
            className="mb-6 grid grid-cols-2 gap-1 rounded-lg border border-gray-200 bg-white p-1"
            role="tablist"
            aria-label="Account mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "sign-in"}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                mode === "sign-in"
                  ? "bg-brand text-brand-foreground"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
              )}
              onClick={() => setMode("sign-in")}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "sign-up"}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                mode === "sign-up"
                  ? "bg-brand text-brand-foreground"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
              )}
              onClick={() => setMode("sign-up")}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 sm:p-6">
            <div className="space-y-1.5 text-center">
              <h1 className="text-lg font-semibold text-gray-900">
                {mode === "sign-in" ? "Welcome back" : "Create your account"}
              </h1>
              <p className="text-sm text-gray-500">
                {configured
                  ? mode === "sign-in"
                    ? "Sign in to open the FGG dashboard."
                    : "Sign up with your work email to get access."
                  : "Supabase env vars are missing. Add them to enable login."}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="auth-email">Email</Label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="username"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                type="password"
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            {mode === "sign-up" ? (
              <div className="space-y-2">
                <Label htmlFor="auth-confirm-password">Confirm password</Label>
                <Input
                  id="auth-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={isSubmitting || !configured}>
              {isSubmitting
                ? mode === "sign-in"
                  ? "Signing in…"
                  : "Creating account…"
                : mode === "sign-in"
                  ? "Sign in"
                  : "Sign up"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
