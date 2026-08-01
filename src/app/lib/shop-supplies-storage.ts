import { writeLocalAndSync } from "@/lib/synced-storage";

export const SHOP_SUPPLIES_KEY = "fgg.shop-supplies.v1";
const MAX_EVENTS = 200;

export const SUPPLY_BRANDS = ["live-don", "sinners-testimony"] as const;
export type SupplyBrand = (typeof SUPPLY_BRANDS)[number];

export const SUPPLY_BRAND_LABELS: Record<SupplyBrand, string> = {
  "live-don": "Livdon",
  "sinners-testimony": "Sinners Testimony",
};

export const SUPPLY_CATEGORIES = [
  "blanks",
  "dtf_prints",
  "woven_labels",
  "patches",
  "hang_tags",
  "packing_bags",
  "shipping_supplies",
  "other",
] as const;

export type SupplyCategory = (typeof SUPPLY_CATEGORIES)[number];

export const SUPPLY_CATEGORY_LABELS: Record<SupplyCategory, string> = {
  blanks: "Blanks",
  dtf_prints: "DTF prints",
  woven_labels: "Woven labels / tags",
  patches: "Patches",
  hang_tags: "Hang tags",
  packing_bags: "Packing bags",
  shipping_supplies: "Shipping supplies",
  other: "Other",
};

export type SupplyUnit = "ea" | "roll" | "pack";

