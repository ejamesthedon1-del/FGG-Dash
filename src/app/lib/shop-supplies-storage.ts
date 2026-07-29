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
  notes: string;
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

function normalizeBrandData(raw: unknown): BrandSupplies {
  if (!raw || typeof raw !== "object") return emptyBrand();
  const data = raw as Partial<BrandSupplies>;
  return {
    materials: Array.isArray(data.materials) ? data.materials : [],
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

export function addMaterial(
  brand: SupplyBrand,
  input: {
    name: string;
    category: SupplyCategory;
    qtyOnHand?: number;
    lowStockAt?: number;
    unit?: SupplyUnit;
    notes?: string;
  },
): BrandSupplies {
  const name = input.name.trim();
  if (!name) return loadBrandSupplies(brand);
  const category = isCategory(input.category) ? input.category : "other";
  const now = nowIso();
  const material: SupplyMaterial = {
    id: newId("mat"),
    name,
    category,
    qtyOnHand: Math.max(0, Number(input.qtyOnHand) || 0),
    lowStockAt: Math.max(0, Number(input.lowStockAt) || 0),
    unit: input.unit ?? "ea",
    notes: (input.notes || "").trim(),
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
    Pick<SupplyMaterial, "name" | "category" | "lowStockAt" | "unit" | "notes" | "qtyOnHand">
  >,
): BrandSupplies {
  return updateBrand(brand, (current) => ({
    ...current,
    materials: current.materials.map((m) => {
      if (m.id !== materialId) return m;
      return {
        ...m,
        name: patch.name?.trim() || m.name,
        category: patch.category && isCategory(patch.category) ? patch.category : m.category,
        lowStockAt:
          patch.lowStockAt != null ? Math.max(0, Number(patch.lowStockAt) || 0) : m.lowStockAt,
        unit: patch.unit ?? m.unit,
        notes: patch.notes != null ? patch.notes.trim() : m.notes,
        qtyOnHand:
          patch.qtyOnHand != null ? Math.max(0, Number(patch.qtyOnHand) || 0) : m.qtyOnHand,
        updatedAt: nowIso(),
      };
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
  *,
  type: "receive" | "adjust",
  note = "",
  by = "ops",
): BrandSupplies {
  return updateBrand(brand, (current) => {
    const material = current.materials.find((m) => m.id === materialId);
    if (!material) return current;
    const nextQty = Math.max(0, material.qtyOnHand + delta);
    const materials = current.materials.map((m) =>
      m.id === materialId ? { ...m, qtyOnHand: nextQty, updatedAt: nowIso() } : m,
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
