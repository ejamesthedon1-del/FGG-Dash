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
import {
  getActivePersonalTasks,
  loadMyTasks,
  TASK_STATUS_LABELS,
  type MyTask,
} from "../lib/my-tasks-storage";
import {
  loadShiftDueTodayDone,
  toggleShiftDueTodayItem,
  type ShiftDueTodayDoneMap,
} from "../lib/shift-due-today-storage";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  ArrowRight,
  Boxes,
  CheckSquare,
  Loader2,
  Package,
  RefreshCw,
  Scissors,
  Shirt,
  Truck,
} from "lucide-react";
import { CombinedLiveStoresPanel } from "./CombinedLiveStoresPanel";
import {
  DashboardCtaCard,
  DashboardListRow,
  DashboardMetricCard,
  DashboardSectionHeader,
} from "./dashboard/DashboardPrimitives";
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
  if (blanksOrdered > 0) {
    items.push({
      id: "blanks-ordered",
      title: "Ordered",
      detail: "Purchase placed — waiting to arrive before production.",
      tone: "action",
      to: "/order-flow?stage=blanks_ordered",
      count: blanksOrdered,
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
  { id: "blanks_ordered", icon: Package },
  { id: "in_production", icon: Scissors },
  { id: "ready_to_ship", icon: Truck },
];

export function SystemsOverview() {
  const { loading: authLoading, isCeo, user } = useAuth();
  const userId = user?.id ?? null;
  const [topSops, setTopSops] = useState<
    Array<{ id: string; title: string; status: "Draft" | "Active" | "Needs Update"; updatedAt: string }>
  >([]);
  const [homeContent, setHomeContent] = useState<OperatorDashboardContent>(
    OperatorDashboardStorage.getContent(),
  );
  const [myTasks, setMyTasks] = useState<MyTask[]>([]);
  const [dueTodayDone, setDueTodayDone] = useState<ShiftDueTodayDoneMap>({});
  const [stages, setStages] = useState<OrderFlowStageCount[]>([]);
  const [orders, setOrders] = useState<OrderFlowOrder[]>([]);
  const [flowLoading, setFlowLoading] = useState(true);
  const [flowError, setFlowError] = useState<string | null>(null);

  const loadHome = useCallback(() => {
    setHomeContent(OperatorDashboardStorage.getContent());
    setMyTasks(loadMyTasks(userId));
    setDueTodayDone(loadShiftDueTodayDone(userId));
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
  }, [userId]);

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
    if (!isCeo) {
      void loadFlow();
    }
  }, [loadHome, loadFlow, isCeo]);

  useEffect(() => {
    window.addEventListener("fgg-storage-sync", loadHome);
    return () => window.removeEventListener("fgg-storage-sync", loadHome);
  }, [loadHome]);

  const showCeoFinance = !authLoading && isCeo;
  const focusItems = useMemo(() => buildLiveFocus(orders, stages), [orders, stages]);
  const shiftMyTasks = useMemo(
    () => getActivePersonalTasks(myTasks).slice(0, 5),
    [myTasks],
  );
  const openOrders =
    countFor(stages, "needs_blanks") +
    countFor(stages, "blanks_ordered") +
    countFor(stages, "in_production") +
    countFor(stages, "ready_to_ship");
  const criticalCount = focusItems.filter((i) => i.tone === "critical").length;
  const metricValue = (n: number) => (flowLoading ? "—" : String(n));

  if (showCeoFinance) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">
            Dashboard
          </h1>
        </header>
        <CombinedLiveStoresPanel />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">
            Dashboard
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1"
            onClick={() => void loadFlow()}
            disabled={flowLoading}
          >
            <RefreshCw className={cn("size-3.5", flowLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" asChild className="gap-1">
            <Link to="/order-flow">
              Order Flow
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DashboardMetricCard label="Open" value={metricValue(openOrders)} hint="All open stages" />
        <DashboardMetricCard
          label="Needs blanks"
          value={metricValue(countFor(stages, "needs_blanks"))}
        />
        <DashboardMetricCard
          label="In production"
          value={metricValue(countFor(stages, "in_production"))}
        />
        <DashboardMetricCard
          label="Ready to ship"
          value={metricValue(countFor(stages, "ready_to_ship"))}
        />
      </section>

      <section>
        <DashboardSectionHeader title="Jump into work" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <DashboardCtaCard
            title="Order Flow"
            description="Move orders through blanks, production, and ship."
            to="/order-flow"
          />
          <DashboardCtaCard
            title="Shop supplies"
            description="Track tags, DTF, bags, and apply materials."
            to="/shop-supplies"
          />
          <DashboardCtaCard
            title="My Tasks"
            description="Personal priorities for this shift."
            to="/my-tasks"
          />
        </div>
      </section>

      {flowError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {flowError}
        </div>
      ) : null}

      <section>
        <DashboardSectionHeader title="Shift notes" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
            <p className="text-sm font-medium text-gray-500">Priorities</p>
            {homeContent.priorities.length > 0 ? (
              <ul className="mt-3 space-y-2.5">
                {homeContent.priorities.map((item) => (
                  <li key={item} className="text-sm leading-snug text-gray-700">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-gray-500">No new priorities at the moment</p>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-gray-500">Due today</p>
              {homeContent.tasksDueToday.length > 0 ? (
                <span className="text-xs font-medium text-gray-400">
                  {homeContent.tasksDueToday.filter((item) => dueTodayDone[item]).length}/
                  {homeContent.tasksDueToday.length}
                </span>
              ) : null}
            </div>
            <ul className="mt-3 space-y-2.5">
              {homeContent.tasksDueToday.map((item) => {
                const done = Boolean(dueTodayDone[item]);
                const id = `due-today-${item}`;
                return (
                  <li key={item}>
                    <label
                      htmlFor={id}
                      className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug text-gray-700"
                    >
                      <Checkbox
                        id={id}
                        checked={done}
                        onCheckedChange={(value) => {
                          if (!userId) return;
                          setDueTodayDone(
                            toggleShiftDueTodayItem(
                              userId,
                              item,
                              Boolean(value),
                              dueTodayDone,
                            ),
                          );
                        }}
                        className="mt-0.5 rounded-full border-gray-300 bg-transparent shadow-none data-[state=checked]:border-brand data-[state=checked]:bg-transparent data-[state=checked]:text-brand"
                      />
                      <span className={cn(done && "text-gray-400 line-through decoration-gray-300")}>
                        {item}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-gray-500">My Tasks</p>
              <Link
                to="/my-tasks"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
              >
                <CheckSquare className="size-3" />
                View all
              </Link>
            </div>
            {shiftMyTasks.length > 0 ? (
              <ul className="mt-3 space-y-2.5">
                {shiftMyTasks.map((task) => (
                  <li key={task.id}>
                    <Link
                      to="/my-tasks"
                      className="block text-sm leading-snug text-gray-700 transition-colors hover:text-brand"
                    >
                      <span className="font-medium text-gray-900">{task.title}</span>
                      <span className="mt-0.5 block text-xs text-gray-400">
                        {TASK_STATUS_LABELS[task.status]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-gray-500">
                No personal tasks yet.{" "}
                <Link to="/my-tasks" className="font-semibold text-brand hover:underline">
                  Create one
                </Link>
              </p>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
            <p className="text-sm font-medium text-gray-500">Open issues</p>
            <ul className="mt-3 space-y-2.5">
              {homeContent.openIssues.map((item) => (
                <li key={item} className="text-sm leading-snug text-gray-700">
                  {item}
                </li>
              ))}
              <li className="text-sm text-gray-500">
                Docs needing update:{" "}
                <span className="font-semibold text-gray-800">
                  {topSops.filter((sop) => sop.status !== "Active").length}
                </span>
              </li>
            </ul>
            <div className="mt-4 space-y-1 border-t border-gray-100 pt-3">
              {homeContent.quickLinks.map((item) => (
                <Link
                  key={`${item.label}-${item.to}`}
                  to={item.to}
                  className="flex items-center justify-between text-sm font-semibold text-gray-900 hover:text-brand"
                >
                  <span className="truncate">{item.label}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="lg:col-span-7">
          <DashboardSectionHeader
            title="Work queue"
            description={
              criticalCount > 0 ? `${criticalCount} critical` : undefined
            }
          />
          {flowLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-10 text-sm text-gray-500 shadow-xs">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading queue…
            </div>
          ) : (
            <ul className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs">
              {focusItems.map((item, index) => (
                <li key={item.id} className={cn(index > 0 && "border-t border-gray-100")}>
                  <DashboardListRow
                    title={item.title}
                    meta={item.detail}
                    to={item.to}
                    tone={item.tone}
                    trailing={typeof item.count === "number" ? item.count : undefined}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" asChild className="gap-1">
              <Link to="/order-flow?stage=needs_blanks">
                <Shirt className="size-3.5" />
                Blanks list
              </Link>
            </Button>
            <Button size="sm" variant="secondary" asChild className="gap-1">
              <Link to="/order-flow?stage=ready_to_ship">
                <Truck className="size-3.5" />
                Shipping queue
              </Link>
            </Button>
            <Button size="sm" variant="secondary" asChild className="gap-1">
              <Link to="/shop-supplies">
                <Boxes className="size-3.5" />
                Shop supplies
              </Link>
            </Button>
          </div>
        </section>

        <section className="lg:col-span-5">
          <DashboardSectionHeader title="Pipeline" />
          <ul className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs">
            {PIPELINE.map(({ id, icon: Icon }, index) => {
              const n = countFor(stages, id);
              return (
                <li key={id} className={cn(index > 0 && "border-t border-gray-100")}>
                  <DashboardListRow
                    title={STAGE_LABELS[id]}
                    meta="Open Order Flow"
                    to={`/order-flow?stage=${id}`}
                    icon={<Icon className="h-4 w-4" strokeWidth={1.75} />}
                    trailing={flowLoading ? "—" : n}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
