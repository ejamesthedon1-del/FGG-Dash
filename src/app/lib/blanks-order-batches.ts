import type { OrderFlowOrder } from "./order-flow";

/** All Day Shirts free-shipping threshold — guide for batch size. */
export const ALL_DAY_SHIRTS_FREE_SHIP_MIN_USD = 50;

/** Ops target: this many hoodies per blanks PO (cash + free shipping). */
export const BLANK_BATCH_MIN_QTY = 7;
export const BLANK_BATCH_MAX_QTY = 7;

export function orderBatchKey(order: Pick<OrderFlowOrder, "brand" | "id">): string {
  return `${order.brand}::${order.id}`;
}

export type BlankOrderBatch = {
  id: string;
  index: number;
  /** Oldest-first Shopify orders kept whole (never split across batches). */
  orders: OrderFlowOrder[];
  quantity: number;
  oldestAgeDays: number | null;
  newestAgeDays: number | null;
  orderNumbers: string[];
};

export function blankUnitsForOrder(order: OrderFlowOrder): number {
  if (order.lineItems?.length) {
    return order.lineItems.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  }
  return Number(order.quantity) || 0;
}

function orderAge(order: OrderFlowOrder): number {
  return order.orderAgeDays ?? 0;
}

function sortOldestFirst(orders: OrderFlowOrder[]): OrderFlowOrder[] {
  return [...orders].sort((a, b) => {
    const age = orderAge(b) - orderAge(a);
    if (age) return age;
    const date = (a.orderDateTime || a.orderDate || "").localeCompare(
      b.orderDateTime || b.orderDate || "",
    );
    if (date) return date;
    return a.orderNumber.localeCompare(b.orderNumber);
  });
}

/** Newest first — used when cash is short and ops defers the newest order. */
export function sortNewestFirst(orders: OrderFlowOrder[]): OrderFlowOrder[] {
  return sortOldestFirst(orders).reverse();
}

function toBatch(orders: OrderFlowOrder[], index: number): BlankOrderBatch {
  const ages = orders.map(orderAge);
  const quantity = orders.reduce((sum, o) => sum + blankUnitsForOrder(o), 0);
  return {
    id: `batch-${index}`,
    index,
    orders,
    quantity,
    oldestAgeDays: ages.length ? Math.max(...ages) : null,
    newestAgeDays: ages.length ? Math.min(...ages) : null,
    orderNumbers: orders.map((o) => o.orderNumber),
  };
}

/**
 * Pack needs-blanks Shopify orders into buy batches.
 * - Oldest orders first (cash / SLA priority)
 * - Never splits one customer order across batches
 * - Fills each batch up to maxQty (default 7)
 * - `minBatchIndex` lets ops push an order to a later batch when cash can't cover it yet
 */
export function buildBlankOrderBatches(
  orders: OrderFlowOrder[],
  opts?: {
    maxQty?: number;
    /** orderKey → earliest 1-based batch index allowed */
    minBatchIndex?: Record<string, number>;
  },
): BlankOrderBatch[] {
  const maxQty = opts?.maxQty ?? BLANK_BATCH_MAX_QTY;
  const minBatchIndex = opts?.minBatchIndex ?? {};

  let remaining = sortOldestFirst(orders).filter((o) => blankUnitsForOrder(o) > 0);
  const batches: BlankOrderBatch[] = [];
  let batchIndex = 1;
  let guard = 0;

  while (remaining.length > 0 && guard < 500) {
    guard += 1;
    const batchOrders: OrderFlowOrder[] = [];
    let qty = 0;
    const deferred: OrderFlowOrder[] = [];

    for (const order of remaining) {
      const minIdx = minBatchIndex[orderBatchKey(order)] ?? 1;
      if (minIdx > batchIndex) {
        deferred.push(order);
        continue;
      }

      const units = blankUnitsForOrder(order);
      if (batchOrders.length === 0) {
        batchOrders.push(order);
        qty = units;
        continue;
      }

      if (qty + units <= maxQty) {
        batchOrders.push(order);
        qty += units;
        continue;
      }

      deferred.push(order);
    }

    if (batchOrders.length === 0) {
      // Everyone left is gated for a later batch index.
      if (deferred.length === remaining.length) {
        batchIndex += 1;
        continue;
      }
      break;
    }

    batches.push(toBatch(batchOrders, batches.length + 1));
    remaining = deferred;
    batchIndex += 1;
  }

  return batches;
}

export function newestOrderInBatch(batch: BlankOrderBatch): OrderFlowOrder | null {
  const sorted = sortNewestFirst(batch.orders);
  return sorted[0] ?? null;
}
