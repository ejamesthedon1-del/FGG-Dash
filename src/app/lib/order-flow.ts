import { apiUrl } from "./api-base";

export const ORDER_FLOW_STAGES = [
  "needs_blanks",
  "blanks_ordered",
  "in_production",
  "ready_to_ship",
  "shipped",
] as const;

export type OrderFlowStage = (typeof ORDER_FLOW_STAGES)[number];

/** Older boards — mapped into the current ops path. */
const STAGE_ALIASES: Record<string, OrderFlowStage> = {
  ready_for_production: "in_production",
};

export function normalizeOrderFlowStage(value: string | null | undefined): OrderFlowStage {
  const raw = (value || "needs_blanks").trim();
  const mapped = STAGE_ALIASES[raw] ?? raw;
  return (ORDER_FLOW_STAGES as readonly string[]).includes(mapped)
    ? (mapped as OrderFlowStage)
    : "needs_blanks";
}

export type DeadlineState = "overdue" | "due_today" | "upcoming" | "ok" | "none";

export type OrderFlowLineItem = {
  id?: string;
  product: string;
  productId?: string;
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
  receipt?: BlanksReceipt;
  suppliesApplied?: boolean | { at?: string; by?: string };
};

export type SuppliesAppliedStamp = {
  at?: string;
  by?: string;
};

export type BlanksReceipt = {
  name: string;
  mimeType: string;
  /** Present when full file is loaded; omitted from list payloads. */
  dataUrl?: string;
  uploadedAt?: string;
  /** True when a file exists server-side but dataUrl was stripped from the list. */
  hasFile?: boolean;
};

export type RiskRecommendation = "NONE" | "ACCEPT" | "INVESTIGATE" | "CANCEL" | string;
export type RiskLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "PENDING" | string;
export type RiskStatus = "approved" | "denied";

export type RiskReviewDecision = {
  status: RiskStatus;
  note?: string;
  decidedBy?: string;
  decidedAt?: string;
  shopifyCancelOk?: boolean;
  shopifyError?: string;
  snapshot?: Record<string, unknown>;
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
  cancelledAt?: string | null;
  notes: string;
  blanksReceipt?: BlanksReceipt | null;
  history: OrderFlowHistoryEntry[];
  shopifyNote?: string;
  tags?: string[];
  total?: { amount: number; currency: string };
  shippingAddress?: Record<string, string>;
  billingAddress?: Record<string, string>;
  updatedAt?: string;
  riskRecommendation?: RiskRecommendation;
  riskLevel?: RiskLevel;
  riskFacts?: string[];
  needsRiskReview?: boolean;
  riskStatus?: RiskStatus | null;
  riskReview?: RiskReviewDecision | null;
  riskPendingHold?: boolean;
  suppliesApplied?: boolean | SuppliesAppliedStamp | null;
};

export type OrderFlowStageCount = {
  id: string;
  label: string;
  count: number;
};

export type OrderFlowRiskQueue = {
  pending: OrderFlowOrder[];
  approved: OrderFlowOrder[];
  denied: OrderFlowOrder[];
  pendingCount: number;
};

export type OrderFlowResponse = {
  generatedAt: string;
  today: string;
  stages: OrderFlowStageCount[];
  orders: OrderFlowOrder[];
  riskQueue?: OrderFlowRiskQueue;
  errors?: Record<string, string>;
};

export const STAGE_LABELS: Record<OrderFlowStage, string> = {
  needs_blanks: "Needs blanks",
  blanks_ordered: "Ordered",
  in_production: "In production",
  ready_to_ship: "Ready to ship",
  shipped: "Shipped",
};

