import { apiUrl } from "./api-base";

export const ORDER_FLOW_STAGES = [
  "needs_blanks",
  "blanks_ordered",
  "ready_for_production",
  "in_production",
  "ready_to_ship",
  "shipped",
] as const;

export type OrderFlowStage = (typeof ORDER_FLOW_STAGES)[number];

export type DeadlineState = "overdue" | "due_today" | "upcoming" | "ok" | "none";

export type OrderFlowLineItem = {
  id?: string;
  product: string;
  variant: string;
  color: string;
  size: string;
  quantity: number;
  sku?: string;
};

export type OrderFlowHistoryEntry = {
  stage: string;
  at: string;
  by?: string;
  from?: string | null;
};

export type OrderFlowOrder = {
  id: string;
  brand: string;
  brandLabel: string;
  orderNumber: string;
  customer: string;
  email?: string;
  phone?: string;
  product: string;
  variant: string;
  color: string;
  size: string;
  quantity: number;
  lineItems: OrderFlowLineItem[];
  orderDate: string;
  orderDateTime?: string;
  orderAgeDays?: number;
  highPriority?: boolean;
  /** Day 3–7 open orders — approaching the 7-day late/high priority. */
  earlyWarning?: boolean;
  expectedShipDate: string | null;
  deadlineState: DeadlineState;
  stage: OrderFlowStage;
  stageLabel: string;
  shopifyFinancialStatus?: string;
  shopifyFulfillmentStatus?: string;
  notes: string;
  history: OrderFlowHistoryEntry[];
  shopifyNote?: string;
  tags?: string[];
  total?: { amount: number; currency: string };
  shippingAddress?: Record<string, string>;
  updatedAt?: string;
};

export type OrderFlowStageCount = {
  id: string;
  label: string;
  count: number;
};

export type OrderFlowResponse = {
  generatedAt: string;
  today: string;
  stages: OrderFlowStageCount[];
  orders: OrderFlowOrder[];
  errors?: Record<string, string>;
};

export const STAGE_LABELS: Record<OrderFlowStage, string> = {
  needs_blanks: "Needs Blanks",
  blanks_ordered: "Blanks Ordered",
  ready_for_production: "Ready for Production",
  in_production: "In Production",
  ready_to_ship: "Ready to Ship",
  shipped: "Shipped",
};

export function nextStage(stage: OrderFlowStage): OrderFlowStage | null {
  const i = ORDER_FLOW_STAGES.indexOf(stage);
  if (i < 0 || i >= ORDER_FLOW_STAGES.length - 1) return null;
  return ORDER_FLOW_STAGES[i + 1];
}

/** Age-based priority flags (works even if API hasn't deployed yet). */
export function withOrderPriority(order: OrderFlowOrder, todayIso?: string): OrderFlowOrder {
  const today = todayIso || new Date().toISOString().slice(0, 10);
  let age = order.orderAgeDays;
  if (age == null && order.orderDate) {
    const start = Date.parse(`${order.orderDate.slice(0, 10)}T12:00:00`);
    const end = Date.parse(`${today.slice(0, 10)}T12:00:00`);
    age = Number.isFinite(start) && Number.isFinite(end)
      ? Math.max(0, Math.round((end - start) / 86_400_000))
      : 0;
  }
  const open = order.stage !== "shipped";
  const highPriority = open && (order.highPriority === true || (age != null && age > 7));
  const earlyWarning =
    open &&
    !highPriority &&
    (order.earlyWarning === true || (age != null && age >= 3));
  return {
    ...order,
    orderAgeDays: age ?? order.orderAgeDays,
    highPriority,
    earlyWarning,
  };
}

function sortByPriority(orders: OrderFlowOrder[]): OrderFlowOrder[] {
  const deadlineRank: Record<DeadlineState, number> = {
    overdue: 0,
    due_today: 1,
    upcoming: 2,
    ok: 3,
    none: 4,
  };
  return [...orders].sort((a, b) => {
    const aOpen = a.stage !== "shipped" ? 0 : 1;
    const bOpen = b.stage !== "shipped" ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    const aHp = a.highPriority ? 0 : 1;
    const bHp = b.highPriority ? 0 : 1;
    if (aHp !== bHp) return aHp - bHp;
    const aEw = a.earlyWarning ? 0 : 1;
    const bEw = b.earlyWarning ? 0 : 1;
    if (aEw !== bEw) return aEw - bEw;
    const aDl = deadlineRank[a.deadlineState] ?? 9;
    const bDl = deadlineRank[b.deadlineState] ?? 9;
    if (aDl !== bDl) return aDl - bDl;
    const aShip = a.expectedShipDate || "9999-99-99";
    const bShip = b.expectedShipDate || "9999-99-99";
    if (aShip !== bShip) return aShip < bShip ? -1 : 1;
    return (a.orderDateTime || a.orderDate || "").localeCompare(b.orderDateTime || b.orderDate || "");
  });
}

export async function fetchOrderFlow(params?: {
  brand?: string;
  stage?: string;
  days?: number;
}): Promise<OrderFlowResponse> {
  const qs = new URLSearchParams();
  if (params?.brand) qs.set("brand", params.brand);
  if (params?.stage) qs.set("stage", params.stage);
  if (params?.days) qs.set("days", String(params.days));
  const url = apiUrl(`/api/order-flow${qs.toString() ? `?${qs}` : ""}`);
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Order flow failed (${res.status})`);
  }
  const data = (await res.json()) as OrderFlowResponse;
  const enriched = sortByPriority(
    (data.orders || []).map((o) => withOrderPriority(o, data.today)),
  );
  return { ...data, orders: enriched };
}

export async function updateOrderFlowStatus(
  stage: OrderFlowStage,
  orders: Array<{ brand: string; shopifyOrderId: string; orderName?: string }>,
): Promise<void> {
  const res = await fetch(apiUrl("/api/order-flow/status"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage, orders }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Status update failed (${res.status})`);
  }
}

export async function updateOrderFlowNotes(input: {
  brand: string;
  shopifyOrderId: string;
  notes: string;
}): Promise<void> {
  const res = await fetch(apiUrl("/api/order-flow/notes"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Notes update failed (${res.status})`);
  }
}
