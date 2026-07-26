import {
  myTasksStorageKey,
  writeLocalAndSync,
} from "@/lib/synced-storage";

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export type MyTask = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const BOARD_COLUMNS: TaskStatus[] = ["todo", "in_progress", "done"];

export { MY_TASKS_KEY_PREFIX, myTasksStorageKey } from "@/lib/synced-storage";

function nowIso(): string {
  return new Date().toISOString();
}

/** Starter cards for a brand-new user — instructional, not real floor work. */
function seedGuideTasks(): MyTask[] {
  const now = nowIso();
  return [
    {
      id: "guide-add-task",
      title: "Add your task here",
      description:
        "This board is yours alone. Click this card to rename it, change status, or delete it — or use Add task above to create a new one.",
      status: "todo",
      priority: "medium",
      dueDate: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "guide-move-status",
      title: "Move work as you go",
      description:
        "Open a task and set Status to In progress or Done. Your order and choices stay saved for your account.",
      status: "in_progress",
      priority: "low",
      dueDate: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "guide-customize",
      title: "Make this board yours",
      description:
        "Delete these guide cards when you’re ready. Everything you add after that is personal to your login.",
      status: "done",
      priority: "low",
      dueDate: null,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function isTask(value: unknown): value is MyTask {
  if (!value || typeof value !== "object") return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.title === "string" &&
    typeof t.description === "string" &&
    (t.status === "todo" || t.status === "in_progress" || t.status === "done") &&
    (t.priority === "low" || t.priority === "medium" || t.priority === "high") &&
    (t.dueDate === null || typeof t.dueDate === "string") &&
    typeof t.createdAt === "string" &&
    typeof t.updatedAt === "string"
  );
}

function parseTasks(raw: string | null): MyTask[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const tasks = parsed.filter(isTask);
    return tasks.length > 0 ? tasks : null;
  } catch {
    return null;
  }
}

/**
 * Load the personal task list for a signed-in user.
 * New users get instructional guide cards; existing lists keep order and edits.
 */
export function loadMyTasks(userId: string | null | undefined): MyTask[] {
  if (!userId?.trim()) return [];
  if (typeof window === "undefined") return seedGuideTasks();

  const key = myTasksStorageKey(userId);
  const existing = parseTasks(window.localStorage.getItem(key));
  if (existing) return existing;

  const seeded = seedGuideTasks();
  saveMyTasks(userId, seeded);
  return seeded;
}

export function saveMyTasks(userId: string | null | undefined, tasks: MyTask[]): void {
  if (!userId?.trim() || typeof window === "undefined") return;
  writeLocalAndSync(myTasksStorageKey(userId), JSON.stringify(tasks));
}

export function createMyTask(input: {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
}): MyTask {
  const stamp = nowIso();
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: input.title.trim(),
    description: (input.description ?? "").trim(),
    status: input.status ?? "todo",
    priority: input.priority ?? "medium",
    dueDate: input.dueDate ?? null,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** Update in place so list order stays stable. */
export function upsertMyTask(tasks: MyTask[], next: MyTask): MyTask[] {
  const idx = tasks.findIndex((t) => t.id === next.id);
  if (idx === -1) return [...tasks, next];
  const copy = tasks.slice();
  copy[idx] = { ...next, updatedAt: nowIso() };
  return copy;
}

export function removeMyTask(tasks: MyTask[], id: string): MyTask[] {
  return tasks.filter((t) => t.id !== id);
}

export function tasksByStatus(tasks: MyTask[], status: TaskStatus): MyTask[] {
  return tasks.filter((t) => t.status === status);
}
