import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
/** Legacy JWT anon key or newer publishable key from Project Settings → API */
const publicKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (import.meta.env.DEV && (!url || !publicKey)) {
  console.warn(
    "[Supabase] Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY) in .env.local."
  );
}

/**
 * Browser Supabase client. Sessions persist in localStorage; tokens refresh automatically.
 * See `initSupabaseAuthSync` in App for the auth subscription (keeps refresh behavior active).
 */
export const supabase: SupabaseClient | null =
  url && publicKey
    ? createClient(url, publicKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}
