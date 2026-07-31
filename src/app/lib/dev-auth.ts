import type { User } from "@supabase/supabase-js";

/**
 * Local Vite preview only (`import.meta.env.DEV`).
 * Production builds never enable this.
 * Set `VITE_DEV_AUTH_BYPASS=0` in `.env.local` to force the real sign-in page locally.
 */
export function isDevAuthBypassEnabled(): boolean {
  return (
    import.meta.env.DEV === true &&
    import.meta.env.VITE_DEV_AUTH_BYPASS !== "0"
  );
}

/** Fake CEO user for local UI preview without Supabase. */
export function createDevBypassUser(): User {
  const now = new Date().toISOString();
  return {
    id: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "local@fgg.dev",
    email_confirmed_at: now,
    phone: "",
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: { provider: "dev", providers: ["dev"], role: "ceo" },
    user_metadata: { full_name: "Local Dev", first_name: "Local", role: "ceo" },
    identities: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  } as User;
}
