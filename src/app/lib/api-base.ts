/**
 * API base URL for Shopify/Meta backend.
 * - Local Vite: empty → requests go to `/api/...` and are proxied to :8000
 * - Production (Vercel): set `VITE_API_BASE_URL` to the Railway URL (no trailing slash)
 */
export function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}
