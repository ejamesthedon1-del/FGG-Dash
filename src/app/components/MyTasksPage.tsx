import { useMemo, useState } from "react";
import {
  Calendar,
  CheckSquare,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  BOARD_COLUMNS,
  createMyTask,
  loadMyTasks,
  removeMyTask,
  saveMyTasks,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  tasksByStatus,
  upsertMyTask,
  type MyTask,
  type TaskPriority,
  type TaskStatus,
} from "../lib/my-tasks-storage";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { cn } from "./ui/utils";

type ViewMode = "board" | "list";

function formatDue(dueDate: string | null): string {
  if (!dueDate) return "No due date";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${dueDate}T12:00:00`));
  } catch {
    return dueDate;
  }
}

function statusBadgeClass(status: TaskStatus): string {
  switch (status) {
    case "todo":
      return "bg-gray-100 text-gray-700";
    case "in_progress":
      return "bg-amber-50 text-amber-800";
    case "done":
      return "bg-emerald-50 text-emerald-800";
  }
}

function priorityBadgeClass(priority: TaskPriority): string {
  switch (priority) {
    case "low":
      return "bg-brand-soft text-brand";
    case "medium":
      return "bg-orange-50 text-orange-800";
    case "high":
      return "bg-red-50 text-red-700";
  }
}

function TaskCard({
  task,
  onOpen,
}: {
  task: MyTask;
  onOpen: (task: MyTask) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="w-full rounded-lg border border-gray-200 bg-white p-3.5 text-left transition-colors hover:border-gray-300 hover:bg-gray-50/80"
    >
      <span
        className={cn(
          "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          statusBadgeClass(task.status),
        )}
      >
        {TASK_STATUS_LABELS[task.status]}
      </span>
      <p className="mt-2 text-sm font-semibold text-gray-950">{task.title}</p>
      {task.description ? (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">
          {task.description}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
          <Calendar className="h-3 w-3" />
          {formatDue(task.dueDate)}
        </span>
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
            priorityBadgeClass(task.priority),
          )}
        >
          {TASK_PRIORITY_LABELS[task.priority]}
        </span>
      </div>
    </button>
  );
}

export function MyTasksPage() {
  const [tasks, setTasks] = useState<MyTask[]>(() => loadMyTasks());
  const [view, setView] = useState<ViewMode>("board");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const selected = useMemo(
    () => tasks.find((t) => t.id === selectedId) ?? null,
    [tasks, selectedId],
  );

  const persist = (next: MyTask[]) => {
    setTasks(next);
    saveMyTasks(next);
  };

  const openTask = (task: MyTask) => setSelectedId(task.id);

  const updateSelected = (patch: Partial<MyTask>) => {
    if (!selected) return;
    const next = upsertMyTask(tasks, { ...selected, ...patch });
    persist(next);
  };

  const handleAdd = () => {
    const title = draftTitle.trim();
    if (!title) {
      toast.error("Enter a task title");
      return;
    }
    const task = createMyTask({ title });
    persist([task, ...tasks]);
    setDraftTitle("");
    setSelectedId(task.id);
    toast.success("Task added");
  };

  const handleDelete = () => {
    if (!selected) return;
    persist(removeMyTask(tasks, selected.id));
    setSelectedId(null);
    toast.success("Task deleted");
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-gray-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[1.75rem] font-semibold tracking-tight text-gray-950">
            My Tasks
          </h2>
          <p className="mt-1.5 max-w-xl text-sm text-gray-500">
            Shift work for the floor — track what needs to move today.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="New task title…"
            className="w-52 sm:w-64"
          />
          <Button type="button" size="sm" className="gap-1.5" onClick={handleAdd}>
            <Plus className="h-3.5 w-3.5" />
            Add task
          </Button>
        </div>
      </header>

      <div
        className="flex gap-1 border-b border-gray-200"
        role="tablist"
        aria-label="Tasks view"
      >
        {(
          [
            { id: "board", label: "Board" },
            { id: "list", label: "List" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            onClick={() => setView(tab.id)}
            className={cn(
              "border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors",
              view === tab.id
                ? "border-brand text-brand"
                : "border-transparent text-gray-500 hover:text-gray-800",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {view === "board" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {BOARD_COLUMNS.map((status) => {
            const columnTasks = tasksByStatus(tasks, status);
            return (
              <section key={status} className="min-w-0">
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-950">
                    {TASK_STATUS_LABELS[status]}
                  </h3>
                  <span className="text-xs font-medium text-gray-400">
                    {columnTasks.length}
                  </span>
                </div>
                <div className="space-y-2.5 rounded-lg border border-gray-100 bg-gray-50/80 p-2.5 min-h-[12rem]">
                  {columnTasks.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-gray-400">
                      No tasks
                    </p>
                  ) : (
                    columnTasks.map((task) => (
                      <TaskCard key={task.id} task={task} onOpen={openTask} />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {BOARD_COLUMNS.map((status, index) => {
            const columnTasks = tasksByStatus(tasks, status);
            if (columnTasks.length === 0) return null;
            return (
              <div key={status} className={cn(index > 0 && "border-t border-gray-100")}>
                <p className="bg-gray-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  {TASK_STATUS_LABELS[status]} · {columnTasks.length}
                </p>
                <ul>
                  {columnTasks.map((task) => (
                    <li key={task.id} className="border-t border-gray-50 first:border-t-0">
                      <button
                        type="button"
                        onClick={() => openTask(task)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50/80"
                      >
                        <CheckSquare className="h-4 w-4 shrink-0 text-gray-300" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-950">
                            {task.title}
                          </p>
                          <p className="truncate text-xs text-gray-500">
                            {formatDue(task.dueDate)}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            priorityBadgeClass(task.priority),
                          )}
                        >
                          {TASK_PRIORITY_LABELS[task.priority]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {tasks.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-500">No tasks yet</p>
          ) : null}
        </div>
      )}

      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg"
        >
          {selected ? (
            <>
              <SheetHeader className="border-b border-gray-100 px-6 py-5 pr-12 text-left">
                <SheetTitle className="text-xl font-semibold tracking-tight text-gray-950">
                  {selected.title}
                </SheetTitle>
                <SheetDescription className="text-sm text-gray-500">
                  Created{" "}
                  {new Intl.DateTimeFormat("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(selected.createdAt))}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6 px-6 py-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-500">Status</span>
                    <select
                      className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-900"
                      value={selected.status}
                      onChange={(e) =>
                        updateSelected({ status: e.target.value as TaskStatus })
                      }
                    >
                      {BOARD_COLUMNS.map((status) => (
                        <option key={status} value={status}>
                          {TASK_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-500">Priority</span>
                    <select
                      className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-900"
                      value={selected.priority}
                      onChange={(e) =>
                        updateSelected({ priority: e.target.value as TaskPriority })
                      }
                    >
                      {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map(
                        (priority) => (
                          <option key={priority} value={priority}>
                            {TASK_PRIORITY_LABELS[priority]}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-500">Due date</span>
                    <Input
                      type="date"
                      className="h-8 w-auto"
                      value={selected.dueDate ?? ""}
                      onChange={(e) =>
                        updateSelected({ dueDate: e.target.value || null })
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="task-title" className="text-sm text-gray-500">
                    Title
                  </Label>
                  <Input
                    id="task-title"
                    className="mt-1.5"
                    value={selected.title}
                    onChange={(e) => updateSelected({ title: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="task-description" className="text-sm text-gray-500">
                    Description
                  </Label>
                  <Textarea
                    id="task-description"
                    className="mt-1.5 min-h-[120px]"
                    value={selected.description}
                    onChange={(e) => updateSelected({ description: e.target.value })}
                    placeholder="Add details for this task…"
                  />
                </div>

                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center">
                  <p className="text-sm font-medium text-gray-800">Activity</p>
                  <p className="mt-1 text-sm text-gray-500">Coming soon</p>
                </div>

                <Button
                  type="button"
                  variant="tertiary"
                  className="w-full gap-1.5 text-red-700 hover:bg-red-50"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete task
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
