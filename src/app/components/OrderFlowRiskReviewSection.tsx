import { useMemo, useState } from "react";
import {
  approveRiskOrder,
  denyRiskOrder,
  type OrderFlowOrder,
  type OrderFlowRiskQueue,
  type RiskLevel,
  type RiskRecommendation,
} from "../lib/order-flow";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { cn } from "./ui/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MapPin,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

type RiskFilter = "pending" | "approved" | "denied";

const DECISION_GUIDE = [
  "Compare shipping vs billing name/address — mismatch is a caution signal.",
  "New customer + high order value needs extra scrutiny.",
  "Read Shopify risk facts. If Shopify recommends Cancel, default to Deny unless you have a clear legitimate signal.",
  "Suspicious email, phone, or rush shipping to a different country = caution.",
  "When unsure: Deny (safer) or ask the CEO — never fulfill a pending risk order.",
  "Approve only when the customer and payment look legitimate and the facts support it.",
] as const;

function money(order: OrderFlowOrder): string {
  const amount = order.total?.amount ?? 0;
  const currency = order.total?.currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function formatAddress(addr?: Record<string, string> | null): string {
  if (!addr || !Object.keys(addr).length) return "—";
  const line1 = [addr.name, addr.address1, addr.address2].filter(Boolean).join(", ");
  const line2 = [addr.city, addr.provinceCode, addr.zip, addr.countryCodeV2]
    .filter(Boolean)
    .join(", ");
  return [line1, line2].filter(Boolean).join(" · ") || "—";
}

function addressesMismatch(order: OrderFlowOrder): boolean {
  const ship = order.shippingAddress || {};
  const bill = order.billingAddress || {};
  if (!bill.name && !bill.address1) return false;
  const norm = (v?: string) => (v || "").trim().toLowerCase();
  return (
    norm(ship.name) !== norm(bill.name) ||
    norm(ship.address1) !== norm(bill.address1) ||
    norm(ship.city) !== norm(bill.city) ||
    norm(ship.countryCodeV2) !== norm(bill.countryCodeV2)
  );
}

function riskLevelClass(level?: RiskLevel) {
  switch ((level || "").toUpperCase()) {
    case "HIGH":
      return "border-rose-300 bg-rose-50 text-rose-900";
    case "MEDIUM":
      return "border-amber-300 bg-amber-50 text-amber-950";
    case "LOW":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    default:
      return "border-gray-200 bg-gray-50 text-gray-700";
  }
}

function riskRecClass(rec?: RiskRecommendation) {
  switch ((rec || "").toUpperCase()) {
    case "CANCEL":
      return "border-rose-400 bg-rose-100 text-rose-950";
    case "INVESTIGATE":
      return "border-amber-400 bg-amber-100 text-amber-950";
    case "ACCEPT":
      return "border-emerald-300 bg-emerald-50 text-emerald-900";
    default:
      return "border-gray-200 bg-gray-50 text-gray-700";
  }
}

type Props = {
  riskQueue: OrderFlowRiskQueue;
  busy: boolean;
  onChanged: () => Promise<void> | void;
};

export function OrderFlowRiskReviewSection({ riskQueue, busy, onChanged }: Props) {
  const [filter, setFilter] = useState<RiskFilter>("pending");
  const [note, setNote] = useState("");
  const [active, setActive] = useState<OrderFlowOrder | null>(null);
  const [denyTarget, setDenyTarget] = useState<OrderFlowOrder | null>(null);
  const [acting, setActing] = useState(false);

  const list = useMemo(() => {
    if (filter === "approved") return riskQueue.approved;
    if (filter === "denied") return riskQueue.denied;
    return riskQueue.pending;
  }, [filter, riskQueue]);

  const onApprove = async (order: OrderFlowOrder) => {
    setActing(true);
    try {
      await approveRiskOrder(order, note);
      toast.success(`${order.orderNumber} approved — moved into production`);
      setNote("");
      setActive(null);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setActing(false);
    }
  };

  const onDenyConfirm = async () => {
    if (!denyTarget) return;
    setActing(true);
    try {
      await denyRiskOrder(denyTarget, note);
      toast.success(`${denyTarget.orderNumber} denied — cancelled in Shopify`);
      setNote("");
      setDenyTarget(null);
      setActive(null);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deny failed");
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["pending", "Pending", riskQueue.pendingCount],
                ["approved", "Approved", riskQueue.approved.length],
                ["denied", "Denied", riskQueue.denied.length],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  filter === id
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                )}
              >
                {label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px]",
                    filter === id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600",
                  )}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>

          {busy && !list.length ? (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading risk queue…
            </div>
          ) : list.length ? (
            <ul className="space-y-3">
              {list.map((order) => {
                const mismatch = addressesMismatch(order);
                const selected = active?.id === order.id && active.brand === order.brand;
                return (
                  <li key={`${order.brand}::${order.id}`}>
                    <button
                      type="button"
                      onClick={() => setActive(order)}
                      className={cn(
                        "w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition-colors",
                        selected
                          ? "border-blue-400 ring-2 ring-blue-100"
                          : "border-gray-200 hover:border-gray-300",
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-gray-950">{order.orderNumber}</p>
                            <Badge variant="outline" className="text-xs">
                              {order.brandLabel}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn("text-xs", riskLevelClass(order.riskLevel))}
                            >
                              {order.riskLevel || "UNKNOWN"} risk
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn("text-xs", riskRecClass(order.riskRecommendation))}
                            >
                              Shopify: {order.riskRecommendation || "NONE"}
                            </Badge>
                            {mismatch ? (
                              <Badge
                                variant="outline"
                                className="border-amber-300 bg-amber-50 text-xs text-amber-950"
                              >
                                Ship ≠ bill
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-gray-700">
                            {order.customer} · {money(order)}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {order.product}
                            {order.quantity ? ` × ${order.quantity}` : ""}
                            {order.orderDate ? ` · ${order.orderDate}` : ""}
                          </p>
                        </div>
                        {filter === "pending" ? (
                          <div className="flex shrink-0 gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button
                              type="button"
                              size="sm"
                              className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                              disabled={acting}
                              onClick={() => void onApprove(order)}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="tertiary"
                              className="gap-1 text-rose-700 hover:text-rose-800"
                              disabled={acting}
                              onClick={() => {
                                setActive(order);
                                setDenyTarget(order);
                              }}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Deny
                            </Button>
                          </div>
                        ) : (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              filter === "approved"
                                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                : "border-rose-300 bg-rose-50 text-rose-900",
                            )}
                          >
                            {filter === "approved" ? "Approved" : "Denied"}
                          </Badge>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center text-sm text-gray-500">
              {filter === "pending"
                ? "No high-risk orders waiting for review."
                : filter === "approved"
                  ? "No approved risk decisions in this window."
                  : "No denied orders yet."}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-800" />
              <h3 className="text-sm font-semibold text-amber-950">Decision guide</h3>
            </div>
            <ol className="list-decimal space-y-2 pl-4 text-xs leading-relaxed text-amber-950/90">
              {DECISION_GUIDE.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>

          {active ? (
            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-950">{active.orderNumber}</p>
                  <p className="text-xs text-gray-500">{active.brandLabel}</p>
                </div>
                <Badge
                  variant="outline"
                  className={cn("text-xs", riskRecClass(active.riskRecommendation))}
                >
                  {active.riskRecommendation || "NONE"}
                </Badge>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-gray-500">Customer</p>
                  <p className="text-gray-900">{active.customer}</p>
                  <p className="text-xs text-gray-500">
                    {[active.email, active.phone].filter(Boolean).join(" · ") || "No contact"}
                  </p>
                </div>
                <div>
                  <p className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-500">
                    <MapPin className="h-3 w-3" />
                    Shipping
                  </p>
                  <p className="text-xs text-gray-800">{formatAddress(active.shippingAddress)}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500">Billing</p>
                  <p className="text-xs text-gray-800">{formatAddress(active.billingAddress)}</p>
                  {addressesMismatch(active) ? (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-800">
                      <AlertTriangle className="h-3 w-3" />
                      Shipping and billing do not match
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Total</p>
                  <p className="font-medium text-gray-900">{money(active)}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500">Shopify risk facts</p>
                  {active.riskFacts?.length ? (
                    <ul className="list-disc space-y-1 pl-4 text-xs text-gray-700">
                      {active.riskFacts.map((fact) => (
                        <li key={fact}>{fact}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-400">No detailed facts returned.</p>
                  )}
                </div>

                {filter === "pending" ? (
                  <div className="space-y-2 border-t border-gray-100 pt-3">
                    <label className="text-xs font-medium text-gray-600">
                      Decision note (optional)
                    </label>
                    <Textarea
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Why you approved or denied…"
                      className="resize-y text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        className="flex-1 gap-1 bg-emerald-600 hover:bg-emerald-700"
                        disabled={acting}
                        onClick={() => void onApprove(active)}
                      >
                        {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="tertiary"
                        className="flex-1 gap-1 text-rose-700"
                        disabled={acting}
                        onClick={() => setDenyTarget(active)}
                      >
                        Deny
                      </Button>
                    </div>
                  </div>
                ) : active.riskReview ? (
                  <div className="border-t border-gray-100 pt-3 text-xs text-gray-600">
                    <p>
                      {active.riskReview.status === "approved" ? "Approved" : "Denied"} by{" "}
                      {active.riskReview.decidedBy || "ops"}
                      {active.riskReview.decidedAt
                        ? ` · ${new Date(active.riskReview.decidedAt).toLocaleString()}`
                        : ""}
                    </p>
                    {active.riskReview.note ? (
                      <p className="mt-1 whitespace-pre-wrap text-gray-800">
                        {active.riskReview.note}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-xs text-gray-400">
              Select an order to see risk facts and addresses.
            </section>
          )}
        </aside>
      </div>

      <Dialog
        open={!!denyTarget}
        onOpenChange={(open) => {
          if (!open && !acting) setDenyTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Deny & cancel in Shopify?</DialogTitle>
            <DialogDescription>
              This cancels and refunds{" "}
              <span className="font-medium text-gray-800">
                {denyTarget?.orderNumber}
              </span>{" "}
              in Shopify for fraud. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Inventory will be restocked. The customer will not be notified from this cancel
            (notifyCustomer = false). Requires the Shopify app <code>write_orders</code> scope.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="tertiary"
              disabled={acting}
              onClick={() => setDenyTarget(null)}
            >
              Back
            </Button>
            <Button
              type="button"
              className="bg-rose-600 hover:bg-rose-700"
              disabled={acting}
              onClick={() => void onDenyConfirm()}
            >
              {acting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Deny & cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
