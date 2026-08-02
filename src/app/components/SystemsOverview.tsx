import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
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
import { ChevronRight, Loader2 } from "lucide-react";
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

function buildPastDueItems(orders: OrderFlowOrder[]): FocusItem[] {
  const overdue = orders.filter(
    (o) => o.stage !== "shipped" && o.deadlineState === "overdue",
  ).length;
  const dueToday = orders.filter(
    (o) => o.stage !== "shipped" && o.deadlineState === "due_today",
  ).length;
  const highPriority = orders.filter((o) => o.highPriority).length;
  const earlyWarning = orders.filter((o) => o.earlyWarning).length;

  const items: FocusItem[] = [];

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
  if (highPriority > 0) {
    items.push({
      id: "high-priority",
      title: "Orders past 7 days",
      detail: "Open work older than a week.",
      tone: "critical",
      to: "/order-flow",
      count: highPriority,
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
  if (earlyWarning > 0) {
    items.push({
      id: "early-warning",
      title: "Approaching late",
      detail: "3+ days old — move before they go past due.",
      tone: "action",
      to: "/order-flow",
      count: earlyWarning,
    });
  }

  return items;
}

function buildOrderedItems(stages: OrderFlowStageCount[]): FocusItem[] {
  const blanksOrdered = countFor(stages, "blanks_ordered");
  if (blanksOrdered <= 0) return [];
  return [
    {
      id: "blanks-ordered",
      title: "Blanks ordered",
      detail: "Purchase placed — waiting to arrive.",
      tone: "action",
      to: "/order-flow?stage=blanks_ordered",
      count: blanksOrdered,
    },
  ];
}

function PriorityRow({
  title,
  meta,
  count,
  to,
}: {
  title: string;
  meta?: string;
  count?: number;
  to: string;
}) {
  return (
    <li className="border-b border-black/[0.06]">
      <Link
        to={to}
        className="flex items-center gap-3.5 py-4 transition-opacity hover:opacity-70"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-medium leading-snug tracking-[-0.01em] text-gray-950">
            {title}
          </span>
          {meta ? (
            <span className="mt-0.5 block text-[13px] text-gray-400">{meta}</span>
          ) : null}
        </span>
        {typeof count === "number" ? (
          <span className="shrink-0 text-[17px] font-normal tabular-nums text-gray-400">
            {count}
          </span>
        ) : null}
        <ChevronRight className="size-5 shrink-0 text-gray-300" strokeWidth={1.5} />
      </Link>
    </li>
  );
}

function PriorityGroup({
  title,
  empty,
  loading,
  children,
}: {
  title: string;
  empty?: string;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-1 text-[13px] font-medium tracking-wide text-gray-400">
        {title}
      </h2>
      {loading ? (
        <div className="flex items-center gap-2 border-t border-black/[0.06] py-8 text-[15px] text-gray-400">
          <Loader2 className="size-4 animate-spin" />
          Updating…
        </div>
      ) : children != null &&
        !(Array.isArray(children) && children.length === 0) ? (
        <ul className="border-t border-black/[0.06]">{children}</ul>
      ) : (
        <p className="border-t border-black/[0.06] py-5 text-[15px] text-gray-400">
          {empty ?? "None"}
        </p>
      )}
    </div>
  );
}

const PIPELINE: OrderFlowStage[] = [
  "needs_blanks",
  "blanks_ordered",
  "in_production",
  "ready_to_ship",
];

/** Same key as Support inbox first-time example escalation. */
const SUPPORT_EXAMPLE_DISMISS_KEY = "fgg.support.exampleEscalation.dismissed";

type PriorityTodo = {
  id: string;
  source: string;
  label: string;
  tone: "action" | "critical";
  to: string;
};

function readSupportExampleActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SUPPORT_EXAMPLE_DISMISS_KEY) !== "1";
  } catch {
    return true;
  }
}

