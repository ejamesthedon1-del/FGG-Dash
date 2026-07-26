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
  Loader2,
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
      title: "Blanks ordered",
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

  if (showCeoFinance) {
    return (
      <div className="space-y-5">
        <header>
          <h2 className="text-[1.75rem] font-semibold tracking-tight text-gray-950">
            Dashboard
          </h2>
        </header>
        <CombinedLiveStoresPanel />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Workspace header */}
      <header className="flex flex-col gap-4 border-b border-gray-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[1.75rem] font-semibold tracking-tight text-gray-950">
            Dashboard
          </h2>
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

      {/* Shift notes — first thing on the floor brief */}
      <section>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-gray-950">Shift notes</h3>
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
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Due today
              </p>
              {homeContent.tasksDueToday.length > 0 ? (
                <span className="text-[11px] font-medium text-gray-400">
                  {
                    homeContent.tasksDueToday.filter((item) => dueTodayDone[item])
                      .length
                  }
                  /{homeContent.tasksDueToday.length}
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
                        className="mt-0.5 rounded-full border-gray-300 bg-transparent shadow-none data-[state=checked]:border-brand data-[state=checked]:bg-transparent data-[state=checked]:text-brand dark:bg-transparent dark:data-[state=checked]:bg-transparent"
                      />
                      <span
                        className={cn(
                          done && "text-gray-400 line-through decoration-gray-300",
                        )}
                      >
                        {item}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="bg-white p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                My Tasks
              </p>
              <Link
                to="/my-tasks"
                className="text-[11px] font-medium text-gray-400 transition-colors hover:text-brand"
              >
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
                      <span className="mt-0.5 block text-[11px] text-gray-400">
                        {TASK_STATUS_LABELS[task.status]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-gray-500">
                No personal tasks yet. Create a{" "}
                <Link
                  to="/my-tasks"
                  className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-2 transition-colors hover:text-brand hover:decoration-brand"
                >
                  task
                </Link>{" "}
                to track your priorities for this shift.
              </p>
            )}
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
                className="flex items-center justify-between text-base font-medium text-gray-900 hover:text-brand"
              >
                Order Flow
                <ArrowRight className="h-3.5 w-3.5 text-gray-300" />
              </Link>
              <Link
                to="/sops"
                className="flex items-center justify-between text-base font-medium text-gray-900 hover:text-brand"
              >
                Knowledge Base
                <ArrowRight className="h-3.5 w-3.5 text-gray-300" />
              </Link>
              {homeContent.quickLinks.map((item) => (
                <Link
                  key={`${item.label}-${item.to}`}
                  to={item.to}
                  className="flex items-center justify-between text-base font-medium text-gray-900 hover:text-brand"
                >
                  <span className="truncate">{item.label}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* KPI strip — denser, less “card toy” */}
      <section className="grid grid-cols-2 divide-x divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
        {[
          { label: "Open", value: openOrders },
          { label: "Needs blanks", value: countFor(stages, "needs_blanks") },
          { label: "Blanks ordered", value: countFor(stages, "blanks_ordered") },
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
              <h3 className="text-base font-semibold text-gray-950">Work queue</h3>
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
                        <p className="text-base font-medium text-gray-950">{item.title}</p>
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
            <h3 className="text-base font-semibold text-gray-950">Pipeline</h3>
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
                    <p className="text-base font-medium text-gray-950">{STAGE_LABELS[id]}</p>
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
    </div>
  );
}
