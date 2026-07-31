const KEY_PREFIX = "fgg.order-flow-seen.v1:";

function storageKey(userKey: string): string {
  return `${KEY_PREFIX}${userKey.trim().toLowerCase()}`;
}

export function orderFlowOrderKey(brand: string, id: string): string {
  return `${brand}::${id}`;
}

/** `null` means never initialized — baseline on next fetch without showing a badge. */
export function loadSeenOrderKeys(userKey: string): Set<string> | null {
  if (!userKey || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userKey));
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as { keys?: unknown };
    if (!Array.isArray(parsed.keys)) return new Set();
    return new Set(
      parsed.keys.filter((k): k is string => typeof k === "string" && k.length > 0),
    );
  } catch {
    return null;
  }
}

export function saveSeenOrderKeys(
  userKey: string,
  keys: Iterable<string>,
): void {
  if (!userKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(userKey),
      JSON.stringify({ keys: [...new Set(keys)], updatedAt: new Date().toISOString() }),
    );
  } catch {
    /* ignore quota */
  }
}
