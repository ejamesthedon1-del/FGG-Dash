import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  fetchOrderFlow,
  nextStage,
  normalizeOrderFlowStage,
  ORDER_FLOW_STAGES,
  STAGE_LABELS,
  updateOrderFlowNotes,
  updateOrderFlowStatus,
  type OrderFlowOrder,
  type OrderFlowStage,
  type OrderFlowStageCount,
} from "../lib/order-flow";
import {
  rememberOrdersFromServer,
  rememberStages,
  restoreStagesToServer,
} from "../lib/order-flow-persistence";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { cn } from "./ui/utils";
import { buildBlanksPrintHtml, printBlanksSlip } from "../lib/blanks-print-slip";
import { Loader2, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type BrandFilter = "all" | "live-don" | "sinners-testimony";
type StageFilter = OrderFlowStage;

function deadlineClass(state: OrderFlowOrder["deadlineState"]) {
  switch (state) {
    case "overdue":
      return "text-rose-700 font-semibold";
    case "due_today":
      return "text-amber-800 font-semibold";
    case "upcoming":
      return "text-orange-700 font-medium";
    default:
      return "text-gray-700";
  }
}

function agePriorityBadge(order: OrderFlowOrder) {
  if (order.stage === "shipped") return null;
  if (order.highPriority) {
    return (
      <Badge variant="outline" className="w-fit border-rose-400 bg-rose-100 text-rose-900 font-semibold">
        High priority · {order.orderAgeDays ?? 7}+ days
      </Badge>
    );
  }
  if (order.earlyWarning) {
    const daysLeft = Math.max(0, 7 - (order.orderAgeDays ?? 3));
    return (
      <Badge variant="outline" className="w-fit border-amber-400 bg-amber-50 text-amber-950 font-semibold">
        Early warning · {daysLeft}d to late
      </Badge>
    );
  }
  return null;
}

function deadlineBadge(order: OrderFlowOrder) {
  if (order.stage === "shipped") return null;
  if (order.highPriority || order.earlyWarning) return agePriorityBadge(order);
  if (!order.expectedShipDate) return null;
  if (order.deadlineState === "overdue") {
    return (
      <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-800">
        Overdue
      </Badge>
    );
  }
  if (order.deadlineState === "due_today") {
    return (
      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
        Due today
      </Badge>
    );
  }
  if (order.deadlineState === "upcoming") {
    return (
      <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-800">
        Ships soon
      </Badge>
    );
  }
  return null;
}

function stageSelectOptions(current: OrderFlowStage) {
  return ORDER_FLOW_STAGES.map((s) => ({
    id: s,
    label: STAGE_LABELS[s],
    disabled: false,
    current: s === current,
  }));
}

export function OrderFlowPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const stageFromUrl = searchParams.get("stage");
  const initialStage: StageFilter = stageFromUrl
    ? normalizeOrderFlowStage(stageFromUrl)
    : "needs_blanks";

  const [brand, setBrand] = useState<BrandFilter>("all");
  const [stage, setStage] = useState<StageFilter>(initialStage);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stages, setStages] = useState<OrderFlowStageCount[]>([]);
  const [orders, setOrders] = useState<OrderFlowOrder[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<OrderFlowOrder | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [blanksSlipOpen, setBlanksSlipOpen] = useState(false);
  const [blanksSlipHtml, setBlanksSlipHtml] = useState("");

  const load = useCallback(async (opts?: { preserveSelection?: boolean }) => {
    setLoading(true);
    try {
      // Always fetch all stages for accurate counts; filter client-side by stage tab.
      let data = await fetchOrderFlow({ brand, stage: "all", days: 90 });
      rememberOrdersFromServer(data.orders);

      // Restore is best-effort — never block the board if backup sync fails.
      try {
        const restored = await restoreStagesToServer(data.orders);
        if (restored > 0) {
          data = await fetchOrderFlow({ brand, stage: "all", days: 90 });
          rememberOrdersFromServer(data.orders);
          toast.success(`Restored ${restored} saved order stage${restored === 1 ? "" : "s"}`);
        }
      } catch (restoreErr) {
        console.warn("[order-flow] restore skipped", restoreErr);
      }

      setStages(data.stages);
      setOrders(data.orders);
      setErrors(data.errors || {});
      if (!opts?.preserveSelection) {
        // Drop selections for orders that are no longer in the loaded set.
        setSelected((prev) => {
          const valid = new Set(data.orders.map((o) => `${o.brand}::${o.id}`));
          const next: Record<string, boolean> = {};
          for (const [key, on] of Object.entries(prev)) {
            if (on && valid.has(key)) next[key] = true;
          }
          return next;
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load orders");
    } finally {
      setLoading(false);
    }
  }, [brand]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (stageFromUrl) setStage(normalizeOrderFlowStage(stageFromUrl));
    else setStage("needs_blanks");
  }, [stageFromUrl]);

  const setStageAndUrl = (next: StageFilter) => {
    setStage(next);
    const params = new URLSearchParams(searchParams);
    params.set("stage", next);
    setSearchParams(params, { replace: true });
  };

  const visibleOrders = useMemo(() => {
    return orders.filter((o) => o.stage === stage);
  }, [orders, stage]);

  // Keep multi-select across stage tabs so ops can move batches without re-checking.
  const selectedOrders = useMemo(
    () => orders.filter((o) => selected[`${o.brand}::${o.id}`]),
    [orders, selected],
  );

  const bulkNextActions = useMemo(() => {
    const byStage = new Map<OrderFlowStage, OrderFlowOrder[]>();
    for (const order of selectedOrders) {
      const list = byStage.get(order.stage) ?? [];
      list.push(order);
      byStage.set(order.stage, list);
    }
    const actions: Array<{ stage: OrderFlowStage; next: OrderFlowStage; orders: OrderFlowOrder[] }> =
      [];
    for (const [current, list] of byStage) {
      const nxt = nextStage(current);
      if (nxt) actions.push({ stage: current, next: nxt, orders: list });
    }
    return actions;
  }, [selectedOrders]);

  const toggleSelect = (order: OrderFlowOrder, checked: boolean) => {
    const key = `${order.brand}::${order.id}`;
    setSelected((prev) => ({ ...prev, [key]: checked }));
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    const next = { ...selected };
    for (const o of visibleOrders) {
      next[`${o.brand}::${o.id}`] = checked;
    }
    setSelected(next);
  };

  const applyStage = async (target: OrderFlowStage, list: OrderFlowOrder[]) => {
    if (list.length === 0) return;
    setSaving(true);
    try {
      const payload = list.map((o) => ({
        brand: o.brand,
        shopifyOrderId: o.id,
        orderName: o.orderNumber,
      }));
      await updateOrderFlowStatus(target, payload);
      rememberStages(target, payload);

      const keepSelected: Record<string, boolean> = {};
      for (const o of list) keepSelected[`${o.brand}::${o.id}`] = true;
      setSelected(keepSelected);
      setStageAndUrl(target);

      toast.success(
        list.length === 1
          ? `${list[0].orderNumber} → ${STAGE_LABELS[target]}`
          : `${list.length} orders → ${STAGE_LABELS[target]}`,
      );
      await load({ preserveSelection: true });
      if (detail && list.some((o) => o.id === detail.id && o.brand === detail.brand)) {
        setDetail((d) => (d ? { ...d, stage: target, stageLabel: STAGE_LABELS[target] } : d));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update status");
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (order: OrderFlowOrder) => {
    setDetail(order);
    setNotesDraft(order.notes || "");
  };

  const saveNotes = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await updateOrderFlowNotes({
        brand: detail.brand,
        shopifyOrderId: detail.id,
        notes: notesDraft,
      });
      rememberStages(detail.stage, [
        { brand: detail.brand, shopifyOrderId: detail.id, orderName: detail.orderNumber },
      ]);
      toast.success("Notes saved");
      await load({ preserveSelection: true });
      setDetail((d) => (d ? { ...d, notes: notesDraft } : d));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save notes");
    } finally {
      setSaving(false);
    }
  };

  const allVisibleSelected =
    visibleOrders.length > 0 && visibleOrders.every((o) => selected[`${o.brand}::${o.id}`]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
            Ops / Productions
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-gray-900">Order Flow</h2>
          <p className="mt-1 text-gray-600">
            Track orders through blanks, production, and ship.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={brand} onValueChange={(v) => setBrand(v as BrandFilter)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              <SelectItem value="live-don">LIVDON</SelectItem>
              <SelectItem value="sinners-testimony">Sinners Testimony</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(stages.length
          ? stages.filter((s) => s.id !== "all")
          : ORDER_FLOW_STAGES.map((id) => ({
              id,
              label: STAGE_LABELS[id],
              count: 0,
            }))
        ).map((s) => {
          const active = stage === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStageAndUrl(s.id as StageFilter)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left transition-colors",
                active
                  ? "border-blue-300 bg-blue-50 shadow-sm"
                  : "border-gray-200 bg-white hover:bg-gray-50",
              )}
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                {s.label}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{s.count}</p>
            </button>
          );
        })}
      </div>

      {Object.keys(errors).length > 0 ? (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="py-3 text-sm text-amber-900">
            {Object.entries(errors).map(([b, msg]) => (
              <p key={b}>
                <span className="font-medium">{b}:</span> {msg}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
        <p className="mr-auto text-sm text-gray-600">
          {selectedOrders.length > 0
            ? `${selectedOrders.length} order(s) selected · stays selected across stages`
            : "Select orders to print a blanks slip or move them to the next stage."}
        </p>
        <Button
          type="button"
          size="sm"
          variant={selectedOrders.length > 0 ? "default" : "outline"}
          className="gap-2"
          disabled={selectedOrders.length === 0}
          onClick={() => {
            try {
              const html = buildBlanksPrintHtml(selectedOrders);
              setBlanksSlipHtml(html);
              setBlanksSlipOpen(true);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not open blanks slip");
            }
          }}
        >
          <Printer className="h-4 w-4" />
          Print blanks needed
        </Button>
        {bulkNextActions.length > 0 ? (
          bulkNextActions.map((action) => (
            <Button
              key={`${action.stage}-${action.next}`}
              type="button"
              size="sm"
              disabled={saving}
              onClick={() => void applyStage(action.next, action.orders)}
            >
              Move {action.orders.length} → {STAGE_LABELS[action.next]}
            </Button>
          ))
        ) : (
          <Button type="button" size="sm" disabled>
            Move to next stage
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {STAGE_LABELS[stage]}
            </CardTitle>
            <p className="text-sm text-gray-500">
              {loading ? "Loading…" : `${visibleOrders.length} order(s)`}
            </p>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading Shopify orders…
            </div>
          ) : visibleOrders.length === 0 ? (
            <p className="py-8 text-sm text-gray-500">No orders in this stage.</p>
          ) : (
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-2 font-medium">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={(v) => toggleSelectAllVisible(Boolean(v))}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-2 py-2 font-medium">Brand</th>
                  <th className="px-2 py-2 font-medium">Order</th>
                  <th className="px-2 py-2 font-medium">Customer</th>
                  <th className="px-2 py-2 font-medium">Product</th>
                  <th className="px-2 py-2 font-medium">Color</th>
                  <th className="px-2 py-2 font-medium">Size</th>
                  <th className="px-2 py-2 font-medium">Qty</th>
                  <th className="px-2 py-2 font-medium">Ordered</th>
                  <th className="px-2 py-2 font-medium">Ship by</th>
                  <th className="px-2 py-2 font-medium">Stage</th>
                  <th className="px-2 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => {
                  const key = `${order.brand}::${order.id}`;
                  const nxt = nextStage(order.stage);
                  return (
                    <tr
                      key={key}
                      className="border-b border-gray-100 hover:bg-gray-50/80"
                    >
                      <td className="px-2 py-2.5">
                        <Checkbox
                          checked={Boolean(selected[key])}
                          onCheckedChange={(v) => toggleSelect(order, Boolean(v))}
                          aria-label={`Select ${order.orderNumber}`}
                        />
                      </td>
                      <td className="px-2 py-2.5 text-gray-800">{order.brandLabel}</td>
                      <td className="px-2 py-2.5">
                        <button
                          type="button"
                          className="font-medium text-blue-700 hover:underline"
                          onClick={() => openDetail(order)}
                        >
                          {order.orderNumber}
                        </button>
                      </td>
                      <td className="px-2 py-2.5 text-gray-800">{order.customer}</td>
                      <td className="max-w-[180px] truncate px-2 py-2.5 text-gray-800" title={order.product}>
                        {order.product}
                      </td>
                      <td className="px-2 py-2.5 text-gray-700">{order.color}</td>
                      <td className="px-2 py-2.5 text-gray-700">{order.size}</td>
                      <td className="px-2 py-2.5 tabular-nums text-gray-800">{order.quantity}</td>
                      <td
                        className={cn(
                          "px-2 py-2.5 tabular-nums",
                          order.highPriority
                            ? "bg-rose-50 font-semibold text-rose-800"
                            : order.earlyWarning
                              ? "bg-amber-50 font-semibold text-amber-900"
                              : "text-gray-700",
                        )}
                      >
                        <div className="flex flex-col gap-1">
                          <span>{order.orderDate}</span>
                          {agePriorityBadge(order)}
                        </div>
                      </td>
                      <td className={cn("px-2 py-2.5 tabular-nums", deadlineClass(order.deadlineState))}>
                        <div className="flex flex-col gap-1">
                          <span>{order.expectedShipDate || "—"}</span>
                          {!order.highPriority && !order.earlyWarning ? deadlineBadge(order) : null}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <Select
                          value={order.stage}
                          disabled={saving}
                          onValueChange={(v) => void applyStage(v as OrderFlowStage, [order])}
                        >
                          <SelectTrigger className="h-8 w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {stageSelectOptions(order.stage).map((opt) => (
                              <SelectItem key={opt.id} value={opt.id}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => openDetail(order)}
                          >
                            Details
                          </Button>
                          {nxt ? (
                            <Button
                              type="button"
                              size="sm"
                              className="h-8"
                              disabled={saving}
                              onClick={() => void applyStage(nxt, [order])}
                            >
                              → {STAGE_LABELS[nxt]}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={blanksSlipOpen} onOpenChange={setBlanksSlipOpen}>
        <DialogContent className="flex h-[90vh] max-w-4xl flex-col gap-3 overflow-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Blanks order slip</DialogTitle>
            <DialogDescription>
              Review the color/size breakdown, then print or save as PDF.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-gray-200 bg-white">
            {blanksSlipHtml ? (
              <iframe
                title="Blanks order slip preview"
                srcDoc={blanksSlipHtml}
                className="h-full w-full border-0 bg-white"
              />
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <p className="text-xs text-gray-500">
              Tip: in the print dialog, choose “Save as PDF” if you do not need paper.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="tertiary" onClick={() => setBlanksSlipOpen(false)}>
                Close
              </Button>
              <Button
                type="button"
                className="gap-2"
                onClick={() => {
                  try {
                    printBlanksSlip(selectedOrders);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not print");
                  }
                }}
              >
                <Printer className="h-4 w-4" />
                Print / Save PDF
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {detail ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  {detail.orderNumber} · {detail.brandLabel}
                </SheetTitle>
                <SheetDescription>
                  Shopify order details with FGG production status.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5 px-1">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Customer</p>
                    <p className="mt-1 text-gray-900">{detail.customer}</p>
                    {detail.email ? <p className="text-gray-600">{detail.email}</p> : null}
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">FGG stage</p>
                    <p className="mt-1 font-medium text-gray-900">{detail.stageLabel}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Order date</p>
                    <p
                      className={cn(
                        "mt-1",
                        detail.highPriority
                          ? "font-semibold text-rose-800"
                          : detail.earlyWarning
                            ? "font-semibold text-amber-900"
                            : "text-gray-900",
                      )}
                    >
                      {detail.orderDate}
                      {detail.orderAgeDays != null && (detail.highPriority || detail.earlyWarning)
                        ? ` · ${detail.orderAgeDays} days ago`
                        : ""}
                    </p>
                    {agePriorityBadge(detail)}
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Expected ship</p>
                    <p className={cn("mt-1", deadlineClass(detail.deadlineState))}>
                      {detail.expectedShipDate || "—"}
                    </p>
                    {!detail.highPriority && !detail.earlyWarning ? deadlineBadge(detail) : null}
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Shopify financial</p>
                    <p className="mt-1 text-gray-900">{detail.shopifyFinancialStatus || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Shopify fulfillment</p>
                    <p className="mt-1 text-gray-900">{detail.shopifyFulfillmentStatus || "—"}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Products</p>
                  <ul className="mt-2 space-y-2">
                    {(detail.lineItems?.length ? detail.lineItems : [
                      {
                        product: detail.product,
                        color: detail.color,
                        size: detail.size,
                        quantity: detail.quantity,
                        variant: detail.variant,
                      },
                    ]).map((item, idx) => (
                      <li
                        key={`${item.product}-${idx}`}
                        className="rounded-lg border border-gray-100 px-3 py-2 text-sm"
                      >
                        <p className="font-medium text-gray-900">{item.product}</p>
                        <p className="text-gray-600">
                          {item.color} · {item.size} · qty {item.quantity}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Move stage
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ORDER_FLOW_STAGES.map((s) => (
                      <Button
                        key={s}
                        type="button"
                        size="sm"
                        variant={detail.stage === s ? "default" : "outline"}
                        disabled={saving || detail.stage === s}
                        onClick={() => void applyStage(s, [detail])}
                      >
                        {STAGE_LABELS[s]}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Internal notes
                  </p>
                  <Textarea
                    rows={4}
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="Blank vendor, PO #, production notes…"
                  />
                  <Button
                    type="button"
                    className="mt-2"
                    size="sm"
                    disabled={saving}
                    onClick={() => void saveNotes()}
                  >
                    Save notes
                  </Button>
                </div>

                {detail.shopifyNote ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Shopify note
                    </p>
                    <p className="mt-1 text-sm text-gray-700">{detail.shopifyNote}</p>
                  </div>
                ) : null}

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Status history
                  </p>
                  {detail.history?.length ? (
                    <ul className="space-y-1.5 text-sm text-gray-700">
                      {[...detail.history].reverse().map((h, i) => (
                        <li key={`${h.at}-${i}`} className="rounded-md border border-gray-100 px-2 py-1.5">
                          <span className="font-medium">
                            {STAGE_LABELS[normalizeOrderFlowStage(h.stage)] || h.stage}
                          </span>
                          <span className="text-gray-500">
                            {" "}
                            · {new Date(h.at).toLocaleString()} · {h.by || "ops"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">No stage changes recorded yet.</p>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
