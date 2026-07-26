import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { resolveAppRole, type AppRole } from "./auth-roles";

export type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  isSignedIn: boolean;
  /** Profit / KPI dashboards */
  isCeo: boolean;
  /** Signed-in ops or ceo (content editing, daily brief management) */
  canManageContent: boolean;
};

const INITIAL: AuthState = {
  loading: true,
  session: null,
  user: null,
  role: null,
  isSignedIn: false,
  isCeo: false,
  canManageContent: false,
};

function fromSession(session: Session | null): Omit<AuthState, "loading"> {
  const user = session?.user ?? null;
  const role = resolveAppRole(user);
  const effectiveRole: AppRole | null = session ? (role ?? "ops") : null;
  return {
    session,
    user,
    role: effectiveRole,
    isSignedIn: Boolean(session),
    isCeo: role === "ceo",
    canManageContent: Boolean(session),
  };
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(INITIAL);

  useEffect(() => {
    if (!supabase) {
      setState({ ...INITIAL, loading: false });
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setState({ ...fromSession(data.session), loading: false });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ ...fromSession(session), loading: false });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
