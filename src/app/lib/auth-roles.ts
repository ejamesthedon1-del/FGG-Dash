export type AppRole = "ceo" | "ops";

/** Comma-separated CEO emails in VITE_CEO_EMAILS (case-insensitive). */
export function getCeoEmailAllowlist(): string[] {
  const raw = import.meta.env.VITE_CEO_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Resolve app role from a Supabase user.
 * - Explicit `user_metadata.role` / `app_metadata.role` of `ceo` or `ops` wins
 * - Else email in VITE_CEO_EMAILS → ceo
 * - Else signed-in users default to ops
 */
export function resolveAppRole(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
} | null): AppRole | null {
  if (!user) return null;

  const metaRole = String(
    user.app_metadata?.role ?? user.user_metadata?.role ?? "",
  )
    .trim()
    .toLowerCase();
  if (metaRole === "ceo" || metaRole === "ops") return metaRole;

  const email = (user.email ?? "").trim().toLowerCase();
  if (email && getCeoEmailAllowlist().includes(email)) return "ceo";

  return "ops";
}

export function roleLabel(role: AppRole | null): string {
  if (role === "ceo") return "CEO";
  if (role === "ops") return "Ops / Productions";
  return "Guest";
}
