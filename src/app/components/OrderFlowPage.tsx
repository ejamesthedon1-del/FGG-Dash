import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  fetchOrderFlow,
  fetchOrderFlowReceipt,
  markOrderSuppliesApplied,
  nextStage,
  normalizeOrderFlowStage,
  ORDER_FLOW_STAGES,
  orderHasSuppliesApplied,
  STAGE_LABELS,
  formatOrderLabel,
  updateOrderFlowNotes,
  updateOrderFlowStatus,
  type BlanksReceipt,
  type OrderFlowOrder,
  type OrderFlowRiskQueue,
  type OrderFlowStage,
  type OrderFlowStageCount,
} from "../lib/order-flow";
import {
  adjustMaterialQty,
  applySuppliesForOrder,
  computeMaterialNeeds,
  resolveSupplyBrand,
  type MaterialNeedLine,
} from "../lib/shop-supplies-storage";
import {
  rememberOrdersFromServer,
  rememberStages,
  restoreStagesToServer,
} from "../lib/order-flow-persistence";
import {
  FileTooLargeError,
  readFileAsPersistedDataUrl,
} from "../lib/file-data-url";
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
import { Tabs, TabsContent } from "./ui/tabs";
import { cn } from "./ui/utils";
import { FloatingPillNav } from "./FloatingPillNav";
import { OrderFlowRiskReviewSection } from "./OrderFlowRiskReviewSection";
import { OrderFlowDataTable } from "./OrderFlowDataTable";
import {
  buildBlanksPrintHtml,
  printBlanksSlipHtml,
} from "../lib/blanks-print-slip";
import {
  Boxes,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Loader2,
  Package,
  Printer,
  Shirt,
  Tag,
  Truck,
  Upload,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

type BrandFilter = "all" | "live-don" | "sinners-testimony";
type StageFilter = OrderFlowStage;

const BRAND_OPTIONS: { value: BrandFilter; label: string }[] = [
  { value: "all", label: "All brands" },
  { value: "live-don", label: "Livdon" },
  { value: "sinners-testimony", label: "Sinners Testimony" },
];

/** Shared outline control — brand select + Refresh match exactly. */
const TOOLBAR_CONTROL =
  "h-7 gap-1.5 rounded-md border border-border bg-background px-2.5 text-[length:var(--text-utility)] font-normal leading-[var(--leading-utility)] tracking-[var(--tracking-utility)] shadow-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";


const EMPTY_RISK_QUEUE: OrderFlowRiskQueue = {
  pending: [],
  approved: [],
  denied: [],
  pendingCount: 0,
};

function deadlineClass(state: OrderFlowOrder["deadlineState"]) {
  // Date text stays neutral; urgency color lives on the indicator only.
  switch (state) {
    case "overdue":
    case "due_today":
    case "upcoming":
      return "text-gray-900";
    default:
      return "text-gray-700";
  }
}

function DeadlineIndicator({
  state,
}: {
  state: OrderFlowOrder["deadlineState"];
}) {
  if (state === "ok" || state === "none") return null;
  return (
    <span
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full bg-amber-500",
        state === "upcoming" && "bg-amber-400",
      )}
      aria-hidden
    />
  );
}

function agePriorityBadge(order: OrderFlowOrder) {
  if (order.stage === "shipped") return null;
  if (order.highPriority) {
    return (
      <Badge
        variant="outline"
        className="w-fit border-amber-200 bg-amber-50 font-semibold text-amber-900"
      >
        High priority · {order.orderAgeDays ?? 7}+ days
      </Badge>
    );
  }
  if (order.earlyWarning) {
    const daysLeft = Math.max(0, 7 - (order.orderAgeDays ?? 3));
    return (
      <Badge
        variant="outline"
        className="w-fit border-amber-200 bg-amber-50 font-semibold text-amber-900"
      >
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
      <Badge
        variant="outline"
        className="border-amber-200 bg-amber-50 text-amber-900"
      >
        Overdue
      </Badge>
    );
  }
  if (order.deadlineState === "due_today") {
    return (
      <Badge
        variant="outline"
        className="border-amber-200 bg-amber-50 text-amber-900"
      >
        Due today
      </Badge>
    );
  }
  if (order.deadlineState === "upcoming") {
    return (
      <Badge
        variant="outline"
        className="border-amber-200 bg-amber-50 text-amber-900"
      >
        Ships soon
      </Badge>
    );
  }
  return null;
}

