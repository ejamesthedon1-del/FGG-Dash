import type { AppRole } from "./auth-roles";

const PREF_PREFIX = "fgg.viewMode.pref:";
const SESSION_KEY = "fgg.viewMode.session";

function prefKey(email: string): string {
  return `${PREF_PREFIX}${email.trim().toLowerCase()}`;
}

export function readViewModePreference(email: string | null | undefined): AppRole | null {
  if (!email || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(prefKey(email));
    if (raw === "ceo" || raw === "ops") return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeViewModePreference(email: string, mode: AppRole): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(prefKey(email), mode);
  } catch {
    /* ignore */
  }
}

export function readSessionViewMode(email: string | null | undefined): AppRole | null {
  if (!email || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: string; mode?: string };
    if (
      (parsed.email || "").trim().toLowerCase() === email.trim().toLowerCase() &&
      (parsed.mode === "ceo" || parsed.mode === "ops")
    ) {
      return parsed.mode;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function writeSessionViewMode(email: string, mode: AppRole): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ email: email.trim().toLowerCase(), mode }),
    );
  } catch {
    /* ignore */
  }
}

export function clearSessionViewMode(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
