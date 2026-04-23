/**
 * Cloud mirror for selected localStorage keys via Supabase `app_storage`.
 * When signed in, writes sync to Postgres; on sign-in, remote data merges into localStorage
 * so existing modules keep working without a full rewrite.
 */

import { supabase } from "./supabase/client";

/** localStorage keys that sync across devices for signed-in users */
export const SYNCED_STORAGE_KEYS = [
  "training-systems",
  "training-sops",
  "operator-dashboard-content-v1",
  "sops-nav-structure-fgg-v1",
  "brand-hub-overrides-v1",
  "brand-hub-custom-brands-v1",
  "brand-hub-profile-ui-v1",
  "training-center-module-overrides-v1",
  "training-center-custom-modules-v1",
  "training-center-progress-v1",
] as const;

export type SyncedStorageKey = (typeof SYNCED_STORAGE_KEYS)[number];

const KEY_SET = new Set<string>(SYNCED_STORAGE_KEYS);

export function isSyncedStorageKey(key: string): key is SyncedStorageKey {
  return KEY_SET.has(key);
}

function remoteValueToString(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** Write to localStorage and queue a cloud upsert (no-op if not signed in). */
export function writeLocalAndSync(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
  } catch {
    return false;
  }
  if (isSyncedStorageKey(key)) {
    void pushSyncedStorageValue(key, value);
  }
  return true;
}

export async function pushSyncedStorageValue(key: string, valueString: string): Promise<void> {
  if (!supabase || !isSyncedStorageKey(key)) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(valueString);
  } catch {
    parsed = valueString;
  }

  const { error } = await supabase.from("app_storage").upsert(
    {
      key,
      value: parsed as Record<string, unknown> | unknown[] | string | number | boolean | null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) {
    console.error("[synced-storage] push failed", key, error.message);
  }
}

/**
 * Merge remote into this browser:
 * - If a key exists in Supabase → overwrite local (cloud wins).
 * - If missing in Supabase but present locally → upload local (first-device bootstrap).
 */
export async function pullAndMergeRemoteStorage(): Promise<void> {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  const { data: rows, error } = await supabase.from("app_storage").select("key, value");
  if (error) {
    console.error("[synced-storage] pull failed", error.message);
    return;
  }

  const remoteMap = new Map((rows ?? []).map((r) => [r.key as string, r.value as unknown]));

  for (const key of SYNCED_STORAGE_KEYS) {
    if (remoteMap.has(key)) {
      try {
        localStorage.setItem(key, remoteValueToString(remoteMap.get(key)));
      } catch (e) {
        console.error("[synced-storage] local write", key, e);
      }
    } else {
      const local = localStorage.getItem(key);
      if (local) {
        await pushSyncedStorageValue(key, local);
      }
    }
  }

  window.dispatchEvent(new CustomEvent("fgg-storage-sync"));
}