function stageBadgeClass(stage: OrderFlowStage) {
  switch (stage) {
    case "shipped":
      return "border-transparent bg-emerald-50 text-emerald-800";
    case "needs_blanks":
    case "blanks_ordered":
    case "in_production":
    case "ready_to_ship":
    default:
      return "border-transparent bg-gray-200/90 text-gray-900";
  }
}

function DetailMetaRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1.25rem_6.5rem_1fr] items-start gap-3 text-sm">
      <Icon className="mt-0.5 h-4 w-4 text-gray-400" aria-hidden />
      <span className="pt-0.5 text-gray-500">{label}</span>
      <div className="min-w-0 text-gray-900">{children}</div>
    </div>
  );
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
  const [riskQueue, setRiskQueue] = useState<OrderFlowRiskQueue>(EMPTY_RISK_QUEUE);
  const [boardTab, setBoardTab] = useState<"production" | "risk">("production");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<OrderFlowOrder | null>(null);
  const [detailTab, setDetailTab] = useState<"overview" | "activity" | "notes">("overview");
  const [notesDraft, setNotesDraft] = useState("");
  const [blanksSlipOpen, setBlanksSlipOpen] = useState(false);
  const [blanksSlipHtml, setBlanksSlipHtml] = useState("");
  const [blanksOrderedConfirm, setBlanksOrderedConfirm] = useState<{
    orders: OrderFlowOrder[];
  } | null>(null);
  const [blanksOrderedAck, setBlanksOrderedAck] = useState(false);
  const [blanksReceiptFile, setBlanksReceiptFile] = useState<File | null>(null);
  const [blanksReceiptBusy, setBlanksReceiptBusy] = useState(false);
  const [suppliesBusy, setSuppliesBusy] = useState(false);

  useEffect(() => {
    const showProduction = () => setBoardTab("production");
    window.addEventListener("fgg-spotlight-orders", showProduction);
    return () => window.removeEventListener("fgg-spotlight-orders", showProduction);
  }, []);

  const load = useCallback(async (opts?: {
    preserveSelection?: boolean;
    forceRefresh?: boolean;
    /** Refresh in place without unmounting the table (post-mutation sync). */
    silent?: boolean;
  }) => {
    if (!opts?.silent) setLoading(true);
    try {
      // Always fetch all stages for accurate counts; filter client-side by stage tab.
      let data = await fetchOrderFlow({
        brand,
        stage: "all",
        days: 90,
        forceRefresh: opts?.forceRefresh,
      });
      rememberOrdersFromServer(data.orders);

      // Restore is best-effort — never block the board if backup sync fails.
      try {
        const restored = await restoreStagesToServer(data.orders);
        if (restored > 0) {
          data = await fetchOrderFlow({
            brand,
            stage: "all",
            days: 90,
            forceRefresh: true,
          });
          rememberOrdersFromServer(data.orders);
          toast.success(`Restored ${restored} saved order stage${restored === 1 ? "" : "s"}`);
        }
      } catch (restoreErr) {
        console.warn("[order-flow] restore skipped", restoreErr);
      }

      setStages(data.stages);
      setOrders(data.orders);
      setRiskQueue(data.riskQueue || EMPTY_RISK_QUEUE);
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
      if (!opts?.silent) setLoading(false);
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

  const applyStage = async (
    target: OrderFlowStage,
    list: OrderFlowOrder[],
    options?: { blanksReceipt?: BlanksReceipt },
  ) => {
    if (list.length === 0) return;
    setSaving(true);
    try {
      const payload = list.map((o) => ({
        brand: o.brand,
        shopifyOrderId: o.id,
        orderName: o.orderNumber,
      }));
      await updateOrderFlowStatus(target, payload, {
        blanksReceipt: options?.blanksReceipt,
      });
      rememberStages(target, payload);

      // Patch local state before switching tabs so the Ordered view isn't empty
      // while a full reload would otherwise unmount the table.
      const movedKeys = new Set(list.map((o) => `${o.brand}::${o.id}`));
      const countDelta = new Map<string, number>();
      for (const o of list) {
        if (o.stage === target) continue;
        countDelta.set(o.stage, (countDelta.get(o.stage) ?? 0) - 1);
        countDelta.set(target, (countDelta.get(target) ?? 0) + 1);
      }

      setOrders((prev) =>
        prev.map((o) =>
          movedKeys.has(`${o.brand}::${o.id}`)
            ? {
                ...o,
                stage: target,
                stageLabel: STAGE_LABELS[target],
                blanksReceipt: options?.blanksReceipt ?? o.blanksReceipt,
              }
            : o,
        ),
      );
      if (countDelta.size > 0) {
        setStages((prev) =>
          prev.map((s) => {
            const delta = countDelta.get(s.id);
            if (!delta) return s;
            return { ...s, count: Math.max(0, s.count + delta) };
          }),
        );
      }

      const keepSelected: Record<string, boolean> = {};
      for (const o of list) keepSelected[`${o.brand}::${o.id}`] = true;
      setSelected(keepSelected);
      if (detail && list.some((o) => o.id === detail.id && o.brand === detail.brand)) {
        setDetail((d) =>
          d
            ? {
                ...d,
                stage: target,
                stageLabel: STAGE_LABELS[target],
                blanksReceipt: options?.blanksReceipt ?? d.blanksReceipt,
              }
            : d,
        );
      }
      setStageAndUrl(target);

      toast.success(
        list.length === 1
          ? `${list[0].orderNumber} → ${STAGE_LABELS[target]}`
          : `${list.length} orders → ${STAGE_LABELS[target]}`,
      );
      await load({ preserveSelection: true, forceRefresh: true, silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update status");
    } finally {
      setSaving(false);
    }
  };

  /** Gate moves into Ordered behind an ops confirmation checkbox. */
  const requestStageChange = (target: OrderFlowStage, list: OrderFlowOrder[]) => {
    if (list.length === 0) return;
    if (target === "blanks_ordered") {
      setBlanksOrderedAck(false);
      setBlanksReceiptFile(null);
      setBlanksOrderedConfirm({ orders: list });
      return;
    }
    void applyStage(target, list);
  };

  const closeBlanksOrderedConfirm = () => {
    setBlanksOrderedConfirm(null);
    setBlanksOrderedAck(false);
    setBlanksReceiptFile(null);
  };

  const onBlanksReceiptSelected = (file: File | null) => {
    if (!file) {
      setBlanksReceiptFile(null);
      return;
    }
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ];
    if (!allowed.includes(file.type) && !/\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
      toast.error("Upload a PDF or image receipt");
      return;
    }
    setBlanksReceiptFile(file);
  };

  const confirmBlanksOrderedMove = async () => {
    if (!blanksOrderedConfirm || !blanksOrderedAck || !blanksReceiptFile) {
      if (!blanksReceiptFile) {
        toast.error("Upload the blanks order receipt to continue");
      }
      return;
    }
    const list = blanksOrderedConfirm.orders;
    setBlanksReceiptBusy(true);
    let receipt: BlanksReceipt;
    try {
      const dataUrl = await readFileAsPersistedDataUrl(blanksReceiptFile, 2.5 * 1024 * 1024);
      receipt = {
        name: blanksReceiptFile.name,
        mimeType: blanksReceiptFile.type || "application/octet-stream",
        dataUrl,
        uploadedAt: new Date().toISOString(),
      };
    } catch (err) {
      if (err instanceof FileTooLargeError) {
        toast.error("Receipt must be 2.5 MB or smaller");
      } else {
        toast.error(err instanceof Error ? err.message : "Could not read receipt");
      }
      setBlanksReceiptBusy(false);
      return;
    }
    setBlanksReceiptBusy(false);
    closeBlanksOrderedConfirm();
    await applyStage("blanks_ordered", list, { blanksReceipt: receipt });
  };

  const openDetail = (order: OrderFlowOrder) => {
    setDetail(order);
    setNotesDraft(order.notes || "");
    setDetailTab("overview");
    const needsReceipt =
      Boolean(order.blanksReceipt?.hasFile) && !order.blanksReceipt?.dataUrl;
    if (!needsReceipt) return;
    void (async () => {
      try {
        const receipt = await fetchOrderFlowReceipt(order.brand, order.id);
        if (!receipt) return;
        setDetail((d) =>
          d && d.id === order.id && d.brand === order.brand
            ? { ...d, blanksReceipt: receipt }
            : d,
        );
      } catch {
        /* list still works without downloadable receipt */
      }
    })();
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
      await load({ preserveSelection: true, forceRefresh: true, silent: true });
      setDetail((d) => (d ? { ...d, notes: notesDraft } : d));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save notes");
    } finally {
      setSaving(false);
    }
  };

  const detailSupplyBrand = detail ? resolveSupplyBrand(detail.brand) : null;
  const detailSuppliesApplied = detail ? orderHasSuppliesApplied(detail) : false;
  const detailMaterialNeeds: MaterialNeedLine[] = useMemo(() => {
    if (!detail || !detailSupplyBrand) return [];
    const items =
      detail.lineItems?.length > 0
        ? detail.lineItems
        : [
            {
              productId: undefined,
              product: detail.product,
              quantity: detail.quantity,
            },
          ];
    return computeMaterialNeeds(detailSupplyBrand, items);
  }, [detail, detailSupplyBrand]);

  const applySupplies = async (order: OrderFlowOrder) => {
    const brandKey = resolveSupplyBrand(order.brand);
    if (!brandKey) {
      toast.error("Unknown brand for supplies");
      return;
    }
    if (orderHasSuppliesApplied(order)) {
      toast.message("Supplies already applied for this order");
      return;
    }
    setSuppliesBusy(true);
    let deducted: MaterialNeedLine[] | null = null;
    try {
      const items =
        order.lineItems?.length > 0
          ? order.lineItems
          : [{ productId: undefined, product: order.product, quantity: order.quantity }];
      const result = applySuppliesForOrder(brandKey, {
        orderKey: `${order.brand}::${order.id}`,
        orderNumber: order.orderNumber,
        lineItems: items,
        by: "ops",
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      deducted = result.needs;
      await markOrderSuppliesApplied({
        brand: order.brand,
        shopifyOrderId: order.id,
        orderName: order.orderNumber,
        actor: "ops",
      });
      toast.success(`Supplies applied for ${order.orderNumber}`);
      await load({ preserveSelection: true, forceRefresh: true, silent: true });
      const at = new Date().toISOString();
      setDetail((prev) =>
        prev && prev.id === order.id && prev.brand === order.brand
          ? {
              ...prev,
              suppliesApplied: { at, by: "ops" },
              history: [
                ...(prev.history || []),
                {
                  stage: prev.stage,
                  at,
                  by: "ops",
                  suppliesApplied: true,
                },
              ],
            }
          : prev,
      );
    } catch (err) {
      if (deducted) {
        for (const need of deducted) {
          adjustMaterialQty(brandKey, need.materialId, need.qtyNeeded, {
            type: "adjust",
            note: "Rollback — supplies stamp failed",
            by: "ops",
          });
        }
      }
      toast.error(err instanceof Error ? err.message : "Could not apply supplies");
    } finally {
      setSuppliesBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[26px] font-semibold leading-[1.2] tracking-[-0.22px] text-gray-900">
            Orders
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={brand}
            onValueChange={(v) => {
              if (v === "all" || v === "live-don" || v === "sinners-testimony") {
                setBrand(v);
              }
            }}
          >
            <SelectTrigger
              size="default"
              className={cn(TOOLBAR_CONTROL, "w-auto min-w-[8.5rem]")}
              aria-label="Filter by brand"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {BRAND_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={TOOLBAR_CONTROL}
            onClick={() => void load({ forceRefresh: true })}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
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

      <Tabs
        value={boardTab}
        onValueChange={(v) => setBoardTab(v === "risk" ? "risk" : "production")}
        className="gap-4"
      >
        <FloatingPillNav
          data-tour="orders-tabs"
          layoutId="orders-board-pill"
          value={boardTab}
          onChange={(id) =>
            setBoardTab(id === "risk" ? "risk" : "production")
          }
          items={[
            { id: "production", label: "Production" },
            {
              id: "risk",
              label: "Risk review",
              badge: riskQueue.pendingCount,
            },
          ]}
        />

        <TabsContent value="risk" className="outline-none">
          <OrderFlowRiskReviewSection
            riskQueue={riskQueue}
            busy={loading}
            onChanged={() =>
              void load({
                preserveSelection: true,
                forceRefresh: true,
                silent: true,
              })
            }
          />
        </TabsContent>

        <TabsContent value="production" className="space-y-6 outline-none">
      <div
        data-tour="orders-stages"
        className="grid w-full [grid-template-columns:repeat(5,minmax(0,1fr))]"
      >
        {(stages.length
          ? stages.filter((s) => s.id !== "all")
          : ORDER_FLOW_STAGES.map((id) => ({
              id,
              label: STAGE_LABELS[id],
              count: 0,
            }))
        ).map((s, index) => {
          const active = stage === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStageAndUrl(s.id as StageFilter)}
              className={cn(
                "relative w-full min-w-0 px-3 py-3 text-left transition-colors sm:px-4",
                index > 0 &&
                  "before:absolute before:top-2.5 before:bottom-2.5 before:left-0 before:w-px before:bg-black/[0.08]",
                active
                  ? "rounded-xl bg-gray-100"
                  : "rounded-xl bg-transparent hover:bg-gray-50",
              )}
            >
              <p className="truncate text-sm text-muted-foreground">
                {s.label}
              </p>
              <p className="mt-1.5 text-xl font-semibold tabular-nums text-gray-900">
                {s.count}
              </p>
            </button>
          );
        })}
      </div>

      <div data-tour="orders-table" className="space-y-4 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-gray-900">
            {STAGE_LABELS[stage]}
          </h3>
          <p className="text-sm text-gray-500">
            {loading ? "Loading…" : `${visibleOrders.length} order(s)`}
          </p>
        </div>
        <OrderFlowDataTable
          data={visibleOrders}
          stage={stage}
          loading={loading}
          saving={saving}
          selected={selected}
          onSelectedChange={setSelected}
          onOpenDetail={openDetail}
          onRequestStageChange={requestStageChange}
          toolbarActions={
            <>
              <Button
                type="button"
                variant="outline"
                className={
                  selectedOrders.length > 0
                    ? "gap-2 border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    : "gap-2 border-gray-200 bg-gray-50 font-normal text-gray-400 disabled:opacity-100"
                }
                disabled={selectedOrders.length === 0}
                onClick={() => {
                  try {
                    const html = buildBlanksPrintHtml(selectedOrders);
                    setBlanksSlipHtml(html);
                    setBlanksSlipOpen(true);
                  } catch (err) {
                    toast.error(
                      err instanceof Error
                        ? err.message
                        : "Could not open blanks slip",
                    );
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
                    variant="default"
                    disabled={saving}
                    className="bg-brand font-medium text-white hover:bg-brand-hover disabled:opacity-70"
                    onClick={() =>
                      void requestStageChange(action.next, action.orders)
                    }
                  >
                    {`Move ${action.orders.length} → ${STAGE_LABELS[action.next]}`}
                  </Button>
                ))
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled
                  className="border-gray-200 bg-gray-50 font-normal text-gray-400 disabled:opacity-100"
                >
                  Move to next stage
                </Button>
              )}
              <p className="text-sm text-muted-foreground sm:ml-1">
                {selectedOrders.length > 0
                  ? `${selectedOrders.length} selected`
                  : "Select orders to print or advance"}
              </p>
            </>
          }
        />
      </div>
        </TabsContent>
      </Tabs>

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
                disabled={!blanksSlipHtml}
                onClick={() => {
                  try {
                    printBlanksSlipHtml(blanksSlipHtml);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not print");
                  }
                }}
              >
                <Printer className="h-4 w-4" />
                Print / save PDF
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(blanksOrderedConfirm)}
        onOpenChange={(open) => {
          if (!open) closeBlanksOrderedConfirm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move to ordered?</DialogTitle>
            <DialogDescription>
              {blanksOrderedConfirm
                ? blanksOrderedConfirm.orders.length === 1
                  ? `Confirm that blanks for ${blanksOrderedConfirm.orders[0].orderNumber} have been ordered before moving to the next stage.`
                  : `Confirm that blanks for ${blanksOrderedConfirm.orders.length} selected orders have been ordered before moving to the next stage.`
                : null}
            </DialogDescription>
          </DialogHeader>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm leading-snug text-gray-800">
            <Checkbox
              checked={blanksOrderedAck}
              onCheckedChange={(v) => setBlanksOrderedAck(Boolean(v))}
              className="mt-0.5"
              aria-label="Confirm blanks ordered"
            />
            <span>
              I have ordered the necessary garments from the required batch to
              move to the next stage.
            </span>
          </label>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900">Order receipt</p>
            <p className="text-xs text-gray-500">
              Required — attach the vendor receipt or PO confirmation (PDF or image, max 2.5 MB).
            </p>
            {blanksReceiptFile ? (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
                  {blanksReceiptFile.name}
                </span>
                <button
                  type="button"
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Remove receipt"
                  onClick={() => setBlanksReceiptFile(null)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center transition-colors hover:border-gray-400 hover:bg-gray-50/80">
                <Upload className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-800">Upload receipt</span>
                <span className="text-xs text-gray-500">PDF, JPG, or PNG</span>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
                  className="sr-only"
                  onChange={(e) =>
                    onBlanksReceiptSelected(e.target.files?.[0] ?? null)
                  }
                />
              </label>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="tertiary"
              onClick={closeBlanksOrderedConfirm}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                !blanksOrderedAck ||
                !blanksReceiptFile ||
                saving ||
                blanksReceiptBusy
              }
              onClick={() => void confirmBlanksOrderedMove()}
            >
              {blanksReceiptBusy ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Preparing…
                </>
              ) : (
                "Move to ordered"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden border-l border-gray-200 bg-white p-0 sm:max-w-md">
          {detail ? (
            <>
              <SheetHeader className="space-y-0 border-b border-gray-100 px-5 pb-4 pt-5 pr-12 text-left">
                <SheetDescription className="sr-only">
                  Order details for {detail.orderNumber}
                </SheetDescription>
                <p className="text-xs font-medium text-gray-500">{detail.brandLabel}</p>
                <SheetTitle className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">
                  {detail.orderNumber}
                </SheetTitle>
                <p className="mt-1 text-sm text-gray-500">{detail.customer}</p>
              </SheetHeader>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
                <div className="space-y-3.5">
                  <DetailMetaRow icon={Tag} label="Stage">
                    <Badge
                      variant="outline"
                      className={cn("font-medium", stageBadgeClass(detail.stage))}
                    >
                      {detail.stageLabel}
                    </Badge>
                  </DetailMetaRow>
                  {detail.blanksReceipt?.dataUrl || detail.blanksReceipt?.hasFile ? (
                    <DetailMetaRow icon={FileText} label="Receipt">
                      {detail.blanksReceipt.dataUrl ? (
                        <a
                          href={detail.blanksReceipt.dataUrl}
                          download={detail.blanksReceipt.name || "blanks-receipt"}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-full items-center gap-1.5 font-medium text-brand hover:underline"
                        >
                          <span className="truncate">
                            {detail.blanksReceipt.name || "Blanks order receipt"}
                          </span>
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {detail.blanksReceipt.name || "Blanks order receipt"} (loading…)
                        </span>
                      )}
                    </DetailMetaRow>
                  ) : null}
                  <DetailMetaRow icon={User} label="Customer">
                    <div>
                      <p className="font-medium">{detail.customer}</p>
                      {detail.email ? <p className="text-xs text-gray-500">{detail.email}</p> : null}
                    </div>
                  </DetailMetaRow>
                  <DetailMetaRow icon={Calendar} label="Ordered">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-gray-900">
                        {detail.highPriority || detail.earlyWarning ? (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-amber-500"
                            aria-hidden
                          />
                        ) : null}
                        <span>
                          {detail.orderDate}
                          {detail.orderAgeDays != null
                            ? ` · ${detail.orderAgeDays}d`
                            : ""}
                        </span>
                      </span>
                      {agePriorityBadge(detail)}
                    </div>
                  </DetailMetaRow>
                  <DetailMetaRow icon={Truck} label="Ship by">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5",
                          deadlineClass(detail.deadlineState),
                        )}
                      >
                        <DeadlineIndicator state={detail.deadlineState} />
                        <span>{detail.expectedShipDate || "—"}</span>
                      </span>
                      {!detail.highPriority && !detail.earlyWarning
                        ? deadlineBadge(detail)
                        : null}
                    </div>
                  </DetailMetaRow>
                  <DetailMetaRow icon={CreditCard} label="Payment">
                    {detail.shopifyFinancialStatus || "—"}
                  </DetailMetaRow>
                  <DetailMetaRow icon={Package} label="Fulfillment">
                    {detail.shopifyFulfillmentStatus || "—"}
                  </DetailMetaRow>
                  <DetailMetaRow icon={CheckCircle2} label="Qty">
                    {detail.quantity}
                  </DetailMetaRow>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-gray-900">Products</p>
                  <div className="space-y-2 rounded-xl bg-gray-50 px-3 py-3">
                    {(detail.lineItems?.length
                      ? detail.lineItems
                      : [
                          {
                            product: detail.product,
                            color: detail.color,
                            size: detail.size,
                            quantity: detail.quantity,
                            variant: detail.variant,
                          },
                        ]
                    ).map((item, idx) => (
                      <div key={`${item.product}-${idx}`} className="flex gap-2 text-sm">
                        <Shirt className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">
                            {formatOrderLabel(item.product)}
                          </p>
                          <p className="text-gray-500">
                            {formatOrderLabel(item.color)} ·{" "}
                            {formatOrderLabel(item.size)} · qty {item.quantity}
                          </p>
                          {"productId" in item && item.productId ? (
                            <p className="mt-0.5 truncate font-mono text-[11px] text-gray-400">
                              {item.productId}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {detailSupplyBrand ? (
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">Materials needed</p>
                      <Badge
                        variant={detailSuppliesApplied ? "default" : "secondary"}
                        className="shrink-0"
                      >
                        {detailSuppliesApplied ? "Applied" : "Not applied"}
                      </Badge>
                    </div>
                    <div className="space-y-2 rounded-xl bg-gray-50 px-3 py-3">
                      {detailMaterialNeeds.length ? (
                        detailMaterialNeeds.map((need) => (
                          <div
                            key={need.materialId}
                            className="flex items-start justify-between gap-3 text-sm"
                          >
                            <div className="flex min-w-0 items-start gap-2.5">
                              {need.photoDataUrl ? (
                                <img
                                  src={need.photoDataUrl}
                                  alt=""
                                  className="h-9 w-9 shrink-0 rounded-md border border-gray-200 object-cover"
                                />
                              ) : (
                                <div
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-200 bg-white text-gray-400"
                                  aria-hidden
                                >
                                  <Package className="h-3.5 w-3.5" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900">{need.materialName}</p>
                                <p className="text-gray-500">
                                  Need {need.qtyNeeded} {need.unit} · on hand {need.qtyOnHand}
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              {need.insufficient ? (
                                <Badge variant="destructive">Short</Badge>
                              ) : need.lowStock ? (
                                <Badge variant="secondary">Low</Badge>
                              ) : null}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">
                          No recipe matched these products. Add recipes under Inventory using
                          each product ID above.
                        </p>
                      )}
                      <div className="pt-1">
                        <Button
                          type="button"
                          size="sm"
                          shape="pill"
                          disabled={
                            suppliesBusy ||
                            detailSuppliesApplied ||
                            !detailMaterialNeeds.length ||
                            detailMaterialNeeds.some((n) => n.insufficient)
                          }
                          onClick={() => void applySupplies(detail)}
                        >
                          {suppliesBusy ? (
                            <>
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                              Applying…
                            </>
                          ) : (
                            <>
                              <Boxes className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                              Apply supplies
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {detail.shopifyNote ? (
                  <div>
                    <p className="mb-2 text-sm font-medium text-gray-900">Shopify note</p>
                    <p className="rounded-xl bg-gray-50 px-3 py-3 text-sm leading-relaxed text-gray-700">
                      {detail.shopifyNote}
                    </p>
                  </div>
                ) : null}

                <div>
                  <p className="mb-2 text-sm font-medium text-gray-900">Move stage</p>
                  <div className="flex flex-wrap gap-2">
                    {ORDER_FLOW_STAGES.map((s) => (
                      <Button
                        key={s}
                        type="button"
                        size="sm"
                        shape="pill"
                        variant={detail.stage === s ? "default" : "tertiary"}
                        disabled={saving || detail.stage === s}
                        onClick={() => void requestStageChange(s, [detail])}
                      >
                        {STAGE_LABELS[s]}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex gap-4 border-b border-gray-200">
                    {(
                      [
                        { id: "overview", label: "Overview" },
                        { id: "activity", label: "Activity" },
                        { id: "notes", label: "Notes" },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        className={cn(
                          "border-b-2 pb-2.5 text-sm font-medium transition-colors",
                          detailTab === tab.id
                            ? "border-brand text-brand"
                            : "border-transparent text-gray-500 hover:text-gray-800",
                        )}
                        onClick={() => setDetailTab(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="pt-4">
                    {detailTab === "overview" ? (
                      <p className="text-sm leading-relaxed text-gray-600">
                        Track blanks, production, and ship status for this order. Use Activity for
                        stage history and Notes for floor comments.
                      </p>
                    ) : null}

                    {detailTab === "activity" ? (
                      detail.history?.length ? (
                        <ul className="space-y-4">
                          {[...detail.history].reverse().map((h, i) => (
                            <li key={`${h.at}-${i}`} className="flex gap-3">
                              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                                {h.suppliesApplied ? (
                                  <Boxes className="h-3.5 w-3.5" aria-hidden />
                                ) : (
                                  <Clock className="h-3.5 w-3.5" aria-hidden />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm text-gray-900">
                                  {h.suppliesApplied ? (
                                    <>
                                      <span className="font-medium">{h.by || "ops"}</span>
                                      {" applied shop supplies"}
                                    </>
                                  ) : (
                                    <>
                                      <span className="font-medium">{h.by || "ops"}</span>
                                      {" moved to "}
                                      <span className="font-medium">
                                        {STAGE_LABELS[normalizeOrderFlowStage(h.stage)] || h.stage}
                                      </span>
                                    </>
                                  )}
                                </p>
                                <p className="mt-0.5 text-xs text-gray-500">
                                  {new Date(h.at).toLocaleString()}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-500">No stage changes recorded yet.</p>
                      )
                    ) : null}

                    {detailTab === "notes" ? (
                      <div className="space-y-3">
                        <Textarea
                          rows={5}
                          value={notesDraft}
                          onChange={(e) => setNotesDraft(e.target.value)}
                          placeholder="Blank vendor, PO #, production notes…"
                          className="rounded-xl border-gray-200 bg-gray-50"
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={saving}
                          onClick={() => void saveNotes()}
                        >
                          Save notes
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
