import { supabase } from "./supabase/client";

/** Per-user My Tasks boards (`fgg.my-tasks.v1:<userId>`). Kept here to avoid a circular import. */
export const MY_TASKS_KEY_PREFIX = "fgg.my-tasks.v1:";

export function myTasksStorageKey(userId: string): string {
  return `${MY_TASKS_KEY_PREFIX}${userId.trim()}`;
}

/** Per-user Due today checklist (`fgg.shift-due-today.v1:<userId>:<YYYY-MM-DD>`). */
export const SHIFT_DUE_TODAY_KEY_PREFIX = "fgg.shift-due-today.v1:";

export function shiftDueTodayStorageKey(userId: string, dateIso: string): string {
  return `${SHIFT_DUE_TODAY_KEY_PREFIX}${userId.trim()}:${dateIso.trim()}`;
}

/** localStorage keys that sync across devices for signed-in users */
export const SYNCED_STORAGE_KEYS = [
  "training-systems",
  "training-sops",
  "operator-dashboard-content-v1",
  "sops-nav-structure-fgg-v1",
  "brand-hub-overrides-v1",
  "brand-hub-custom-brands-v1",
  "brand-hub-profile-ui-v1",
  "brand-hub-product-costs-v1",
  "creative-assets-v1",
  "creative-assets-v2",
  "training-center-module-overrides-v1",
  "training-center-custom-modules-v1",
  "training-center-progress-v1",
  "order-flow-stages-v1",
  "fgg.shop-supplies.v1",
  "fgg.blanks-catalog.v1",
  "fgg.blanks-batch-overrides.v1",
  "fgg.instagram-schedule.v1",
  "fgg.cash-split-targets.v1",
  "fgg.time-clock.v1",
] as const;

export type SyncedStorageKey = (typeof SYNCED_STORAGE_KEYS)[number];

const KEY_SET = new Set<string>(SYNCED_STORAGE_KEYS);

export function isSyncedStorageKey(key: string): boolean {
  return (
    KEY_SET.has(key) ||
    key.startsWith(MY_TASKS_KEY_PREFIX) ||
    key.startsWith(SHIFT_DUE_TODAY_KEY_PREFIX)
  );
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

  const keysToSync = new Set<string>(SYNCED_STORAGE_KEYS);
  const personalTasksKey = myTasksStorageKey(session.user.id);
  keysToSync.add(personalTasksKey);

  const today = new Date();
  const dateIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  keysToSync.add(shiftDueTodayStorageKey(session.user.id, dateIso));

  for (const key of keysToSync) {
    if (remoteMap.has(key)) {
      const remoteStr = remoteValueToString(remoteMap.get(key));
      const local = localStorage.getItem(key);
      // Never let an empty cloud snapshot wipe richer inventory/costs.
      if (
        (key === "fgg.shop-supplies.v1" || key === "brand-hub-product-costs-v1") &&
        local &&
        local.length > remoteStr.length + 50
      ) {
        await pushSyncedStorageValue(key, local);
        continue;
      }
      try {
        localStorage.setItem(key, remoteStr);
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
