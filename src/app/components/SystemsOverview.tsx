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
import { Button } from "./ui/button";
import {
  ArrowRight,
  Loader2,
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
      title: "Orders past 7 days",
      detail: "Open work older than a week — clear these first on Order Flow.",
      tone: "critical",
      to: "/order-flow",
      count: highPriority,
    });
  }
  if (earlyWarning > 0) {
    items.push({
      id: "early-warning",
      title: "Approaching late (3+ days)",
      detail: "Move these before they hit high priority.",
      tone: "action",
      to: "/order-flow",
      count: earlyWarning,
    });
  }
  if (overdue > 0) {
    items.push({
      id: "overdue",
      title: "Past ship date",
      detail: "Promised ship dates already passed.",
      tone: "critical",
      to: "/order-flow",
      count: overdue,
    });
  }
  if (dueToday > 0) {
    items.push({
      id: "due-today",
      title: "Ship today",
      detail: "Expected ship date is today.",
      tone: "critical",
      to: "/order-flow",
      count: dueToday,
    });
  }
  if (needsBlanks > 0) {
    items.push({
      id: "needs-blanks",
      title: "Blanks to order",
      detail: "Waiting on blank purchase.",
      tone: "action",
      to: "/order-flow?stage=needs_blanks",
      count: needsBlanks,
    });
  }
  if (inProd > 0) {
    items.push({
      id: "in-prod",
      title: "On the floor",
      detail: "In production — keep throughput moving.",
      tone: "action",
      to: "/order-flow?stage=in_production",
      count: inProd,
    });
  }
  if (readyShip > 0) {
    items.push({
      id: "ready-ship",
      title: "Ready to ship",
      detail: "Finished goods waiting to leave.",
      tone: "action",
      to: "/order-flow?stage=ready_to_ship",
      count: readyShip,
    });
  }

  if (items.length === 0) {
    items.push({
      id: "clear",
      title: "No open blockers",
      detail: "Live Order Flow is clear. Stand by for new orders.",
      tone: "steady",
      to: "/order-flow",
    });
  }

  return items.slice(0, 6);
}

