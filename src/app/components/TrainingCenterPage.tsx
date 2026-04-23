import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Circle,
  GraduationCap,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import {
  getTrainingModules,
  getRecommendedPathModules,
  getAllProgress,
  type TrainingProgressStatus,
} from "../lib/training-center-storage";
import type { TrainingModule, TrainingModuleCategory } from "../lib/training-center-data";
import { TRAINING_MODULE_CATEGORIES } from "../lib/training-center-data";

function progressLabel(s: TrainingProgressStatus): string {
  switch (s) {
    case "completed":
      return "Completed";
    case "in_progress":
      return "In progress";
    default:
      return "Not started";
  }
}

function progressBadgeClass(s: TrainingProgressStatus): string {
  switch (s) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "in_progress":
      return "border-blue-200 bg-blue-50 text-blue-900";
    default:
      return "border-gray-200 bg-gray-50 text-gray-700";
  }
}

function publishBadgeClass(status: TrainingModule["status"]): string {
  switch (status) {
    case "Published":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "Draft":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "Needs Refresh":
      return "border-orange-200 bg-orange-50 text-orange-900";
    default:
      return "border-gray-200 bg-gray-50 text-gray-800";
  }
}

function priorityLabel(p: TrainingModule["priority"]): string {
  return p;
}

export function TrainingCenterPage() {
  const { pathname } = useLocation();
  const [modules, setModules] = useState<TrainingModule[]>(() => getTrainingModules());
  const [progress, setProgress] = useState<Record<string, TrainingProgressStatus>>(() => getAllProgress());
  const [categoryFilter, setCategoryFilter] = useState<TrainingModuleCategory | "all">("all");

  useEffect(() => {
    const refresh = () => {
      setModules(getTrainingModules());
      setProgress(getAllProgress());
    };
    refresh();
    window.addEventListener("fgg-storage-sync", refresh);
    return () => window.removeEventListener("fgg-storage-sync", refresh);
  }, [pathname]);

  const progressMap = progress;

  const counts = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    let notStarted = 0;
    for (const m of modules) {
      const s = progressMap[m.id] ?? "not_started";
      if (s === "completed") completed += 1;
      else if (s === "in_progress") inProgress += 1;
      else notStarted += 1;
    }
    return { completed, inProgress, notStarted, total: modules.length };
  }, [modules, progressMap]);

  const filteredModules = useMemo(() => {
    if (categoryFilter === "all") return modules;
    return modules.filter((m) => m.category === categoryFilter);
  }, [modules, categoryFilter]);

  const pathModules = useMemo(() => getRecommendedPathModules(), [pathname, modules]);

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Training Center</h2>
          <p className="mt-1 max-w-2xl text-gray-600">
            Structured onboarding and ongoing learning for Future Garment Group — start with the path below, then dive
            into modules by category.
          </p>
        </div>
      </div>

      {/* Progress summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="flex items-center gap-3 pt-6">
            <CheckCircle2 className="h-9 w-9 shrink-0 text-emerald-600 opacity-90" />
            <div>
              <p className="text-2xl font-semibold text-gray-900">{counts.completed}</p>
              <p className="text-sm text-gray-500">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="flex items-center gap-3 pt-6">
            <PlayCircle className="h-9 w-9 shrink-0 text-blue-600 opacity-90" />
            <div>
              <p className="text-2xl font-semibold text-gray-900">{counts.inProgress}</p>
              <p className="text-sm text-gray-500">In progress</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="flex items-center gap-3 pt-6">
            <Circle className="h-9 w-9 shrink-0 text-gray-400" />
            <div>
              <p className="text-2xl font-semibold text-gray-900">{counts.notStarted}</p>
              <p className="text-sm text-gray-500">Not started</p>
            </div>
          </CardContent>
        </Card>
      </div>
      <p className="-mt-4 text-xs text-gray-500">
        Progress is saved in this browser only — enough for self-tracking and 1:1s until accounts are wired in.
      </p>

      {/* Start Here */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Start here</h3>
        </div>
        <Card className="border-0 border-l-4 border-l-blue-600 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">New employee entry point</CardTitle>
            <CardDescription>
              Read this block once, then open the first module in the recommended path and mark your progress as you go.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-700">
            <p>
              <span className="font-medium text-gray-900">Welcome.</span> You are joining an operations-heavy business
              — the dashboard connects training tracks, SOPs (how work is done), brands (how each line differs), and
              this Training Center (how to learn it in order).
            </p>
            <ul className="list-inside list-disc space-y-1 text-gray-600">
              <li>
                <span className="font-medium text-gray-800">Required order:</span> follow{" "}
                <strong>Recommended learning path</strong> top-to-bottom unless your manager assigns a different track.
              </li>
              <li>
                <span className="font-medium text-gray-800">First steps:</span> open{" "}
                <Link to="/training-center/welcome-start-here" className="font-medium text-blue-600 hover:underline">
                  Start Here — Welcome to FGG
                </Link>
                , then continue down the path.
              </li>
              <li>
                <span className="font-medium text-gray-800">Systems to understand:</span>{" "}
                <Link to="/" className="text-blue-600 hover:underline">
                  All Systems
                </Link>
                ,{" "}
                <Link to="/sops" className="text-blue-600 hover:underline">
                  SOPs
                </Link>
                , and{" "}
                <Link to="/brand-hub" className="text-blue-600 hover:underline">
                  Brand Hub
                </Link>{" "}
                — each has a distinct job; this center explains when to use which.
              </li>
            </ul>
            <Button className="mt-2 gap-2" asChild>
              <Link to="/training-center/welcome-start-here">
                Begin required reading
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Recommended path */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Recommended learning path</h3>
        </div>
        <p className="text-sm text-gray-600">
          Suggested sequence for new hires — click a step to open the module and set your status on the detail page.
        </p>
        <ol className="space-y-2">
          {pathModules.map((m, index) => {
            const s = progressMap[m.id] ?? "not_started";
            return (
              <li key={m.id}>
                <Link
                  to={`/training-center/${m.id}`}
                  className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white/90 p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{m.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-gray-500">{m.shortDescription}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`text-xs font-medium ${progressBadgeClass(s)}`}>
                        {progressLabel(s)}
                      </Badge>
                      <span className="text-xs text-gray-500">~{m.estimatedMinutes} min</span>
                    </div>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-gray-400" />
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      {/* All modules */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Training modules</h3>
          </div>
          <div className="flex flex-col gap-1 sm:w-64">
            <Label htmlFor="tc-category" className="text-xs text-gray-500">
              Category
            </Label>
            <select
              id="tc-category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as TrainingModuleCategory | "all")}
              className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
            >
              <option value="all">All categories</option>
              {TRAINING_MODULE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredModules.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 px-4 py-10 text-center text-sm text-gray-600">
            No modules in this category yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredModules.map((m) => {
              const s = progressMap[m.id] ?? "not_started";
              return (
                <Card key={m.id} className="overflow-hidden border-0 shadow-sm transition-shadow hover:shadow-md">
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <Badge variant="outline" className="text-xs font-normal text-gray-600">
                        {m.category}
                      </Badge>
                      <Badge variant="outline" className={`text-xs font-medium ${publishBadgeClass(m.status)}`}>
                        {m.status}
                      </Badge>
                    </div>
                    <CardTitle className="pt-1 text-base leading-snug">{m.title}</CardTitle>
                    <CardDescription className="line-clamp-3">{m.shortDescription}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className={`text-xs font-medium ${progressBadgeClass(s)}`}>
                        {progressLabel(s)}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {priorityLabel(m.priority)} priority
                      </Badge>
                      <span className="text-xs text-gray-500">~{m.estimatedMinutes} min</span>
                    </div>
                    <Button variant="secondary" className="w-full gap-2" asChild>
                      <Link to={`/training-center/${m.id}`}>
                        Open module
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
