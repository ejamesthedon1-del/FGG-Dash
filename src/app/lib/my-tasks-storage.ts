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

const KEY = "fgg.my-tasks.v1";

function nowIso(): string {
  return new Date().toISOString();
}

function seedTasks(): MyTask[] {
  const now = nowIso();
  const today = now.slice(0, 10);
  return [
    {
      id: "task-seed-1",
      title: "Clear blanks purchase list",
      description: "Review Needs Blanks queue and confirm purchase order for critical SKUs.",
      status: "todo",
      priority: "high",
      dueDate: today,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "task-seed-2",
      title: "Check ready-to-ship queue",
      description: "Verify labels and packing notes before the afternoon ship cut.",
      status: "in_progress",
      priority: "medium",
      dueDate: today,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "task-seed-3",
      title: "Confirm SOP update note",
      description: "Publish one Knowledge Base update note if any floor procedure changed today.",
      status: "todo",
      priority: "low",
      dueDate: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "task-seed-4",
      title: "Morning station check",
      description: "Walk presses and packing table — mark clear when ready for shift.",
      status: "done",
      priority: "medium",
      dueDate: today,
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

export function loadMyTasks(): MyTask[] {
  if (typeof window === "undefined") return seedTasks();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      const seeded = seedTasks();
      saveMyTasks(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      const seeded = seedTasks();
      saveMyTasks(seeded);
      return seeded;
    }
    const tasks = parsed.filter(isTask);
    if (tasks.length === 0) {
      const seeded = seedTasks();
      saveMyTasks(seeded);
      return seeded;
    }
    return tasks;
  } catch {
    const seeded = seedTasks();
    saveMyTasks(seeded);
    return seeded;
  }
}

export function saveMyTasks(tasks: MyTask[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(tasks));
  } catch {
    /* ignore */
  }
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

export function upsertMyTask(tasks: MyTask[], next: MyTask): MyTask[] {
  const idx = tasks.findIndex((t) => t.id === next.id);
  if (idx === -1) return [next, ...tasks];
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
