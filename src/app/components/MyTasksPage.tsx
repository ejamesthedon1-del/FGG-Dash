import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CheckSquare,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/use-auth";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { cn } from "./ui/utils";

type ViewMode = "board" | "list";
type PanelMode = "create" | "edit" | null;

type TaskDraft = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
};

const EMPTY_DRAFT: TaskDraft = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  dueDate: null,
};

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
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [view, setView] = useState<ViewMode>("board");
  const [panel, setPanel] = useState<PanelMode>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(EMPTY_DRAFT);

  useEffect(() => {
    setTasks(loadMyTasks(userId));
    setSelectedId(null);
    setPanel(null);
  }, [userId]);

  useEffect(() => {
    const onSync = () => {
      setTasks(loadMyTasks(userId));
    };
    window.addEventListener("fgg-storage-sync", onSync);
    return () => window.removeEventListener("fgg-storage-sync", onSync);
  }, [userId]);

  const selected = useMemo(
    () => tasks.find((t) => t.id === selectedId) ?? null,
    [tasks, selectedId],
  );

  const persist = (next: MyTask[]) => {
    setTasks(next);
    saveMyTasks(userId, next);
  };

  const openTask = (task: MyTask) => {
    setDraft(EMPTY_DRAFT);
    setSelectedId(task.id);
    setPanel("edit");
  };

  const openCreate = () => {
    setSelectedId(null);
    setDraft(EMPTY_DRAFT);
    setPanel("create");
  };

  const closePanel = () => {
    setPanel(null);
    setSelectedId(null);
    setDraft(EMPTY_DRAFT);
  };

  const updateSelected = (patch: Partial<MyTask>) => {
    if (!selected) return;
    const next = upsertMyTask(tasks, { ...selected, ...patch });
    persist(next);
  };

  const updateDraft = (patch: Partial<TaskDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleCreate = () => {
    const title = draft.title.trim();
    if (!title) {
      toast.error("Enter a task title");
      return;
    }
    if (!userId) {
      toast.error("Sign in to save personal tasks");
      return;
    }
    const task = createMyTask({
      title,
      description: draft.description,
      status: draft.status,
      priority: draft.priority,
      dueDate: draft.dueDate,
    });
    persist([task, ...tasks]);
    setDraft(EMPTY_DRAFT);
    setSelectedId(task.id);
    setPanel("edit");
    toast.success("Task added");
  };

  const handleDelete = () => {
    if (!selected) return;
    persist(removeMyTask(tasks, selected.id));
    closePanel();
    toast.success("Task deleted");
  };

  return (
    <div className="space-y-6">
      <header className="border-b border-gray-200 pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[26px] font-semibold leading-[1.2] tracking-[-0.22px] text-gray-900">
            My Tasks
          </h2>
          <Button type="button" size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            Add task
          </Button>
        </div>
      </header>

      <Tabs
        value={view}
        onValueChange={(v) => setView(v as ViewMode)}
        className="gap-4"
      >
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="list">List</TabsTrigger>
        </TabsList>

        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-6 py-16 text-center">
            <p className="text-base font-semibold text-gray-950">No tasks yet</p>
            <p className="mt-1.5 max-w-sm text-sm text-gray-500">
              Your personal board is empty. Add your first task to start tracking work for the shift.
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-5 gap-1.5"
              onClick={openCreate}
            >
              <Plus className="h-3.5 w-3.5" />
              Add your first task
            </Button>
          </div>
        ) : (
          <>
            <TabsContent value="board">
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
                      <div className="min-h-[12rem] space-y-2.5 rounded-lg border border-gray-100 bg-gray-50/80 p-2.5">
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
            </TabsContent>

            <TabsContent value="list">
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                {BOARD_COLUMNS.map((status, index) => {
                  const columnTasks = tasksByStatus(tasks, status);
                  if (columnTasks.length === 0) return null;
                  return (
                    <div
                      key={status}
                      className={cn(index > 0 && "border-t border-gray-100")}
                    >
                      <p className="bg-gray-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                        {TASK_STATUS_LABELS[status]} · {columnTasks.length}
                      </p>
                      <ul>
                        {columnTasks.map((task) => (
                          <li
                            key={task.id}
                            className="border-t border-gray-50 first:border-t-0"
                          >
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
              </div>
            </TabsContent>
          </>
        )}
      </Tabs>

      <Sheet
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) closePanel();
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg"
        >
          {panel === "create" ? (
            <>
              <SheetHeader className="border-b border-gray-100 px-6 py-5 pr-12 text-left">
                <SheetTitle className="text-xl font-semibold tracking-tight text-gray-950">
                  Add task
                </SheetTitle>
                <SheetDescription className="text-sm text-gray-500">
                  Set the title and details, then save to your personal board.
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6 px-6 py-5">
                <div>
                  <Label htmlFor="new-task-title" className="text-sm text-gray-500">
                    Title
                  </Label>
                  <Input
                    id="new-task-title"
                    className="mt-1.5"
                    value={draft.title}
                    onChange={(e) => updateDraft({ title: e.target.value })}
                    placeholder="What needs to get done?"
                    autoFocus
                  />
                </div>

                <div>
                  <Label htmlFor="new-task-description" className="text-sm text-gray-500">
                    Description
                  </Label>
                  <Textarea
                    id="new-task-description"
                    className="mt-1.5 min-h-[120px]"
                    value={draft.description}
                    onChange={(e) => updateDraft({ description: e.target.value })}
                    placeholder="Add context, steps, or notes…"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-500">Status</span>
                    <select
                      className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-900"
                      value={draft.status}
                      onChange={(e) =>
                        updateDraft({ status: e.target.value as TaskStatus })
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
                      value={draft.priority}
                      onChange={(e) =>
                        updateDraft({ priority: e.target.value as TaskPriority })
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
                      value={draft.dueDate ?? ""}
                      onChange={(e) =>
                        updateDraft({ dueDate: e.target.value || null })
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row-reverse">
                  <Button type="button" className="sm:flex-1" onClick={handleCreate}>
                    Save task
                  </Button>
                  <Button
                    type="button"
                    variant="tertiary"
                    className="sm:flex-1"
                    onClick={closePanel}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </>
          ) : null}

          {panel === "edit" && selected ? (
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
