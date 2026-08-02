import { writeLocalAndSync } from "@/lib/synced-storage";
import type { OrderFlowOrder } from "./order-flow";
import { orderBatchKey } from "./blanks-order-batches";

export const BLANKS_BATCH_OVERRIDES_KEY = "fgg.blanks-batch-overrides.v1";

export type BlanksBatchOverrides = {
  version: 1;
  /** orderKey → earliest batch index (1-based) this Shopify order may enter. */
  minBatchIndex: Record<string, number>;
};

export { orderBatchKey };

export function readBlanksBatchOverrides(): BlanksBatchOverrides {
  try {
    const raw = localStorage.getItem(BLANKS_BATCH_OVERRIDES_KEY);
    if (!raw) return { version: 1, minBatchIndex: {} };
    const parsed = JSON.parse(raw) as BlanksBatchOverrides;
    if (!parsed || parsed.version !== 1 || typeof parsed.minBatchIndex !== "object") {
      return { version: 1, minBatchIndex: {} };
    }
    return { version: 1, minBatchIndex: parsed.minBatchIndex ?? {} };
  } catch {
    return { version: 1, minBatchIndex: {} };
  }
}

export function writeBlanksBatchOverrides(data: BlanksBatchOverrides): void {
  writeLocalAndSync(BLANKS_BATCH_OVERRIDES_KEY, JSON.stringify(data));
}

/** Drop overrides for orders no longer in needs-blanks. */
export function pruneBlanksBatchOverrides(
  liveOrders: Array<Pick<OrderFlowOrder, "brand" | "id">>,
): BlanksBatchOverrides {
  const live = new Set(liveOrders.map(orderBatchKey));
  const current = readBlanksBatchOverrides();
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(current.minBatchIndex)) {
    if (live.has(key) && value > 1) next[key] = value;
  }
  const pruned = { version: 1 as const, minBatchIndex: next };
  writeBlanksBatchOverrides(pruned);
  return pruned;
}

export function setOrderMinBatchIndex(
  order: Pick<OrderFlowOrder, "brand" | "id">,
  minBatchIndex: number,
): BlanksBatchOverrides {
  const current = readBlanksBatchOverrides();
  const key = orderBatchKey(order);
  if (minBatchIndex <= 1) delete current.minBatchIndex[key];
  else current.minBatchIndex[key] = minBatchIndex;
  writeBlanksBatchOverrides(current);
  return current;
}
