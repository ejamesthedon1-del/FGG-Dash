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

/** First name for header greeting — from metadata, full name, or email local-part. */
export function userFirstName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null): string | null {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const direct = [meta.first_name, meta.given_name, meta.firstName]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .find(Boolean);
  if (direct) return titleCaseFirst(direct);

  const full = [meta.full_name, meta.name, meta.display_name]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .find(Boolean);
  if (full) {
    const first = full.split(/\s+/)[0];
    if (first) return titleCaseFirst(first);
  }

  const email = (user.email ?? "").trim();
  if (email.includes("@")) {
    const local = email.split("@")[0] ?? "";
    const token = local.split(/[._+\-]/)[0] ?? "";
    if (token) return titleCaseFirst(token);
  }
  return null;
}

function titleCaseFirst(value: string): string {
  const v = value.trim();
  if (!v) return v;
  return v.charAt(0).toUpperCase() + v.slice(1);
}