/** Sentence-case ALL CAPS Shopify labels; leave mixed-case text alone. */
export function formatOrderLabel(value: string | null | undefined): string {
  const s = String(value ?? "").trim();
  if (!s || s === "—") return s || "—";
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 2 && letters === letters.toUpperCase()) {
    const lower = s.toLowerCase();
    return lower.replace(/[a-z]/, (c) => c.toUpperCase());
  }
  return s;
}

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
  const stage = normalizeOrderFlowStage(order.stage);
  const open = stage !== "shipped";
  const highPriority = open && (order.highPriority === true || (age != null && age > 7));
  const earlyWarning =
    open &&
    !highPriority &&
    (order.earlyWarning === true || (age != null && age >= 3));
  return {
    ...order,
    stage,
    stageLabel: STAGE_LABELS[stage],
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
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch";
    throw new Error(
      msg === "Failed to fetch"
        ? "Could not reach Orders API (network or payload too large). Try Refresh, or redeploy the backend if this keeps happening."
        : msg,
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Order flow failed (${res.status})`);
  }
  const data = (await res.json()) as OrderFlowResponse;
  const enriched = sortByPriority(
    (data.orders || []).map((o) => withOrderPriority(o, data.today)),
  );
  const riskQueue: OrderFlowRiskQueue = {
    pending: (data.riskQueue?.pending || []).map((o) => withOrderPriority(o, data.today)),
    approved: (data.riskQueue?.approved || []).map((o) => withOrderPriority(o, data.today)),
    denied: (data.riskQueue?.denied || []).map((o) => withOrderPriority(o, data.today)),
    pendingCount: data.riskQueue?.pendingCount ?? data.riskQueue?.pending?.length ?? 0,
  };
  return { ...data, orders: enriched, riskQueue };
}

export async function fetchOrderFlowReceipt(
  brand: string,
  shopifyOrderId: string,
): Promise<BlanksReceipt | null> {
  const qs = new URLSearchParams({ brand, shopifyOrderId });
  const res = await fetch(apiUrl(`/api/order-flow/receipt?${qs}`));
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Receipt fetch failed (${res.status})`);
  }
  const data = (await res.json()) as { blanksReceipt?: BlanksReceipt };
  return data.blanksReceipt ?? null;
}

function riskSnapshot(order: OrderFlowOrder): Record<string, unknown> {
  return {
    orderNumber: order.orderNumber,
    customer: order.customer,
    email: order.email,
    phone: order.phone,
    product: order.product,
    variant: order.variant,
    color: order.color,
    size: order.size,
    quantity: order.quantity,
    lineItems: order.lineItems,
    orderDate: order.orderDate,
    orderDateTime: order.orderDateTime,
    orderAgeDays: order.orderAgeDays,
    shopifyFinancialStatus: order.shopifyFinancialStatus,
    shopifyFulfillmentStatus: order.shopifyFulfillmentStatus,
    cancelledAt: order.cancelledAt,
    tags: order.tags,
    total: order.total,
    shippingAddress: order.shippingAddress,
    billingAddress: order.billingAddress,
    riskRecommendation: order.riskRecommendation,
    riskLevel: order.riskLevel,
    riskFacts: order.riskFacts,
  };
}

async function postRiskDecision(
  path: "/api/order-flow/risk/approve" | "/api/order-flow/risk/deny",
  order: OrderFlowOrder,
  note: string,
): Promise<void> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brand: order.brand,
      shopifyOrderId: order.id,
      orderName: order.orderNumber,
      note,
      actor: "ops",
      snapshot: riskSnapshot(order),
    }),
  });
  if (!res.ok) {
    let detail = `Risk decision failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
}

export async function approveRiskOrder(order: OrderFlowOrder, note = ""): Promise<void> {
  await postRiskDecision("/api/order-flow/risk/approve", order, note);
}

export async function denyRiskOrder(order: OrderFlowOrder, note = ""): Promise<void> {
  await postRiskDecision("/api/order-flow/risk/deny", order, note);
}

export async function updateOrderFlowStatus(
  stage: OrderFlowStage,
  orders: Array<{ brand: string; shopifyOrderId: string; orderName?: string }>,
  options?: { blanksReceipt?: BlanksReceipt },
): Promise<void> {
  const res = await fetch(apiUrl("/api/order-flow/status"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stage,
      orders,
      blanksReceipt: options?.blanksReceipt ?? undefined,
    }),
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

export async function markOrderSuppliesApplied(input: {
  brand: string;
  shopifyOrderId: string;
  orderName?: string;
  actor?: string;
}): Promise<void> {
  const res = await fetch(apiUrl("/api/order-flow/supplies-applied"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let detail = `Could not stamp supplies applied (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
}

export function orderHasSuppliesApplied(order: OrderFlowOrder): boolean {
  const stamp = order.suppliesApplied;
  if (stamp === true) return true;
  if (stamp && typeof stamp === "object" && (stamp.at || stamp.by)) return true;
  const history = order.history || [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (!entry?.suppliesApplied) continue;
    if (entry.suppliesApplied === true) return true;
    if (typeof entry.suppliesApplied === "object") return true;
  }
  return false;
}
