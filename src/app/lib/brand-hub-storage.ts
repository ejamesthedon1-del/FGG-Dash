import { writeLocalAndSync } from "@/lib/synced-storage";
import { BRAND_CATALOG, type BrandProfile } from "./brand-hub-data";

const OVERRIDES_KEY = "brand-hub-overrides-v1";
const CUSTOM_KEY = "brand-hub-custom-brands-v1";

type BrandOverrides = Record<string, Partial<BrandProfile>>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mergeNotes(
  base: BrandProfile["brandNotes"],
  patch: BrandProfile["brandNotes"],
): BrandProfile["brandNotes"] | undefined {
  if (!base && !patch) return undefined;
  return { ...base, ...patch };
}

function mergeAssets(
  base: BrandProfile["brandAssets"],
  patch: BrandProfile["brandAssets"],
): BrandProfile["brandAssets"] | undefined {
  if (!base && !patch) return undefined;
  const files = patch?.files ?? base?.files;
  return {
    ...base,
    ...patch,
    ...(files !== undefined ? { files } : {}),
  };
}

function mergeOps(
  base: BrandProfile["operationsNotes"],
  patch: BrandProfile["operationsNotes"],
): BrandProfile["operationsNotes"] | undefined {
  if (!base && !patch) return undefined;
  return { ...base, ...patch };
}

/** Deep-merge catalog row with optional partial override (for future admin / imports). */
export function mergeBrandProfile(base: BrandProfile, patch: Partial<BrandProfile> | undefined): BrandProfile {
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    brandNotes: mergeNotes(base.brandNotes, patch.brandNotes),
    brandAssets: mergeAssets(base.brandAssets, patch.brandAssets),
    operationsNotes: mergeOps(base.operationsNotes, patch.operationsNotes),
    quickLinks: patch.quickLinks ?? base.quickLinks,
  };
}

function loadOverrides(): BrandOverrides {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!isRecord(p)) return {};
    return p as BrandOverrides;
  } catch {
    return {};
  }
}

function loadCustomBrands(): BrandProfile[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p.filter((b): b is BrandProfile => isRecord(b) && typeof b.id === "string" && typeof b.name === "string");
  } catch {
    return [];
  }
}

export function getBrands(): BrandProfile[] {
  const overrides = loadOverrides();
  const fromCatalog = BRAND_CATALOG.map((b) => mergeBrandProfile(b, overrides[b.id]));
  const catalogIds = new Set(BRAND_CATALOG.map((b) => b.id));
  const extras = loadCustomBrands()
    .filter((b) => !catalogIds.has(b.id))
    .map((b) => mergeBrandProfile(b, overrides[b.id]));
  return [...fromCatalog, ...extras];
}

export function getBrandBySlug(slug: string | undefined): BrandProfile | undefined {
  if (!slug) return undefined;
  return getBrands().find((b) => b.id === slug);
}

/** Persist partial updates for a catalog id (future admin UI). */
export function saveBrandOverride(id: string, patch: Partial<BrandProfile>): void {
  const all = loadOverrides();
  const prev = all[id] ?? {};
  all[id] = { ...prev, ...patch };
  if (!writeLocalAndSync(OVERRIDES_KEY, JSON.stringify(all))) {
    throw new Error("BRAND_HUB_STORAGE_FULL");
  }
}

/** Append or replace a full custom brand (not in `BRAND_CATALOG`). */
export function saveCustomBrand(brand: BrandProfile): void {
  if (BRAND_CATALOG.some((b) => b.id === brand.id)) {
    saveBrandOverride(brand.id, brand);
    return;
  }
  const list = loadCustomBrands().filter((b) => b.id !== brand.id);
  list.push(brand);
  writeLocalAndSync(CUSTOM_KEY, JSON.stringify(list));
}
