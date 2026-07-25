import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router";
import {
  type OperatorDashboardContent,
  OperatorDashboardStorage,
  SOPsStorage,
} from "../lib/storage";
import { useAuth } from "../lib/use-auth";
import {
  fetchOrderFlow,
  STAGE_LABELS,
  type OrderFlowOrder,
  type OrderFlowStage,
  type OrderFlowStageCount,
} from "../lib/order-flow";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Megaphone,
  Package,
  RefreshCw,
  Scissors,
  Shirt,
  Truck,
} from "lucide-react";
import { CombinedLiveStoresPanel } from "./CombinedLiveStoresPanel";
import { cn } from "./ui/utils";

type FocusItem = {
  id: string;
  title: string;
  detail: string;
  tone: "critical" | "action" | "steady";
  to: string;
  count?: number;
};

function countFor(stages: OrderFlowStageCount[], id: string): number {
  return stages.find((s) => s.id === id)?.count ?? 0;
}

function buildLiveFocus(orders: OrderFlowOrder[], stages: OrderFlowStageCount[]): FocusItem[] {
  const needsBlanks = countFor(stages, "needs_blanks");
  const blanksOrdered = countFor(stages, "blanks_ordered");
  const readyProd = countFor(stages, "ready_for_production");
  const inProd = countFor(stages, "in_production");
  const readyShip = countFor(stages, "ready_to_ship");
  const overdue = orders.filter(
    (o) => o.stage !== "shipped" && o.deadlineState === "overdue",
  ).length;
  const dueToday = orders.filter(
    (o) => o.stage !== "shipped" && o.deadlineState === "due_today",
  ).length;
  const highPriority = orders.filter((o) => o.highPriority).length;
  const earlyWarning = orders.filter((o) => o.earlyWarning).length;

  const items: FocusItem[] = [];

  if (highPriority > 0) {
    items.push({
      id: "high-priority",
      title: "7+ day orders",
      detail: "Open orders older than 7 days — red high priority on Order Flow.",
      tone: "critical",
      to: "/order-flow",
      count: highPriority,
    });
  }
  if (earlyWarning > 0) {
    items.push({
      id: "early-warning",
      title: "Approaching late",
      detail: "3+ days since order — move these before they hit 7-day high priority.",
      tone: "action",
      to: "/order-flow",
      count: earlyWarning,
    });
  }
  if (overdue > 0) {
    items.push({
      id: "overdue",
      title: "Overdue ship dates",
      detail: "Clear these first — promised dates already passed.",
      tone: "critical",
      to: "/order-flow",
      count: overdue,
    });
  }
  if (dueToday > 0) {
    items.push({
      id: "due-today",
      title: "Must ship today",
      detail: "Orders with expected ship date today.",
      tone: "critical",
      to: "/order-flow",
      count: dueToday,
    });
  }
  if (needsBlanks > 0) {
    items.push({
      id: "needs-blanks",
      title: "Order blanks",
      detail: "New / waiting orders still need blanks purchased.",
      tone: "action",
      to: "/order-flow?stage=needs_blanks",
      count: needsBlanks,
    });
  }
  if (readyShip > 0) {
    items.push({
      id: "ready-ship",
      title: "Pack & ship",
      detail: "Finished work waiting to leave the building.",
      tone: "action",
      to: "/order-flow?stage=ready_to_ship",
      count: readyShip,
    });
  }
  if (readyProd > 0) {
    items.push({
      id: "ready-prod",
      title: "Start production",
      detail: "Blanks are ready — assign work on the floor.",
      tone: "action",
      to: "/order-flow?stage=ready_for_production",
      count: readyProd,
    });
  }
  if (inProd > 0) {
    items.push({
      id: "in-prod",
      title: "Keep production moving",
      detail: "Orders currently on the floor — clear blockers early.",
      tone: "steady",
      to: "/order-flow?stage=in_production",
      count: inProd,
    });
  }
  if (blanksOrdered > 0) {
    items.push({
      id: "blanks-ordered",
      title: "Watch blank arrivals",
      detail: "Blanks ordered — move to production when they land.",
      tone: "steady",
      to: "/order-flow?stage=blanks_ordered",
      count: blanksOrdered,
    });
  }

  if (items.length === 0) {
    items.push({
      id: "clear",
      title: "Floor is clear",
      detail: "No open production blockers from live Order Flow. Stay ready for new orders.",
      tone: "steady",
      to: "/order-flow",
    });
  }

  return items.slice(0, 6);
}

