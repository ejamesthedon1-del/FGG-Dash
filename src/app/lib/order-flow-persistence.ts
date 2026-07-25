import { writeLocalAndSync } from "@/lib/synced-storage";
import {
  ORDER_FLOW_STAGES,
  updateOrderFlowStatus,
  type OrderFlowOrder,
  type OrderFlowStage,
} from "./order-flow";

export const ORDER_FLOW_STAGES_KEY = "order-flow-stages-v1";

export type PersistedStageRecord = {
  brand: string;
  shopifyOrderId: string;
  orderName?: string;
  stage: OrderFlowStage;
  notes?: string;
  updatedAt: string;
};

type PersistedStore = {
  orders: Record<string, PersistedStageRecord>;
};

function recordKey(brand: string, shopifyOrderId: string): string {
  return `${brand}::${shopifyOrderId}`;
}

function isStage(value: unknown): value is OrderFlowStage {
  return typeof value === "string" && (ORDER_FLOW_STAGES as readonly string[]).includes(value);
}

export function loadPersistedStages(): PersistedStore {
  try {
    const raw = localStorage.getItem(ORDER_FLOW_STAGES_KEY);
    if (!raw) return { orders: {} };
    const parsed = JSON.parse(raw) as Partial<PersistedStore>;
    if (!parsed || typeof parsed !== "object" || !parsed.orders || typeof parsed.orders !== "object") {
      return { orders: {} };
    }
    const orders: Record<string, PersistedStageRecord> = {};
    for (const [key, value] of Object.entries(parsed.orders)) {
      if (!value || typeof value !== "object") continue;
      if (!isStage(value.stage)) continue;
      if (!value.brand || !value.shopifyOrderId || !value.updatedAt) continue;
      orders[key] = {
        brand: String(value.brand),
        shopifyOrderId: String(value.shopifyOrderId),
        orderName: value.orderName ? String(value.orderName) : undefined,
        stage: value.stage,
        notes: value.notes ? String(value.notes) : undefined,
        updatedAt: String(value.updatedAt),
      };
    }
    return { orders };
  } catch {
    return { orders: {} };
  }
}

function savePersistedStages(store: PersistedStore): void {
  writeLocalAndSync(ORDER_FLOW_STAGES_KEY, JSON.stringify(store));
}

/** Cache server/local stage after a successful move. */
export function rememberStages(
  stage: OrderFlowStage,
  orders: Array<{ brand: string; shopifyOrderId: string; orderName?: string }>,
): void {
  const store = loadPersistedStages();
  const now = new Date().toISOString();
  for (const order of orders) {
    const key = recordKey(order.brand, order.shopifyOrderId);
    store.orders[key] = {
      brand: order.brand,
      shopifyOrderId: order.shopifyOrderId,
      orderName: order.orderName,
      stage,
      notes: store.orders[key]?.notes,
      updatedAt: now,
    };
  }
  savePersistedStages(store);
}

/** Keep local cache aligned with whatever the server just returned. */
export function rememberOrdersFromServer(orders: OrderFlowOrder[]): void {
  const store = loadPersistedStages();
  let changed = false;
  for (const order of orders) {
    if (!order.updatedAt) continue;
    const key = recordKey(order.brand, order.id);
    const existing = store.orders[key];
    const existingTs = existing?.updatedAt ? Date.parse(existing.updatedAt) : 0;
    const serverTs = Date.parse(order.updatedAt);
    if (!existing || serverTs >= existingTs) {
      store.orders[key] = {
        brand: order.brand,
        shopifyOrderId: order.id,
        orderName: order.orderNumber,
        stage: order.stage,
        notes: order.notes,
        updatedAt: order.updatedAt,
      };
      changed = true;
    }
  }
  if (changed) savePersistedStages(store);
}

/**
 * If the browser has newer saved stages than Railway (e.g. after a redeploy wipe),
 * push them back to the server so ops do not have to re-stage orders.
 */
export async function restoreStagesToServer(orders: OrderFlowOrder[]): Promise<number> {
  const store = loadPersistedStages();
  const byStage = new Map<OrderFlowStage, PersistedStageRecord[]>();

  for (const order of orders) {
    const key = recordKey(order.brand, order.id);
    const local = store.orders[key];
    if (!local || !isStage(local.stage)) continue;
    if (local.stage === order.stage && order.updatedAt) continue;

    const localTs = Date.parse(local.updatedAt) || 0;
    const serverTs = order.updatedAt ? Date.parse(order.updatedAt) : 0;
    // Restore when server has never saved, or local cache is newer.
    if (order.updatedAt && localTs <= serverTs) continue;
    if (local.stage === "shipped" && order.shopifyFulfillmentStatus?.toUpperCase() === "FULFILLED") {
      continue;
    }

    const list = byStage.get(local.stage) ?? [];
    list.push({
      ...local,
      orderName: local.orderName || order.orderNumber,
    });
    byStage.set(local.stage, list);
  }

  let restored = 0;
  for (const [stage, list] of byStage) {
    await updateOrderFlowStatus(
      stage,
      list.map((item) => ({
        brand: item.brand,
        shopifyOrderId: item.shopifyOrderId,
        orderName: item.orderName,
      })),
    );
    restored += list.length;
  }
  return restored;
}
