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
  return res.json();
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