function toneStyles(tone: FocusItem["tone"]) {
  switch (tone) {
    case "critical":
      return {
        card: "border-rose-200 bg-rose-50/60",
        badge: "border-rose-300 bg-rose-100 text-rose-900",
        count: "text-rose-800",
      };
    case "action":
      return {
        card: "border-amber-200 bg-amber-50/50",
        badge: "border-amber-300 bg-amber-100 text-amber-950",
        count: "text-amber-900",
      };
    default:
      return {
        card: "border-gray-200 bg-white",
        badge: "border-gray-200 bg-gray-50 text-gray-700",
        count: "text-gray-900",
      };
  }
}

const PIPELINE: Array<{ id: OrderFlowStage; icon: typeof Shirt }> = [
  { id: "needs_blanks", icon: Shirt },
  { id: "blanks_ordered", icon: Package },
  { id: "ready_for_production", icon: ClipboardList },
  { id: "in_production", icon: Scissors },
  { id: "ready_to_ship", icon: Truck },
];

export function SystemsOverview() {
  const { loading: authLoading, isCeo } = useAuth();
  const [topSops, setTopSops] = useState<
    Array<{ id: string; title: string; status: "Draft" | "Active" | "Needs Update"; updatedAt: string }>
  >([]);
  const [homeContent, setHomeContent] = useState<OperatorDashboardContent>(
    OperatorDashboardStorage.getContent(),
  );
  const [stages, setStages] = useState<OrderFlowStageCount[]>([]);
  const [orders, setOrders] = useState<OrderFlowOrder[]>([]);
  const [flowLoading, setFlowLoading] = useState(true);
  const [flowError, setFlowError] = useState<string | null>(null);

  const loadHome = useCallback(() => {
    setHomeContent(OperatorDashboardStorage.getContent());
    const recentSops = SOPsStorage.getSOPs()
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
      .slice(0, 5)
      .map((sop) => ({
        id: sop.id,
        title: sop.title,
        status: sop.status ?? "Active",
        updatedAt: sop.updatedAt,
      }));
    setTopSops(recentSops);
  }, []);

  const loadFlow = useCallback(async () => {
    setFlowLoading(true);
    setFlowError(null);
    try {
      const data = await fetchOrderFlow({ brand: "all", stage: "all", days: 90 });
      setStages(data.stages);
      setOrders(data.orders);
    } catch (err) {
      setFlowError(err instanceof Error ? err.message : "Could not load live order flow");
    } finally {
      setFlowLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHome();
    void loadFlow();
  }, [loadHome, loadFlow]);

  useEffect(() => {
    window.addEventListener("fgg-storage-sync", loadHome);
    return () => window.removeEventListener("fgg-storage-sync", loadHome);
  }, [loadHome]);

  const showCeoFinance = !authLoading && isCeo;
  const focusItems = useMemo(() => buildLiveFocus(orders, stages), [orders, stages]);
  const openOrders = countFor(stages, "all") - countFor(stages, "shipped");
  const criticalCount = focusItems.filter((i) => i.tone === "critical").length;

  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <div className="space-y-6">
      {/* Morning header */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 px-5 py-6 text-white sm:px-7 sm:py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">
              Ops / Productions · Morning brief
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Start the day in control
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-200 sm:text-base">
              {weekday}. Check what needs blanks, what&apos;s on the floor, and what must ship —
              then run the day without waiting for instructions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              className="gap-2 border-white/30 bg-white text-slate-900 hover:bg-slate-100"
              onClick={() => void loadFlow()}
              disabled={flowLoading}
            >
              <RefreshCw className={cn("h-4 w-4", flowLoading && "animate-spin")} />
              Refresh live data
            </Button>
            <Link to="/order-flow">
              <Button size="sm" className="gap-2">
                Open Order Flow
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-300">Open orders</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {flowLoading ? "…" : openOrders}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-300">Needs blanks</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {flowLoading ? "…" : countFor(stages, "needs_blanks")}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-300">In production</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {flowLoading ? "…" : countFor(stages, "in_production")}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-300">Ready to ship</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {flowLoading ? "…" : countFor(stages, "ready_to_ship")}
            </p>
          </div>
        </div>
      </div>

      {flowError ? (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="py-3 text-sm text-amber-900">{flowError}</CardContent>
        </Card>
      ) : null}

      {/* Live focus */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">What needs you first</h3>
            <p className="mt-0.5 text-sm text-gray-600">
              Built from live Order Flow — not a static checklist.
              {criticalCount > 0 ? (
                <span className="ml-1 font-medium text-rose-700">
                  {criticalCount} time-sensitive item{criticalCount === 1 ? "" : "s"}.
                </span>
              ) : null}
            </p>
          </div>
        </div>

        {flowLoading ? (
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-8 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading live production pulse…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {focusItems.map((item) => {
              const styles = toneStyles(item.tone);
              return (
                <Link
                  key={item.id}
                  to={item.to}
                  className={cn(
                    "rounded-xl border px-4 py-4 transition-colors hover:brightness-[0.99]",
                    styles.card,
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Badge variant="outline" className={styles.badge}>
                        {item.tone === "critical"
                          ? "Do first"
                          : item.tone === "action"
                            ? "Action"
                            : "Monitor"}
                      </Badge>
                      <p className="mt-2 text-base font-semibold text-gray-900">{item.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-gray-600">{item.detail}</p>
                    </div>
                    {typeof item.count === "number" ? (
                      <p className={cn("text-3xl font-semibold tabular-nums", styles.count)}>
                        {item.count}
                      </p>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Production pipeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Production pipeline</CardTitle>
          <CardDescription>
            Every open order lives in one of these stages. Keep work moving left → right.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {PIPELINE.map(({ id, icon: Icon }) => {
              const n = countFor(stages, id);
              return (
                <Link
                  key={id}
                  to={`/order-flow?stage=${id}`}
                  className="rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-3 transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                >
                  <div className="flex items-center gap-2 text-gray-500">
                    <Icon className="h-4 w-4" />
                    <span className="text-[11px] font-medium uppercase tracking-wide">
                      {STAGE_LABELS[id]}
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">
                    {flowLoading ? "…" : n}
                  </p>
                </Link>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/order-flow?stage=needs_blanks">
              <Button size="sm" variant="outline" className="gap-2">
                <Shirt className="h-4 w-4" />
                Print blanks needed
              </Button>
            </Link>
            <Link to="/order-flow?stage=ready_to_ship">
              <Button size="sm" variant="outline" className="gap-2">
                <Truck className="h-4 w-4" />
                Shipping queue
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Written brief from ops lead / CEO */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
              Today&apos;s priorities
            </CardTitle>
            <CardDescription>Set by leadership for the floor today.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {homeContent.priorities.map((item) => (
              <p key={item} className="flex gap-2 text-gray-700">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                <span>{item}</span>
              </p>
            ))}
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-indigo-600" />
              Tasks due today
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-700">
            {homeContent.tasksDueToday.map((item) => (
              <p key={item} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                <span>{item}</span>
              </p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4 text-amber-600" />
              Updates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-700">
            {homeContent.updates.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Open issues
            </CardTitle>
            <CardDescription>Escalate with a recommendation when needed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-700">
            {homeContent.openIssues.map((item) => (
              <p key={item}>{item}</p>
            ))}
            <p>
              Outstanding SOP reviews:{" "}
              {topSops.filter((sop) => sop.status !== "Active").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quick links</CardTitle>
            <CardDescription>Jump to the tools you use every morning.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link
              to="/order-flow"
              className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-gray-50"
            >
              <span className="text-sm font-medium text-gray-900">Order Flow</span>
              <ArrowRight className="h-4 w-4 text-gray-400" />
            </Link>
            <Link
              to="/sops"
              className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-gray-50"
            >
              <span className="text-sm font-medium text-gray-900">SOP library</span>
              <ArrowRight className="h-4 w-4 text-gray-400" />
            </Link>
            {homeContent.quickLinks.length > 0
              ? homeContent.quickLinks.map((item) => (
                  <Link
                    key={`${item.label}-${item.to}`}
                    to={item.to}
                    className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-gray-50"
                  >
                    <span className="truncate text-sm font-medium text-gray-900">{item.label}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
                  </Link>
                ))
              : topSops.slice(0, 3).map((sop) => (
                  <Link
                    key={sop.id}
                    to="/sops"
                    className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-gray-50"
                  >
                    <span className="truncate text-sm font-medium text-gray-900">{sop.title}</span>
                    <span className="text-xs text-gray-500">{sop.status}</span>
                  </Link>
                ))}
          </CardContent>
        </Card>
      </div>

      {showCeoFinance ? (
        <div className="space-y-3 border-t border-gray-200 pt-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
              CEO only
            </p>
            <h3 className="mt-1 text-lg font-semibold text-gray-900">Live store performance</h3>
            <p className="mt-1 text-sm text-gray-600">
              Profit, revenue, ads, and production.
            </p>
          </div>
          <CombinedLiveStoresPanel />
        </div>
      ) : null}
    </div>
  );
}
