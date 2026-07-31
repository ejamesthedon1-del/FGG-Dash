import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { resolveAppRole, type AppRole } from "./auth-roles";
import {
  createDevBypassUser,
  isDevAuthBypassEnabled,
} from "./dev-auth";
import {
  clearSessionViewMode,
  readSessionViewMode,
  readViewModePreference,
  writeSessionViewMode,
  writeViewModePreference,
} from "./view-mode-storage";

export type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  /** Effective role for the current view (CEO toggle can make this ops). */
  role: AppRole | null;
  isSignedIn: boolean;
  /** True when the signed-in account is a CEO (regardless of view). */
  accountIsCeo: boolean;
  /** Active UI view — only CEOs can choose; ops accounts stay ops. */
  viewMode: AppRole;
  /** True until a CEO picks CEO vs Ops for this browser session. */
  needsViewPick: boolean;
  setViewMode: (mode: AppRole) => void;
  /** Profit / KPI dashboards — follows selected view. */
  isCeo: boolean;
  /** Signed-in users can manage floor content. */
  canManageContent: boolean;
  /** True when local Vite preview is skipping Supabase sign-in. */
  isDevAuthBypass: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

type SessionSlice = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  accountRole: AppRole | null;
  accountIsCeo: boolean;
  isSignedIn: boolean;
  isDevAuthBypass: boolean;
};

const SESSION_INITIAL: SessionSlice = {
  loading: true,
  session: null,
  user: null,
  accountRole: null,
  accountIsCeo: false,
  isSignedIn: false,
  isDevAuthBypass: false,
};

function fromSession(session: Session | null): Omit<SessionSlice, "loading"> {
  const user = session?.user ?? null;
  const role = resolveAppRole(user);
  const accountRole: AppRole | null = session ? (role ?? "ops") : null;
  return {
    session,
    user,
    accountRole,
    accountIsCeo: accountRole === "ceo",
    isSignedIn: Boolean(session),
    isDevAuthBypass: false,
  };
}

function fromDevBypass(): Omit<SessionSlice, "loading"> {
  const user = createDevBypassUser();
  return {
    session: null,
    user,
    accountRole: "ceo",
    accountIsCeo: true,
    isSignedIn: true,
    isDevAuthBypass: true,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionState, setSessionState] = useState<SessionSlice>(SESSION_INITIAL);
  const [viewMode, setViewModeState] = useState<AppRole>("ops");
  const [needsViewPick, setNeedsViewPick] = useState(false);

  useEffect(() => {
    let mounted = true;

    const applySignedInAccount = (next: Omit<SessionSlice, "loading">) => {
      if (!mounted) return;
      setSessionState({ ...next, loading: false });

      if (!next.isSignedIn || !next.user?.email) {
        setViewModeState("ops");
        setNeedsViewPick(false);
        clearSessionViewMode();
        return;
      }

      if (!next.accountIsCeo) {
        setViewModeState("ops");
        setNeedsViewPick(false);
        return;
      }

      const sessionPick = readSessionViewMode(next.user.email);
      if (sessionPick) {
        setViewModeState(sessionPick);
        setNeedsViewPick(false);
        return;
      }

      const pref = readViewModePreference(next.user.email);
      setViewModeState(pref ?? "ceo");
      setNeedsViewPick(true);
    };

    // Local Vite only — skip Supabase gate so UI can be previewed without push/env.
    if (isDevAuthBypassEnabled()) {
      applySignedInAccount(fromDevBypass());
      return () => {
        mounted = false;
      };
    }

    if (!supabase) {
      setSessionState({ ...SESSION_INITIAL, loading: false });
      return;
    }

    const applySession = (session: Session | null) => {
      applySignedInAccount(fromSession(session));
    };

    supabase.auth.getSession().then(({ data }) => {
      applySession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        clearSessionViewMode();
      }
      applySession(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const setViewMode = useCallback(
    (mode: AppRole) => {
      if (!sessionState.accountIsCeo) return;
      const email = sessionState.user?.email;
      setViewModeState(mode);
      setNeedsViewPick(false);
      if (email) {
        writeViewModePreference(email, mode);
        writeSessionViewMode(email, mode);
      }
    },
    [sessionState.accountIsCeo, sessionState.user?.email],
  );

  const value = useMemo<AuthState>(() => {
    const effectiveRole: AppRole | null = !sessionState.isSignedIn
      ? null
      : sessionState.accountIsCeo
        ? viewMode
        : "ops";

    return {
      loading: sessionState.loading,
      session: sessionState.session,
      user: sessionState.user,
      role: effectiveRole,
      isSignedIn: sessionState.isSignedIn,
      accountIsCeo: sessionState.accountIsCeo,
      viewMode: sessionState.accountIsCeo ? viewMode : "ops",
      needsViewPick: sessionState.accountIsCeo && needsViewPick,
      setViewMode,
      isCeo: sessionState.accountIsCeo && viewMode === "ceo",
      canManageContent: sessionState.isSignedIn,
      isDevAuthBypass: sessionState.isDevAuthBypass,
    };
  }, [sessionState, viewMode, needsViewPick, setViewMode]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
