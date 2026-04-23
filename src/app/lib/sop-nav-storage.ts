import { writeLocalAndSync } from "@/lib/synced-storage";
import { getCategoryBlurb, SOP_NAV_STRUCTURE } from "./sop-structure";

const KEY = "sops-nav-structure-fgg-v1";
const LEGACY_KEY = "sops-nav-structure-v1";

export type NavMenuItem = { id: string; title: string; subtitle?: string | null };
export type NavCategory = {
  id: string;
  title: string;
  items: NavMenuItem[];
  /** When set (including ""), overrides catalog blurb for this area in the hub. */
  blurb?: string | null;
};

function seedDefaults(): NavCategory[] {
  return SOP_NAV_STRUCTURE.map((c) => ({
    id: c.id,
    title: c.title,
    items: c.items.map((i) => ({ id: i.id, title: i.title })),
  }));
}

/** True when stored nav is missing canonical FGG roots (e.g. only custom areas) — merge, do not wipe. */
function needsCanonicalMerge(p: unknown): p is NavCategory[] {
  if (!Array.isArray(p) || p.length === 0) return false;
  return !p.some((c) => c && typeof c === "object" && (c as NavCategory).id === "start-here");
}

/** Prepend any default library categories that are missing, preserving user-defined areas and edits. */
function mergeMissingCanonicalCategories(existing: NavCategory[]): NavCategory[] {
  const seed = seedDefaults();
  const existingIds = new Set(existing.map((c) => c.id));
  const missing = seed.filter((c) => !existingIds.has(c.id));
  if (missing.length === 0) return existing;
  const merged = [...missing, ...existing];
  writeLocalAndSync(KEY, JSON.stringify(merged));
  return merged;
}

function parseNav(raw: string | null): NavCategory[] | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as NavCategory[];
    return Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
}

export function getNavStructure(): NavCategory[] {
  try {
    const rawCurrent = localStorage.getItem(KEY);
    const parsedCurrent = parseNav(rawCurrent);
    if (parsedCurrent && parsedCurrent.length > 0) {
      if (needsCanonicalMerge(parsedCurrent)) {
        return mergeMissingCanonicalCategories(parsedCurrent);
      }
      return parsedCurrent;
    }

    const s = seedDefaults();
    writeLocalAndSync(KEY, JSON.stringify(s));
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) localStorage.removeItem(LEGACY_KEY);
    return s;
  } catch {
    return seedDefaults();
  }
}

export function setNavStructure(cats: NavCategory[]): void {
  writeLocalAndSync(KEY, JSON.stringify(cats));
}

export function addCategory(title: string): NavCategory | null {
  const t = title.trim();
  if (!t) return null;
  const id = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cat: NavCategory = { id, title: t, items: [] };
  const all = getNavStructure();
  all.push(cat);
  setNavStructure(all);
  return cat;
}

export function addMenuItem(categoryId: string, title: string): NavMenuItem | null {
  const t = title.trim();
  if (!t) return null;
  const all = getNavStructure();
  const cat = all.find((c) => c.id === categoryId);
  if (!cat) return null;
  const id = `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const item: NavMenuItem = { id, title: t };
  cat.items.push(item);
  setNavStructure(all);
  return item;
}

export function renameCategory(categoryId: string, title: string): void {
  const t = title.trim();
  if (!t) return;
  const all = getNavStructure();
  const c = all.find((x) => x.id === categoryId);
  if (c) c.title = t;
  setNavStructure(all);
}

export function renameMenuItem(categoryId: string, itemId: string, title: string): void {
  const t = title.trim();
  if (!t) return;
  const all = getNavStructure();
  const c = all.find((x) => x.id === categoryId);
  const it = c?.items.find((i) => i.id === itemId);
  if (it) it.title = t;
  setNavStructure(all);
}

/** `null` or whitespace-only removes override and restores the default catalog blurb. */
export function setCategoryBlurb(categoryId: string, blurb: string | null): void {
  const all = getNavStructure();
  const c = all.find((x) => x.id === categoryId);
  if (!c) return;
  const t = blurb?.trim() ?? "";
  if (!t) {
    delete c.blurb;
  } else {
    c.blurb = t;
  }
  setNavStructure(all);
}

/** `null` or empty clears custom subtitle; UI falls back to procedure count. */
export function setMenuItemSubtitle(
  categoryId: string,
  itemId: string,
  subtitle: string | null,
): void {
  const all = getNavStructure();
  const c = all.find((x) => x.id === categoryId);
  const it = c?.items.find((i) => i.id === itemId);
  if (!it) return;
  if (subtitle === null || subtitle.trim() === "") {
    delete it.subtitle;
  } else {
    it.subtitle = subtitle.trim();
  }
  setNavStructure(all);
}

export function resolveCategoryBlurb(structure: NavCategory[], categoryId: string): string {
  const c = structure.find((x) => x.id === categoryId);
  const raw = c?.blurb;
  if (raw != null && String(raw).trim() !== "") return String(raw).trim();
  return getCategoryBlurb(categoryId);
}

export function getMenuItemLabel(
  structure: NavCategory[],
  categoryId: string,
  menuItemId: string,
): string {
  const c = structure.find((x) => x.id === categoryId);
  return c?.items.find((i) => i.id === menuItemId)?.title ?? menuItemId;
}
