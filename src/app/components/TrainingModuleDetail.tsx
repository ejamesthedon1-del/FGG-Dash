import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ArrowLeft, BookMarked, ChevronRight, ExternalLink, FileText, ListChecks } from "lucide-react";
import { toast } from "sonner";
import {
  getTrainingModuleById,
  getModuleProgress,
  setModuleProgress,
} from "../lib/training-center-storage";
import type { TrainingModule, TrainingProgressStatus } from "../lib/training-center-data";

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

export function TrainingModuleDetail() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  const [module, setModule] = useState<TrainingModule | null>(null);
  const [progress, setProgress] = useState<TrainingProgressStatus>("not_started");

  useEffect(() => {
    const load = () => {
      const m = getTrainingModuleById(moduleId);
      if (!m) {
        toast.error("Training module not found");
        navigate("/training-center", { replace: true });
        return;
      }
      setModule(m);
      setProgress(getModuleProgress(m.id));
    };
    load();
    window.addEventListener("fgg-storage-sync", load);
    return () => window.removeEventListener("fgg-storage-sync", load);
  }, [moduleId, navigate]);

  const onProgressChange = (value: TrainingProgressStatus) => {
    if (!module) return;
    setModuleProgress(module.id, value);
    setProgress(value);
    toast.success(`Marked as ${progressLabel(value)}`);
  };

  if (!module) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-500">Loading…</div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" className="w-fit gap-1.5 px-0 text-gray-600" asChild>
          <Link to="/training-center">
            <ArrowLeft className="h-4 w-4" />
            Training Center
          </Link>
        </Button>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-semibold text-gray-900">{module.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{module.category}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={`font-medium ${publishBadgeClass(module.status)}`}>
              {module.status}
            </Badge>
            <Badge variant="secondary">{module.priority} priority</Badge>
            <span className="inline-flex items-center rounded-md border border-gray-200 bg-white px-2.5 py-0.5 text-xs text-gray-600">
              ~{module.estimatedMinutes} min
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="h-4 w-4 text-blue-600" />
                Learning objective
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-gray-800">{module.learningObjective}</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Module content</CardTitle>
              <CardDescription>Read through, then update your completion status on the right.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap rounded-lg bg-gray-50/80 p-4 text-sm leading-relaxed text-gray-800">
                {module.content.trim() ? (
                  module.content
                ) : (
                  <span className="text-gray-400">Content will be added for this module.</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-blue-600" />
                Linked SOPs
              </CardTitle>
              <CardDescription>Jump to procedures referenced in this module.</CardDescription>
            </CardHeader>
            <CardContent>
              {module.linkedSops.length > 0 ? (
                <ul className="space-y-2">
                  {module.linkedSops.map((link) => (
                    <li key={link.label + link.href}>
                      <Link
                        to={link.href}
                        className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-100"
                      >
                        <span className="min-w-0 truncate">{link.label}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-dashed border-gray-200 bg-gray-50/60 px-3 py-4 text-sm text-gray-500">
                  No SOP links yet — add via catalog or overrides when ready.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookMarked className="h-4 w-4 text-blue-600" />
                Related resources
              </CardTitle>
            </CardHeader>
            <CardContent>
              {module.linkedResources.length > 0 ? (
                <ul className="space-y-2">
                  {module.linkedResources.map((link) => (
                    <li key={link.label + link.href}>
                      {link.external || link.href.startsWith("http") ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-100"
                        >
                          <span className="min-w-0 truncate">{link.label}</span>
                          <ExternalLink className="h-4 w-4 shrink-0 text-gray-400" />
                        </a>
                      ) : (
                        <Link
                          to={link.href}
                          className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-100"
                        >
                          <span className="min-w-0 truncate">{link.label}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-dashed border-gray-200 bg-gray-50/60 px-3 py-4 text-sm text-gray-500">
                  No extra resources linked yet.
                </p>
              )}
            </CardContent>
          </Card>

          {module.notesTakeaways?.trim() ? (
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Key takeaways</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{module.notesTakeaways}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="lg:col-span-1">
          <Card className="sticky top-6 border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Your progress</CardTitle>
              <CardDescription>Stored on this device — Not started, In progress, or Completed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Badge variant="outline" className={`font-medium ${progressBadgeClass(progress)}`}>
                {progressLabel(progress)}
              </Badge>
              <div className="space-y-2">
                <Label htmlFor="progress-select">Update status</Label>
                <Select value={progress} onValueChange={(v) => onProgressChange(v as TrainingProgressStatus)}>
                  <SelectTrigger id="progress-select" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">Not started</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2 border-t border-gray-100 pt-4">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/training-center">Back to all modules</Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/sops">SOP hub</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