function buildImportantMessages(supportExampleActive: boolean): PriorityTodo[] {
  const items: PriorityTodo[] = [];
  if (supportExampleActive) {
    items.push({
      id: "support-example-alex-rivera",
      source: "Support",
      label: "1 new message to reply to",
      tone: "action",
      to: "/support",
    });
  }
  return items;
}

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
  const [supportExampleActive, setSupportExampleActive] = useState(readSupportExampleActive);

  const loadHome = useCallback(() => {
    setHomeContent(OperatorDashboardStorage.getContent());
    setMyTasks(loadMyTasks(userId));
    setDueTodayDone(loadShiftDueTodayDone(userId));
    setSupportExampleActive(readSupportExampleActive());
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
      setFlowError(err instanceof Error ? err.message : "Could not load live orders");
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
    window.addEventListener("fgg-support-escalation-changed", loadHome);
    return () => {
      window.removeEventListener("fgg-storage-sync", loadHome);
      window.removeEventListener("fgg-support-escalation-changed", loadHome);
    };
  }, [loadHome]);

  const showCeoFinance = !authLoading && isCeo;
  const pastDueItems = useMemo(() => buildPastDueItems(orders), [orders]);
  const orderedItems = useMemo(() => buildOrderedItems(stages), [stages]);
  const importantMessages = useMemo(
    () => buildImportantMessages(supportExampleActive),
    [supportExampleActive],
  );
  const shiftMyTasks = useMemo(
    () => getActivePersonalTasks(myTasks).slice(0, 5),
    [myTasks],
  );
  const openOrders =
    countFor(stages, "needs_blanks") +
    countFor(stages, "blanks_ordered") +
    countFor(stages, "in_production") +
    countFor(stages, "ready_to_ship");
  const metricValue = (n: number) => (flowLoading ? "—" : String(n));

  if (showCeoFinance) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-[26px] font-semibold leading-[1.2] tracking-[-0.22px] text-gray-900">
            Dashboard
          </h1>
        </header>
        <CombinedLiveStoresPanel />
      </div>
    );
  }

  const prioritiesOpenCount =
    importantMessages.length +
    (flowLoading ? 0 : pastDueItems.length + orderedItems.length);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-14 pb-10">
      <header className="flex items-baseline justify-between gap-4 pt-2">
        <h1 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-gray-950">
          Priorities
        </h1>
        <div className="flex items-center gap-4 text-[13px]">
          <span className="tabular-nums text-gray-400">
            {flowLoading ? "…" : prioritiesOpenCount}
          </span>
          <button
            type="button"
            onClick={() => void loadFlow()}
            disabled={flowLoading}
            className="font-medium text-brand hover:opacity-80 disabled:opacity-40"
          >
            Refresh
          </button>
        </div>
      </header>

      {flowError ? (
        <p className="text-[15px] text-red-600">{flowError}</p>
      ) : null}

      <section className="space-y-10">
        <PriorityGroup title="Important messages" empty="No important messages">
          {importantMessages.length > 0
            ? importantMessages.map((item) => (
                <PriorityRow
                  key={item.id}
                  title={item.label}
                  meta={item.source}
                  to={item.to}
                />
              ))
            : null}
        </PriorityGroup>

        <PriorityGroup
          title="Orders past due"
          loading={flowLoading}
          empty="No past-due orders"
        >
          {!flowLoading && pastDueItems.length > 0
            ? pastDueItems.map((item) => (
                <PriorityRow
                  key={item.id}
                  title={item.title}
                  meta={item.detail}
                  count={item.count}
                  to={item.to}
                />
              ))
            : null}
        </PriorityGroup>

        <PriorityGroup
          title="Ordered"
          loading={flowLoading}
          empty="No blanks on order"
        >
          {!flowLoading && orderedItems.length > 0
            ? orderedItems.map((item) => (
                <PriorityRow
                  key={item.id}
                  title={item.title}
                  meta={item.detail}
                  count={item.count}
                  to={item.to}
                />
              ))
            : null}
        </PriorityGroup>
      </section>

      <section>
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 text-[13px]">
          {(
            [
              ["Open", openOrders],
              ["Needs blanks", countFor(stages, "needs_blanks")],
              ["In production", countFor(stages, "in_production")],
              ["Ready to ship", countFor(stages, "ready_to_ship")],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="min-w-[4.5rem]">
              <p className="text-gray-400">{label}</p>
              <p className="mt-1 text-[22px] font-semibold tracking-[-0.02em] tabular-nums text-gray-950">
                {metricValue(value)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-10 sm:grid-cols-2">
        <div>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-[13px] font-medium text-gray-400">Due today</h2>
            {homeContent.tasksDueToday.length > 0 ? (
              <span className="text-[13px] tabular-nums text-gray-300">
                {homeContent.tasksDueToday.filter((item) => dueTodayDone[item]).length}/
                {homeContent.tasksDueToday.length}
              </span>
            ) : null}
          </div>
          <ul className="space-y-3">
            {homeContent.tasksDueToday.map((item) => {
              const done = Boolean(dueTodayDone[item]);
              return (
                <li key={item}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!userId) return;
                      setDueTodayDone(
                        toggleShiftDueTodayItem(
                          userId,
                          item,
                          !done,
                          dueTodayDone,
                        ),
                      );
                    }}
                    className={cn(
                      "text-left text-[15px] leading-snug transition-opacity hover:opacity-70",
                      done
                        ? "text-gray-400 line-through decoration-gray-300"
                        : "text-gray-800",
                    )}
                  >
                    {item}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-[13px] font-medium text-gray-400">My Tasks</h2>
            <Link
              to="/my-tasks"
              className="text-[13px] font-medium text-brand hover:opacity-80"
            >
              All
            </Link>
          </div>
          {shiftMyTasks.length > 0 ? (
            <ul className="space-y-3">
              {shiftMyTasks.map((task) => (
                <li key={task.id}>
                  <Link
                    to="/my-tasks"
                    className="block text-[15px] leading-snug text-gray-800 transition-opacity hover:opacity-70"
                  >
                    {task.title}
                    <span className="mt-0.5 block text-[13px] text-gray-400">
                      {TASK_STATUS_LABELS[task.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] text-gray-400">
              No personal tasks.{" "}
              <Link to="/my-tasks" className="font-medium text-brand hover:opacity-80">
                Add one
              </Link>
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[13px] font-medium text-gray-400">Pipeline</h2>
        <ul>
          {PIPELINE.map((id, index) => {
            const n = countFor(stages, id);
            return (
              <li
                key={id}
                className={cn(
                  "border-b border-black/[0.06]",
                  index === 0 && "border-t",
                )}
              >
                <Link
                  to={`/order-flow?stage=${id}`}
                  className="flex items-center justify-between gap-3 py-3.5 text-[15px] transition-opacity hover:opacity-70"
                >
                  <span className="font-medium text-gray-950">
                    {STAGE_LABELS[id]}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums text-gray-400">
                      {flowLoading ? "—" : n}
                    </span>
                    <ChevronRight
                      className="size-4 text-gray-300"
                      strokeWidth={1.5}
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {(homeContent.openIssues.length > 0 ||
          topSops.some((sop) => sop.status !== "Active")) && (
          <p className="mt-6 text-[13px] text-gray-400">
            {homeContent.openIssues[0] ? `${homeContent.openIssues[0]}. ` : null}
            Docs needing update:{" "}
            <span className="text-gray-600">
              {topSops.filter((sop) => sop.status !== "Active").length}
            </span>
          </p>
        )}
      </section>
    </div>
  );
}