export type SupplyMaterial = {
  id: string;
  name: string;
  category: SupplyCategory;
  qtyOnHand: number;
  lowStockAt: number;
  unit: SupplyUnit;
  /** Cost per unit (USD) — used for inventory value and recipe COGS. */
  unitCost: number;
  /** Ops notes: SKU, vendor, how to identify this supply. */
  notes: string;
  /** Vendor / product page for reordering. */
  reorderUrl?: string;
  /** Optional product/material photo as a data URL (synced localStorage). */
  photoDataUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type SupplyRecipeLine = {
  materialId: string;
  qtyPerUnit: number;
};

export type SupplyRecipe = {
  id: string;
  productId: string;
  productName: string;
  lines: SupplyRecipeLine[];
  createdAt: string;
  updatedAt: string;
};

export type SupplyEventType = "receive" | "adjust" | "apply";

export type SupplyEvent = {
  id: string;
  type: SupplyEventType;
  at: string;
  by: string;
  materialId?: string;
  materialName?: string;
  delta?: number;
  qtyAfter?: number;
  note?: string;
  orderKey?: string;
  orderNumber?: string;
  deductions?: Array<{ materialId: string; materialName: string; qty: number }>;
};

export type BrandSupplies = {
  materials: SupplyMaterial[];
  recipes: SupplyRecipe[];
  events: SupplyEvent[];
};

export type ShopSuppliesStore = Record<SupplyBrand, BrandSupplies>;

export type MaterialNeedLine = {
  materialId: string;
  materialName: string;
  category: SupplyCategory;
  qtyNeeded: number;
  qtyOnHand: number;
  unit: SupplyUnit;
  lowStock: boolean;
  insufficient: boolean;
  photoDataUrl?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyBrand(): BrandSupplies {
  return { materials: [], recipes: [], events: [] };
}

function emptyStore(): ShopSuppliesStore {
  return {
    "live-don": emptyBrand(),
    "sinners-testimony": emptyBrand(),
  };
}

function isBrand(value: string): value is SupplyBrand {
  return (SUPPLY_BRANDS as readonly string[]).includes(value);
}

function isCategory(value: string): value is SupplyCategory {
  return (SUPPLY_CATEGORIES as readonly string[]).includes(value);
}

function clampMoney(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function normalizeMaterial(raw: unknown): SupplyMaterial | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Partial<SupplyMaterial> & { id?: string; name?: string };
  if (!m.id || !m.name) return null;
  const category = isCategory(String(m.category || "")) ? (m.category as SupplyCategory) : "other";
  const unit =
    m.unit === "roll" || m.unit === "pack" || m.unit === "ea" ? m.unit : "ea";
  return {
    id: String(m.id),
    name: String(m.name),
    category,
    qtyOnHand: Math.max(0, Number(m.qtyOnHand) || 0),
    lowStockAt: Math.max(0, Number(m.lowStockAt) || 0),
    unit,
    unitCost: clampMoney(Number(m.unitCost) || 0),
    notes: typeof m.notes === "string" ? m.notes : "",
    ...(m.reorderUrl ? { reorderUrl: String(m.reorderUrl) } : {}),
    ...(m.photoDataUrl ? { photoDataUrl: String(m.photoDataUrl) } : {}),
    createdAt: typeof m.createdAt === "string" ? m.createdAt : nowIso(),
    updatedAt: typeof m.updatedAt === "string" ? m.updatedAt : nowIso(),
  };
}

function normalizeBrandData(raw: unknown): BrandSupplies {
  if (!raw || typeof raw !== "object") return emptyBrand();
  const data = raw as Partial<BrandSupplies>;
  const materials = Array.isArray(data.materials)
    ? data.materials.map(normalizeMaterial).filter((m): m is SupplyMaterial => Boolean(m))
    : [];
  return {
    materials,
    recipes: Array.isArray(data.recipes) ? data.recipes : [],
    events: Array.isArray(data.events) ? data.events.slice(0, MAX_EVENTS) : [],
  };
}

function parseStore(raw: string | null): ShopSuppliesStore {
  if (!raw) return emptyStore();
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return emptyStore();
    const obj = data as Record<string, unknown>;
    return {
      "live-don": normalizeBrandData(obj["live-don"]),
      "sinners-testimony": normalizeBrandData(obj["sinners-testimony"]),
    };
  } catch {
    return emptyStore();
  }
}

function persist(store: ShopSuppliesStore): void {
  if (typeof localStorage === "undefined") return;
  writeLocalAndSync(SHOP_SUPPLIES_KEY, JSON.stringify(store));
}

export function loadShopSupplies(): ShopSuppliesStore {
  if (typeof localStorage === "undefined") return emptyStore();
  return parseStore(localStorage.getItem(SHOP_SUPPLIES_KEY));
}

export function loadBrandSupplies(brand: SupplyBrand): BrandSupplies {
  return loadShopSupplies()[brand] ?? emptyBrand();
}

function updateBrand(
  brand: SupplyBrand,
  updater: (current: BrandSupplies) => BrandSupplies,
): BrandSupplies {
  const store = loadShopSupplies();
  const next = updater(store[brand] ?? emptyBrand());
  store[brand] = {
    materials: next.materials,
    recipes: next.recipes,
    events: next.events.slice(0, MAX_EVENTS),
  };
  persist(store);
  return store[brand];
}

function pushEvent(brand: BrandSupplies, event: SupplyEvent): BrandSupplies {
  return {
    ...brand,
    events: [event, ...brand.events].slice(0, MAX_EVENTS),
  };
}

export function isLowStock(material: SupplyMaterial): boolean {
  return material.qtyOnHand <= material.lowStockAt;
}

export function materialUnitCost(material: SupplyMaterial): number {
  return clampMoney(Number(material.unitCost) || 0);
}

export function materialInventoryValue(material: SupplyMaterial): number {
  return clampMoney(materialUnitCost(material) * Math.max(0, material.qtyOnHand));
}

export function brandInventoryValue(brand: BrandSupplies): number {
  return clampMoney(brand.materials.reduce((sum, m) => sum + materialInventoryValue(m), 0));
}

export type RecipeCostLine = {
  materialId: string;
  materialName: string;
  category: SupplyCategory;
  qtyPerUnit: number;
  unitCost: number;
  lineCost: number;
  missingCost: boolean;
};

export function recipeMaterialCost(
  recipe: SupplyRecipe,
  materials: SupplyMaterial[],
): { total: number; lines: RecipeCostLine[]; complete: boolean } {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const lines: RecipeCostLine[] = recipe.lines.map((line) => {
    const material = byId.get(line.materialId);
    const unitCost = material ? materialUnitCost(material) : 0;
    const qtyPerUnit = Math.max(0, Number(line.qtyPerUnit) || 0);
    const missingCost = !material || unitCost <= 0;
    return {
      materialId: line.materialId,
      materialName: material?.name ?? "Missing material",
      category: material?.category ?? "other",
      qtyPerUnit,
      unitCost,
      lineCost: clampMoney(unitCost * qtyPerUnit),
      missingCost,
    };
  });
  const total = clampMoney(lines.reduce((sum, l) => sum + l.lineCost, 0));
  return {
    total,
    lines,
    complete: lines.length > 0 && lines.every((l) => !l.missingCost),
  };
}

export function addMaterial(
  brand: SupplyBrand,
  input: {
    name: string;
    category: SupplyCategory;
    qtyOnHand?: number;
    lowStockAt?: number;
    unit?: SupplyUnit;
    unitCost?: number;
    notes?: string;
    photoDataUrl?: string;
  },
): BrandSupplies {
  const name = input.name.trim();
  if (!name) return loadBrandSupplies(brand);
  const category = isCategory(input.category) ? input.category : "other";
  const now = nowIso();
  const photo = (input.photoDataUrl || "").trim();
  const material: SupplyMaterial = {
    id: newId("mat"),
    name,
    category,
    qtyOnHand: Math.max(0, Number(input.qtyOnHand) || 0),
    lowStockAt: Math.max(0, Number(input.lowStockAt) || 0),
    unit: input.unit ?? "ea",
    unitCost: clampMoney(Number(input.unitCost) || 0),
    notes: (input.notes || "").trim(),
    ...(photo ? { photoDataUrl: photo } : {}),
    createdAt: now,
    updatedAt: now,
  };
  return updateBrand(brand, (current) => ({
    ...current,
    materials: [material, ...current.materials],
  }));
}

export function updateMaterial(
  brand: SupplyBrand,
  materialId: string,
  patch: Partial<
    Pick<
      SupplyMaterial,
      | "name"
      | "category"
      | "lowStockAt"
      | "unit"
      | "unitCost"
      | "notes"
      | "qtyOnHand"
      | "photoDataUrl"
      | "reorderUrl"
    >
  >,
): BrandSupplies {
  return updateBrand(brand, (current) => ({
    ...current,
    materials: current.materials.map((m) => {
      if (m.id !== materialId) return m;
      const next: SupplyMaterial = {
        ...m,
        name: patch.name?.trim() || m.name,
        category: patch.category && isCategory(patch.category) ? patch.category : m.category,
        lowStockAt:
          patch.lowStockAt != null ? Math.max(0, Number(patch.lowStockAt) || 0) : m.lowStockAt,
        unit: patch.unit ?? m.unit,
        unitCost:
          patch.unitCost != null ? clampMoney(Number(patch.unitCost) || 0) : m.unitCost,
        notes: patch.notes != null ? patch.notes.trim() : m.notes,
        qtyOnHand:
          patch.qtyOnHand != null ? Math.max(0, Number(patch.qtyOnHand) || 0) : m.qtyOnHand,
        updatedAt: nowIso(),
      };
      if ("photoDataUrl" in patch) {
        const photo = (patch.photoDataUrl || "").trim();
        if (photo) next.photoDataUrl = photo;
        else delete next.photoDataUrl;
      }
      if ("reorderUrl" in patch) {
        const url = (patch.reorderUrl || "").trim();
        if (url) next.reorderUrl = url;
        else delete next.reorderUrl;
      }
      return next;
    }),
  }));
}

export function deleteMaterial(brand: SupplyBrand, materialId: string): BrandSupplies {
  return updateBrand(brand, (current) => ({
    materials: current.materials.filter((m) => m.id !== materialId),
    recipes: current.recipes.map((r) => ({
      ...r,
      lines: r.lines.filter((l) => l.materialId !== materialId),
      updatedAt: nowIso(),
    })),
    events: current.events,
  }));
}

export function adjustMaterialQty(
  brand: SupplyBrand,
  materialId: string,
  delta: number,
  opts: {
    type: "receive" | "adjust";
    note?: string;
    by?: string;
    /** When receiving stock, optional cost per unit to update weighted average. */
    unitCost?: number;
  },
): BrandSupplies {
  const type = opts.type;
  const note = opts.note ?? "";
  const by = opts.by ?? "ops";
  return updateBrand(brand, (current) => {
    const material = current.materials.find((m) => m.id === materialId);
    if (!material) return current;
    const nextQty = Math.max(0, material.qtyOnHand + delta);
    let nextUnitCost = materialUnitCost(material);
    if (
      type === "receive" &&
      delta > 0 &&
      opts.unitCost != null &&
      Number.isFinite(opts.unitCost) &&
      opts.unitCost >= 0
    ) {
      const receiveCost = clampMoney(opts.unitCost);
      const prevQty = Math.max(0, material.qtyOnHand);
      if (prevQty <= 0) {
        nextUnitCost = receiveCost;
      } else {
        nextUnitCost = clampMoney(
          (prevQty * nextUnitCost + delta * receiveCost) / (prevQty + delta),
        );
      }
    }
    const materials = current.materials.map((m) =>
      m.id === materialId
        ? { ...m, qtyOnHand: nextQty, unitCost: nextUnitCost, updatedAt: nowIso() }
        : m,
    );
    return pushEvent(
      { ...current, materials },
      {
        id: newId("evt"),
        type,
        at: nowIso(),
        by,
        materialId,
        materialName: material.name,
        delta,
        qtyAfter: nextQty,
        note: note.trim() || undefined,
      },
    );
  });
}

export function upsertRecipe(
  brand: SupplyBrand,
  input: {
    id?: string;
    productId: string;
    productName: string;
    lines: SupplyRecipeLine[];
  },
): BrandSupplies {
  const productId = input.productId.trim();
  const productName = input.productName.trim() || productId || "Untitled product";
  if (!productId) return loadBrandSupplies(brand);
  const lines = input.lines
    .map((l) => ({
      materialId: l.materialId,
      qtyPerUnit: Math.max(0, Number(l.qtyPerUnit) || 0),
    }))
    .filter((l) => l.materialId && l.qtyPerUnit > 0);
  const now = nowIso();

  return updateBrand(brand, (current) => {
    const existingIdx = current.recipes.findIndex(
      (r) => r.id === input.id || r.productId === productId,
    );
    if (existingIdx >= 0) {
      const recipes = current.recipes.slice();
      recipes[existingIdx] = {
        ...recipes[existingIdx],
        productId,
        productName,
        lines,
        updatedAt: now,
      };
      return { ...current, recipes };
    }
    const recipe: SupplyRecipe = {
      id: newId("recipe"),
      productId,
      productName,
      lines,
      createdAt: now,
      updatedAt: now,
    };
    return { ...current, recipes: [recipe, ...current.recipes] };
  });
}

export function deleteRecipe(brand: SupplyBrand, recipeId: string): BrandSupplies {
  return updateBrand(brand, (current) => ({
    ...current,
    recipes: current.recipes.filter((r) => r.id !== recipeId),
  }));
}

export function getRecipeForProduct(
  brand: SupplyBrand,
  productId: string,
): SupplyRecipe | null {
  const id = productId.trim();
  if (!id) return null;
  return loadBrandSupplies(brand).recipes.find((r) => r.productId === id) ?? null;
}

export function computeMaterialNeeds(
  brand: SupplyBrand,
  lineItems: Array<{ productId?: string; product: string; quantity: number }>,
): MaterialNeedLine[] {
  const data = loadBrandSupplies(brand);
  const byMaterial = new Map<string, number>();

  for (const item of lineItems) {
    const productId = (item.productId || "").trim();
    if (!productId) continue;
    const recipe = data.recipes.find((r) => r.productId === productId);
    if (!recipe) continue;
    const qty = Math.max(0, Number(item.quantity) || 0);
    if (!qty) continue;
    for (const line of recipe.lines) {
      byMaterial.set(
        line.materialId,
        (byMaterial.get(line.materialId) || 0) + line.qtyPerUnit * qty,
      );
    }
  }

  const needs: MaterialNeedLine[] = [];
  for (const [materialId, qtyNeeded] of byMaterial) {
    const material = data.materials.find((m) => m.id === materialId);
    if (!material) {
      needs.push({
        materialId,
        materialName: "Missing material",
        category: "other",
        qtyNeeded,
        qtyOnHand: 0,
        unit: "ea",
        lowStock: true,
        insufficient: true,
      });
      continue;
    }
    needs.push({
      materialId,
      materialName: material.name,
      category: material.category,
      qtyNeeded,
      qtyOnHand: material.qtyOnHand,
      unit: material.unit,
      lowStock: isLowStock(material),
      insufficient: material.qtyOnHand < qtyNeeded,
      photoDataUrl: material.photoDataUrl,
    });
  }
  return needs.sort((a, b) => a.materialName.localeCompare(b.materialName));
}

export function applySuppliesForOrder(
  brand: SupplyBrand,
  input: {
    orderKey: string;
    orderNumber: string;
    lineItems: Array<{ productId?: string; product: string; quantity: number }>;
    by?: string;
  },
): { ok: true; needs: MaterialNeedLine[]; brand: BrandSupplies } | { ok: false; error: string; needs: MaterialNeedLine[] } {
  const needs = computeMaterialNeeds(brand, input.lineItems);
  if (!needs.length) {
    return { ok: false, error: "No recipe matched this order’s products.", needs };
  }
  const insufficient = needs.filter((n) => n.insufficient);
  if (insufficient.length) {
    return {
      ok: false,
      error: `Not enough stock: ${insufficient.map((n) => n.materialName).join(", ")}`,
      needs,
    };
  }

  const brandData = updateBrand(brand, (current) => {
    const materials = current.materials.map((m) => {
      const need = needs.find((n) => n.materialId === m.id);
      if (!need) return m;
      return {
        ...m,
        qtyOnHand: Math.max(0, m.qtyOnHand - need.qtyNeeded),
        updatedAt: nowIso(),
      };
    });
    return pushEvent(
      { ...current, materials },
      {
        id: newId("evt"),
        type: "apply",
        at: nowIso(),
        by: input.by || "ops",
        orderKey: input.orderKey,
        orderNumber: input.orderNumber,
        deductions: needs.map((n) => ({
          materialId: n.materialId,
          materialName: n.materialName,
          qty: n.qtyNeeded,
        })),
      },
    );
  });

  return { ok: true, needs, brand: brandData };
}

export function resolveSupplyBrand(brand: string): SupplyBrand | null {
  const key = brand.trim().toLowerCase();
  if (key === "livdon" || key === "live-don") return "live-don";
  if (key === "sinners" || key === "sinners-testimony") return "sinners-testimony";
  return isBrand(key) ? key : null;
}

/** Seed starter materials for Livdon if the brand catalog is empty. */
export function ensureLivdonSeedIfEmpty(): BrandSupplies {
  const current = loadBrandSupplies("live-don");
  if (current.materials.length) return current;
  let next = addMaterial("live-don", {
    name: "Left chest DTF (Livdon)",
    category: "dtf_prints",
    qtyOnHand: 0,
    lowStockAt: 25,
  });
  next = addMaterial("live-don", {
    name: "Inside woven tag",
    category: "woven_labels",
    qtyOnHand: 0,
    lowStockAt: 50,
  });
  next = addMaterial("live-don", {
    name: "Packing bag (poly)",
    category: "packing_bags",
    qtyOnHand: 0,
    lowStockAt: 50,
  });
  next = addMaterial("live-don", {
    name: "Shipping label roll",
    category: "shipping_supplies",
    qtyOnHand: 0,
    lowStockAt: 1,
    unit: "roll",
  });
  return next;
}
