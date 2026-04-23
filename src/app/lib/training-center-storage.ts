import { writeLocalAndSync } from "@/lib/synced-storage";
import {
  TRAINING_MODULE_CATALOG,
  RECOMMENDED_LEARNING_PATH,
  type TrainingModule,
  type TrainingProgressStatus,
} from "./training-center-data";

const OVERRIDES_KEY = "training-center-module-overrides-v1";
const CUSTOM_MODULES_KEY = "training-center-custom-modules-v1";
const PROGRESS_KEY = "training-center-progress-v1";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function loadOverrides(): Record<string, Partial<TrainingModule>> {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    return isRecord(p) ? (p as Record<string, Partial<TrainingModule>>) : {};
  } catch {
    return {};
  }
}

function mergeModule(base: TrainingModule, patch: Partial<TrainingModule> | undefined): TrainingModule {
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    linkedSops: patch.linkedSops ?? base.linkedSops,
    linkedResources: patch.linkedResources ?? base.linkedResources,
  };
}

function loadCustomModules(): TrainingModule[] {
  try {
    const raw = localStorage.getItem(CUSTOM_MODULES_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p.filter((m): m is TrainingModule => isRecord(m) && typeof m.id === "string" && typeof m.title === "string");
  } catch {
    return [];
  }
}

export function getTrainingModules(): TrainingModule[] {
  const overrides = loadOverrides();
  const fromCatalog = TRAINING_MODULE_CATALOG.map((m) => mergeModule(m, overrides[m.id]));
  const catalogIds = new Set(TRAINING_MODULE_CATALOG.map((m) => m.id));
  const extras = loadCustomModules()
    .filter((m) => !catalogIds.has(m.id))
    .map((m) => mergeModule(m, overrides[m.id]));
  return [...fromCatalog, ...extras];
}

export function getTrainingModuleById(id: string | undefined): TrainingModule | undefined {
  if (!id) return undefined;
  return getTrainingModules().find((m) => m.id === id);
}

export function getRecommendedPathModules(): TrainingModule[] {
  const all = getTrainingModules();
  const byId = new Map(all.map((m) => [m.id, m]));
  return RECOMMENDED_LEARNING_PATH.map((id) => byId.get(id)).filter((m): m is TrainingModule => Boolean(m));
}

const VALID_PROGRESS: TrainingProgressStatus[] = ["not_started", "in_progress", "completed"];

function isProgressStatus(v: unknown): v is TrainingProgressStatus {
  return typeof v === "string" && (VALID_PROGRESS as string[]).includes(v);
}

/** Per-browser progress map; safe to extend later with user accounts. */
export function getAllProgress(): Record<string, TrainingProgressStatus> {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!isRecord(p)) return {};
    const out: Record<string, TrainingProgressStatus> = {};
    for (const [k, v] of Object.entries(p)) {
      if (isProgressStatus(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function getModuleProgress(moduleId: string): TrainingProgressStatus {
  return getAllProgress()[moduleId] ?? "not_started";
}

export function setModuleProgress(moduleId: string, status: TrainingProgressStatus): void {
  const next = { ...getAllProgress(), [moduleId]: status };
  writeLocalAndSync(PROGRESS_KEY, JSON.stringify(next));
}

export function saveModuleOverride(id: string, patch: Partial<TrainingModule>): void {
  const all = loadOverrides();
  const prev = all[id] ?? {};
  all[id] = { ...prev, ...patch };
  writeLocalAndSync(OVERRIDES_KEY, JSON.stringify(all));
}

export function saveCustomTrainingModule(module: TrainingModule): void {
  if (TRAINING_MODULE_CATALOG.some((m) => m.id === module.id)) {
    saveModuleOverride(module.id, module);
    return;
  }
  const list = loadCustomModules().filter((m) => m.id !== module.id);
  list.push(module);
  writeLocalAndSync(CUSTOM_MODULES_KEY, JSON.stringify(list));
}
