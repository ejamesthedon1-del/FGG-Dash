/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  /** JWT anon key (legacy name) or publishable key */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Same as anon key if your dashboard shows “publishable” only */
  readonly VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