const PIPELINE: Array<{ id: OrderFlowStage; icon: typeof Shirt }> = [
  { id: "needs_blanks", icon: Shirt },
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
  const openOrders =
    countFor(stages, "needs_blanks") +
    countFor(stages, "in_production") +
    countFor(stages, "ready_to_ship");
  const criticalCount = focusItems.filter((i) => i.tone === "critical").length;

  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());

  const timeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());

  return (
    <div className="space-y-8">
      {/* Workspace header */}
      <header className="flex flex-col gap-4 border-b border-gray-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400">
            Floor · {weekday} · {timeLabel}
          </p>
          <h2 className="mt-2 text-[1.75rem] font-semibold tracking-tight text-gray-950">
            Daily Brief
          </h2>
          <p className="mt-1.5 max-w-xl text-sm text-gray-500">
            Live production status for the shift. Work the queue, then open Order Flow.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            className="gap-2"
            onClick={() => void loadFlow()}
            disabled={flowLoading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", flowLoading && "animate-spin")} />
            Refresh
          </Button>
          <Link to="/order-flow">
            <Button size="sm" className="gap-2">
              Order Flow
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </header>

      {/* KPI strip — denser, less “card toy” */}
      <section className="grid grid-cols-2 divide-x divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white sm:grid-cols-4 sm:divide-y-0">
        {[
          { label: "Open", value: openOrders },
          { label: "Needs blanks", value: countFor(stages, "needs_blanks") },
          { label: "In production", value: countFor(stages, "in_production") },
          { label: "Ready to ship", value: countFor(stages, "ready_to_ship") },
        ].map((cell) => (
          <div key={cell.label} className="px-4 py-4 sm:px-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
              {cell.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-gray-950">
              {flowLoading ? "—" : cell.value}
            </p>
          </div>
        ))}
      </section>

      {flowError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {flowError}
        </div>
      ) : null}

      {/* Main workspace: queue + pipeline */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <section className="lg:col-span-7">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-950">Work queue</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                From live Order Flow
                {criticalCount > 0 ? (
                  <span className="ml-1.5 font-medium text-red-700">
                    · {criticalCount} critical
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          {flowLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-10 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading queue…
            </div>
          ) : (
            <ul className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              {focusItems.map((item, index) => (
                <li key={item.id} className={cn(index > 0 && "border-t border-gray-100")}>
                  <Link
                    to={item.to}
                    className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-gray-50/80"
                  >
                    <span
                      className={cn(
                        "mt-0.5 h-8 w-0.5 shrink-0 rounded-full",
                        item.tone === "critical"
                          ? "bg-red-500"
                          : item.tone === "action"
                            ? "bg-brand"
                            : "bg-gray-300",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-gray-950">{item.title}</p>
                        <span
                          className={cn(
                            "text-[10px] font-medium uppercase tracking-wide",
                            item.tone === "critical"
                              ? "text-red-600"
                              : item.tone === "action"
                                ? "text-brand"
                                : "text-gray-400",
                          )}
                        >
                          {item.tone === "critical"
                            ? "Critical"
                            : item.tone === "action"
                              ? "Next"
                              : "Clear"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{item.detail}</p>
                    </div>
                    {typeof item.count === "number" ? (
                      <span className="shrink-0 text-lg font-semibold tabular-nums text-gray-950">
                        {item.count}
                      </span>
                    ) : null}
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/order-flow?stage=needs_blanks">
              <Button size="sm" variant="tertiary" className="gap-2">
                <Shirt className="h-3.5 w-3.5" />
                Blanks list
              </Button>
            </Link>
            <Link to="/order-flow?stage=ready_to_ship">
              <Button size="sm" variant="tertiary" className="gap-2">
                <Truck className="h-3.5 w-3.5" />
                Shipping queue
              </Button>
            </Link>
          </div>
        </section>

        <section className="lg:col-span-5">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-gray-950">Pipeline</h3>
            <p className="mt-0.5 text-xs text-gray-500">Open stages only — click to jump in.</p>
          </div>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            {PIPELINE.map(({ id, icon: Icon }, index) => {
              const n = countFor(stages, id);
              return (
                <Link
                  key={id}
                  to={`/order-flow?stage=${id}`}
                  className={cn(
                    "flex items-center gap-3 px-4 py-4 transition-colors hover:bg-gray-50/80",
                    index > 0 && "border-t border-gray-100",
                  )}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#F3F4F6] text-brand">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-950">{STAGE_LABELS[id]}</p>
                    <p className="text-[11px] text-gray-400">Open Order Flow</p>
                  </div>
                  <p className="text-xl font-semibold tabular-nums text-gray-950">
                    {flowLoading ? "—" : n}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      {/* Shift notes — quieter written brief */}
      <section className="border-t border-gray-200 pt-8">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-950">Shift notes</h3>
          <p className="mt-0.5 text-xs text-gray-500">Priorities and issues set for the floor.</p>
        </div>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 md:grid-cols-2 xl:grid-cols-4">
          <div className="bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Priorities</p>
            <ul className="mt-3 space-y-2.5">
              {homeContent.priorities.map((item) => (
                <li key={item} className="text-sm leading-snug text-gray-700">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Due today</p>
            <ul className="mt-3 space-y-2.5">
              {homeContent.tasksDueToday.map((item) => (
                <li key={item} className="text-sm leading-snug text-gray-700">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Updates</p>
            <ul className="mt-3 space-y-2.5">
              {homeContent.updates.map((item) => (
                <li key={item} className="text-sm leading-snug text-gray-700">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Open issues</p>
            <ul className="mt-3 space-y-2.5">
              {homeContent.openIssues.map((item) => (
                <li key={item} className="text-sm leading-snug text-gray-700">
                  {item}
                </li>
              ))}
              <li className="text-sm text-gray-500">
                Docs needing update:{" "}
                <span className="font-medium text-gray-800">
                  {topSops.filter((sop) => sop.status !== "Active").length}
                </span>
              </li>
            </ul>
            <div className="mt-4 space-y-1 border-t border-gray-100 pt-3">
              <Link
                to="/order-flow"
                className="flex items-center justify-between text-sm font-medium text-gray-900 hover:text-brand"
              >
                Order Flow
                <ArrowRight className="h-3.5 w-3.5 text-gray-300" />
              </Link>
              <Link
                to="/sops"
                className="flex items-center justify-between text-sm font-medium text-gray-900 hover:text-brand"
              >
                Knowledge Base
                <ArrowRight className="h-3.5 w-3.5 text-gray-300" />
              </Link>
              {homeContent.quickLinks.map((item) => (
                <Link
                  key={`${item.label}-${item.to}`}
                  to={item.to}
                  className="flex items-center justify-between text-sm font-medium text-gray-900 hover:text-brand"
                >
                  <span className="truncate">{item.label}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {showCeoFinance ? (
        <section className="space-y-3 border-t border-gray-200 pt-8">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400">
              Leadership
            </p>
            <h3 className="mt-1 text-sm font-semibold text-gray-950">Live store performance</h3>
            <p className="mt-0.5 text-xs text-gray-500">Profit, revenue, ads, and production.</p>
          </div>
          <CombinedLiveStoresPanel />
        </section>
      ) : null}
    </div>
  );
}
