export interface Resource {
  id: string;
  type: 'video' | 'image' | 'link' | 'document';
  title: string;
  url: string;
  thumbnail?: string;
  createdAt: string;
}

export interface TrainingSystem {
  id: string;
  title: string;
  description: string;
  category: string;
  resources: Resource[];
  createdAt: string;
  updatedAt: string;
}

import { writeLocalAndSync } from "@/lib/synced-storage";

const STORAGE_KEY = 'training-systems';
const SOPS_STORAGE_KEY = 'training-sops';
const OPERATOR_DASHBOARD_CONTENT_KEY = 'operator-dashboard-content-v1';

export function tryLocalStorageSetItem(key: string, value: string): boolean {
  return writeLocalAndSync(key, value);
}

export interface SOP {
  id: string;
  title: string;
  description: string;
  /** Lifecycle status to help operators spot stale procedures quickly */
  status?: "Draft" | "Active" | "Needs Update";
  /** Optional quick labels, e.g. "returns", "priority", "warehouse" */
  tags?: string[];
  /** Blob URL or public URL for embedded PDF viewer */
  pdfUrl?: string;
  pdfFileName?: string;
  /** Placement in SOPs hierarchy (see `sop-structure.ts`) */
  categoryId?: string;
  menuItemId?: string;
  createdAt: string;
  updatedAt: string;
}

export class SOPsStorage {
  static getSOPs(): SOP[] {
    const stored = localStorage.getItem(SOPS_STORAGE_KEY);
    const list: SOP[] = stored ? JSON.parse(stored) : [];
    return ensureSeededKnowledgeDocs(list);
  }

  static getSOPById(id: string): SOP | undefined {
    return this.getSOPs().find((s) => s.id === id);
  }

  /** Returns false if the browser could not store data (e.g. storage quota exceeded). */
  static saveSOP(sop: SOP): boolean {
    const list = this.getSOPs();
    const i = list.findIndex((s) => s.id === sop.id);
    if (i >= 0) list[i] = sop;
    else list.push(sop);
    return tryLocalStorageSetItem(SOPS_STORAGE_KEY, JSON.stringify(list));
  }

  static deleteSOP(id: string): void {
    writeLocalAndSync(SOPS_STORAGE_KEY, JSON.stringify(this.getSOPs().filter((s) => s.id !== id)));
  }
}

/** Built-in Knowledge Base PDFs shipped with the app (public/). */
const SEEDED_KNOWLEDGE_DOCS: SOP[] = [
  {
    id: "seed-production-guide",
    title: "Ordering DTF gang sheets",
    description: "How to order DTF gang sheets for production.",
    status: "Active",
    tags: ["production", "dtf", "gang-sheets"],
    pdfUrl: "/knowledge-base/production-guide.pdf",
    pdfFileName: "production-guide.pdf",
    categoryId: "production",
    menuItemId: "floor-guides",
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
  },
];

