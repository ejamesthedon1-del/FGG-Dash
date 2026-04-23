import { supabase } from "./client";
import { pullAndMergeRemoteStorage } from "../synced-storage";

/**
 * Subscribe to auth events so the client keeps refreshing sessions (SPA equivalent of
 * Next.js middleware + cookie refresh). Call once at app startup.
 * After sign-in, pulls `app_storage` from Supabase into localStorage so data is shared across devices.
 */
export function initSupabaseAuthSync(): () => void {
  if (!supabase) {
    return () => {};
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    if (
      session &&
      (event === "INITIAL_SESSION" || event === "SIGNED_IN")
    ) {
      void pullAndMergeRemoteStorage();
    }
  });

  return () => subscription.unsubscribe();
}
