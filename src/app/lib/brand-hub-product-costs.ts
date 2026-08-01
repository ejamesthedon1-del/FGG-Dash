import { writeLocalAndSync } from "@/lib/synced-storage";
import { apiUrl } from "./api-base";
import {
  recipeMaterialCost,
  type BrandSupplies,
} from "./shop-supplies-storage";

export const PRODUCT_COSTS_KEY = "brand-hub-product-costs-v1";

export type ProductUnitCost = {
  garmentCost: number;
  laborCost: number;
};

/** brandSlug → productTitle → costs */
export type BrandProductCosts = Record<string, Record<string, ProductUnitCost>>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function unitProductionCost(c: ProductUnitCost | undefined): number {
  if (!c) return 0;
  return (Number(c.garmentCost) || 0) + (Number(c.laborCost) || 0);
}

export function loadProductCosts(): BrandProductCosts {
  try {
    const raw = localStorage.getItem(PRODUCT_COSTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return {};
    const out: BrandProductCosts = {};
    for (const [brand, products] of Object.entries(parsed)) {
      if (!isRecord(products)) continue;
      out[brand] = {};
      for (const [title, cost] of Object.entries(products)) {
        if (!isRecord(cost)) continue;
        out[brand][title] = {
          garmentCost: Number(cost.garmentCost) || 0,
          laborCost: Number(cost.laborCost) || 0,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveProductCostsForBrand(
  brandSlug: string,
  costs: Record<string, ProductUnitCost>,
): boolean {
  const all = loadProductCosts();
  all[brandSlug] = costs;
  return writeLocalAndSync(PRODUCT_COSTS_KEY, JSON.stringify(all));
}

export function getCostsForBrand(brandSlug: string): Record<string, ProductUnitCost> {
  return { ...(loadProductCosts()[brandSlug] ?? {}) };
}

/** Load costs from Railway (source of truth), fall back to local cache. */
export async function fetchProductCostsForBrand(
  brandSlug: string,
): Promise<Record<string, ProductUnitCost>> {
  try {
    const res = await fetch(
      apiUrl(`/api/product-costs?brand=${encodeURIComponent(brandSlug)}`),
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as {
      costs?: Record<string, { garmentCost?: number; laborCost?: number }>;
    };
    const remote = body.costs ?? {};
    const normalized: Record<string, ProductUnitCost> = {};
    for (const [title, cost] of Object.entries(remote)) {
      normalized[title] = {
        garmentCost: Number(cost?.garmentCost) || 0,
        laborCost: Number(cost?.laborCost) || 0,
      };
    }
    saveProductCostsForBrand(brandSlug, normalized);
    return normalized;
  } catch {
    return getCostsForBrand(brandSlug);
  }
}

/** Persist to Railway + local cache. */
export async function persistProductCostsForBrand(
  brandSlug: string,
  costs: Record<string, ProductUnitCost>,
): Promise<boolean> {
  const localOk = saveProductCostsForBrand(brandSlug, costs);
  try {
    const res = await fetch(
      apiUrl(`/api/product-costs?brand=${encodeURIComponent(brandSlug)}`),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costs }),
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch {
    return localOk;
  }
}

export type SoldUnits = { name: string; units: number };

export function productionCostForUnits(
  items: SoldUnits[],
  costs: Record<string, ProductUnitCost>,
): {
  total: number;
  coveredUnits: number;
  missingUnits: number;
  lines: Array<{
    name: string;
    units: number;
    garmentCost: number;
    laborCost: number;
    unitCost: number;
    lineTotal: number;
    missing: boolean;
  }>;
} {
  const lines = items.map((item) => {
    const c = costs[item.name];
    const garmentCost = Number(c?.garmentCost) || 0;
    const laborCost = Number(c?.laborCost) || 0;
    const unitCost = garmentCost + laborCost;
    const missing = !c || unitCost <= 0;
    return {
      name: item.name,
      units: item.units,
      garmentCost,
      laborCost,
      unitCost,
      lineTotal: unitCost * item.units,
      missing,
    };
  });

  const covered = lines.filter((l) => !l.missing);
  return {
    total: covered.reduce((s, l) => s + l.lineTotal, 0),
    coveredUnits: covered.reduce((s, l) => s + l.units, 0),
    missingUnits: lines.filter((l) => l.missing).reduce((s, l) => s + l.units, 0),
    lines,
  };
}

/**
 * Prefer complete recipe material rollups for garmentCost.
 * Labor stays from manual Brand Hub costs.
 */
export function applyRecipeGarmentCosts(
  costs: Record<string, ProductUnitCost>,
  supplies: BrandSupplies,
): Record<string, ProductUnitCost> {
  const out: Record<string, ProductUnitCost> = { ...costs };
  for (const recipe of supplies.recipes) {
    const rolled = recipeMaterialCost(recipe, supplies.materials);
    if (!rolled.complete || rolled.total <= 0) continue;
    const key = recipe.productName.trim();
    if (!key) continue;
    const existing = out[key] ?? { garmentCost: 0, laborCost: 0 };
    out[key] = {
      garmentCost: rolled.total,
      laborCost: Number(existing.laborCost) || 0,
    };
  }
  return out;
}