function ensureSeededKnowledgeDocs(list: SOP[]): SOP[] {
  let changed = false;
  const next = [...list];
  for (const seed of SEEDED_KNOWLEDGE_DOCS) {
    const existingIdx = next.findIndex((s) => s.id === seed.id);
    if (existingIdx < 0) {
      next.push(seed);
      changed = true;
      continue;
    }
    // Keep seeded title/description in sync when the shipped doc is renamed.
    const existing = next[existingIdx];
    if (existing.title !== seed.title || existing.description !== seed.description) {
      next[existingIdx] = {
        ...existing,
        title: seed.title,
        description: seed.description,
        tags: seed.tags,
        updatedAt: seed.updatedAt,
      };
      changed = true;
    }
  }
  if (changed) {
    tryLocalStorageSetItem(SOPS_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export class SystemsStorage {
  static getSystems(): TrainingSystem[] {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  static getSystemById(id: string): TrainingSystem | undefined {
    const systems = this.getSystems();
    return systems.find(s => s.id === id);
  }

  /** Returns false if the browser could not store data (e.g. storage quota exceeded). */
  static saveSystem(system: TrainingSystem): boolean {
    const systems = this.getSystems();
    const existingIndex = systems.findIndex(s => s.id === system.id);
    
    if (existingIndex >= 0) {
      systems[existingIndex] = system;
    } else {
      systems.push(system);
    }
    
    return tryLocalStorageSetItem(STORAGE_KEY, JSON.stringify(systems));
  }

  static deleteSystem(id: string): void {
    const systems = this.getSystems().filter(s => s.id !== id);
    writeLocalAndSync(STORAGE_KEY, JSON.stringify(systems));
  }

  static getCategories(): string[] {
    const systems = this.getSystems();
    const categories = new Set(systems.map(s => s.category));
    return Array.from(categories).sort();
  }
}

export interface OperatorDashboardContent {
  priorities: string[];
  quickLinks: Array<{ label: string; to: string }>;
  updates: string[];
  tasksDueToday: string[];
  openIssues: string[];
}

const DEFAULT_OPERATOR_DASHBOARD_CONTENT: OperatorDashboardContent = {
  priorities: [],
  quickLinks: [],
  updates: ["Ops sync at 2:00 PM.", "New SOP labels are now available."],
  tasksDueToday: [
    "Verify return queue SOP usage by support team.",
    "Confirm shipment exception handling checklist.",
    "Publish one SOP update note if changes were made.",
  ],
  openIssues: ["Outstanding SOP reviews are pending follow-up."],
};

/** Old seeded priorities — cleared so the floor shows an empty state instead. */
const LEGACY_SEED_PRIORITIES = new Set([
  "Review SOPs marked Needs Update.",
  "Check open tasks due today and clear blockers.",
  "Confirm critical fulfillment and returns workflows are current.",
]);


export class OperatorDashboardStorage {
  static getContent(): OperatorDashboardContent {
    try {
      const raw = localStorage.getItem(OPERATOR_DASHBOARD_CONTENT_KEY);
      if (!raw) return DEFAULT_OPERATOR_DASHBOARD_CONTENT;
      const parsed = JSON.parse(raw) as Partial<OperatorDashboardContent>;
      const cleanList = (value: unknown) =>
        Array.isArray(value)
          ? value
              .map((item) => (typeof item === "string" ? item.trim() : ""))
              .filter(Boolean)
          : [];
      const priorities = cleanList(parsed.priorities).filter(
        (item) => !LEGACY_SEED_PRIORITIES.has(item),
      );
      const updates = cleanList(parsed.updates);
      const tasksDueToday = cleanList(parsed.tasksDueToday);
      const openIssues = cleanList(parsed.openIssues);
      const quickLinks = Array.isArray(parsed.quickLinks)
        ? parsed.quickLinks
            .map((entry) => {
              if (!entry || typeof entry !== "object") return null;
              const label = "label" in entry && typeof entry.label === "string" ? entry.label.trim() : "";
              const to = "to" in entry && typeof entry.to === "string" ? entry.to.trim() : "";
              if (!label || !to) return null;
              return { label, to };
            })
            .filter((entry): entry is { label: string; to: string } => Boolean(entry))
        : [];
      return {
        priorities,
        quickLinks,
        updates: updates.length > 0 ? updates : DEFAULT_OPERATOR_DASHBOARD_CONTENT.updates,
        tasksDueToday:
          tasksDueToday.length > 0
            ? tasksDueToday
            : DEFAULT_OPERATOR_DASHBOARD_CONTENT.tasksDueToday,
        openIssues:
          openIssues.length > 0 ? openIssues : DEFAULT_OPERATOR_DASHBOARD_CONTENT.openIssues,
      };
    } catch {
      return DEFAULT_OPERATOR_DASHBOARD_CONTENT;
    }
  }

  static saveContent(content: OperatorDashboardContent): void {
    const priorities = content.priorities.map((item) => item.trim()).filter(Boolean);
    const updates = content.updates.map((item) => item.trim()).filter(Boolean);
    const tasksDueToday = content.tasksDueToday.map((item) => item.trim()).filter(Boolean);
    const openIssues = content.openIssues.map((item) => item.trim()).filter(Boolean);
    const quickLinks = content.quickLinks
      .map((item) => ({ label: item.label.trim(), to: item.to.trim() }))
      .filter((item) => item.label && item.to);
    tryLocalStorageSetItem(
      OPERATOR_DASHBOARD_CONTENT_KEY,
      JSON.stringify({
        priorities,
        quickLinks,
        updates: updates.length > 0 ? updates : DEFAULT_OPERATOR_DASHBOARD_CONTENT.updates,
        tasksDueToday:
          tasksDueToday.length > 0
            ? tasksDueToday
            : DEFAULT_OPERATOR_DASHBOARD_CONTENT.tasksDueToday,
        openIssues:
          openIssues.length > 0 ? openIssues : DEFAULT_OPERATOR_DASHBOARD_CONTENT.openIssues,
      }),
    );
  }
}
