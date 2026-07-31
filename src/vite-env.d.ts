/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  /** JWT anon key (legacy name) or publishable key */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Same as anon key if your dashboard shows “publishable” only */
  readonly VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Comma-separated emails that get the CEO role (profit dashboards) */
  readonly VITE_CEO_EMAILS?: string;
  readonly VITE_API_BASE_URL?: string;
  /** Set to "0" to disable local Vite sign-in bypass */
  readonly VITE_DEV_AUTH_BYPASS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
