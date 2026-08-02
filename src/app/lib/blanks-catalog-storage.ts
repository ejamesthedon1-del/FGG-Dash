import { writeLocalAndSync } from "@/lib/synced-storage";
import { loadProductCosts } from "./brand-hub-product-costs";
import type { BlankLine } from "./blanks-print-slip";
import {
  loadShopSupplies,
  materialPieceCost,
  SUPPLY_BRANDS,
} from "./shop-supplies-storage";

export const BLANKS_CATALOG_KEY = "fgg.blanks-catalog.v1";

/** Maps a Shopify product to the wholesale blank you actually order. */
export type BlankCatalogEntry = {
  /** Shopify product GID, or `title:<normalized>` when id is missing. */
  productKey: string;
  shopifyProductName: string;
  blankName: string;
  supplier: string;
  orderUrl?: string;
  /** Wholesale blank unit cost (USD) for cash / PO estimates. */
  unitCost?: number;
  updatedAt: string;
};

export type BlanksCatalog = {
  version: 1;
  entries: Record<string, BlankCatalogEntry>;
};

const EMPTY: BlanksCatalog = { version: 1, entries: {} };

/** Built-in wholesale blank links — user catalog overrides these. */
const DEFAULT_BLANK_LINKS: BlankCatalogEntry[] = [
  {
    productKey: "gid://shopify/Product/8238321729625",
    shopifyProductName: "PAINTERS HOODIE",
    blankName: "Port & Co. Fan Favorite Hoodie",
    supplier: "All Day Shirts",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    productKey: "gid://shopify/Product/8258381381721",
    shopifyProductName: "PAINTERS HOODIE",
    blankName: "Port & Co. Fan Favorite Hoodie",
    supplier: "All Day Shirts",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    productKey: "gid://shopify/Product/8213162688601",
    shopifyProductName: "PAINTERS HOODIE",
    blankName: "Port & Co. Fan Favorite Hoodie",
    supplier: "All Day Shirts",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    productKey: "title:painters hoodie",
    shopifyProductName: "PAINTERS HOODIE",
    blankName: "Port & Co. Fan Favorite Hoodie",
    supplier: "All Day Shirts",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
];

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function blankProductKey(productId: string | undefined, productName: string): string {
  const id = (productId || "").trim();
  if (id) return id;
  return `title:${normalizeTitle(productName || "unknown")}`;
}

function defaultCatalogEntries(): Record<string, BlankCatalogEntry> {
  const entries: Record<string, BlankCatalogEntry> = {};
  for (const entry of DEFAULT_BLANK_LINKS) {
    entries[entry.productKey] = entry;
  }
  return entries;
}

const STALE_PAINTER_BLANK_NAMES = new Set([
  "pc90h",
  "port & company fan favorite fleece pullover hooded sweatshirt",
]);

export function readBlanksCatalog(): BlanksCatalog {
  const defaults = defaultCatalogEntries();
  try {
    const raw = localStorage.getItem(BLANKS_CATALOG_KEY);
    if (!raw) return { version: 1, entries: defaults };
    const parsed = JSON.parse(raw) as BlanksCatalog;
    if (!parsed || parsed.version !== 1 || typeof parsed.entries !== "object") {
      return { version: 1, entries: defaults };
    }
    const stored = parsed.entries ?? {};
    const entries = { ...defaults, ...stored };
    // Refresh known painters-hoodie shortcuts when an older abbreviation was saved.
    for (const [key, fallback] of Object.entries(defaults)) {
      const current = stored[key];
      if (!current) continue;
      if (STALE_PAINTER_BLANK_NAMES.has(current.blankName.trim().toLowerCase())) {
        entries[key] = {
          ...current,
          blankName: fallback.blankName,
        };
      }
    }
    return { version: 1, entries };
  } catch {
    return { version: 1, entries: defaults };
  }
}

export function writeBlanksCatalog(catalog: BlanksCatalog): void {
  writeLocalAndSync(BLANKS_CATALOG_KEY, JSON.stringify(catalog));
}

export function upsertBlankCatalogEntry(
  input: Omit<BlankCatalogEntry, "updatedAt"> & { updatedAt?: string },
): BlanksCatalog {
  const catalog = readBlanksCatalog();
  const unitCost =
    input.unitCost != null && Number.isFinite(input.unitCost) && input.unitCost > 0
      ? Math.round(input.unitCost * 100) / 100
      : undefined;
  catalog.entries[input.productKey] = {
    productKey: input.productKey,
    shopifyProductName: input.shopifyProductName.trim(),
    blankName: input.blankName.trim(),
    supplier: input.supplier.trim(),
    orderUrl: input.orderUrl?.trim() || undefined,
    unitCost,
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
  writeBlanksCatalog(catalog);
  return catalog;
}

export type ResolvedBlankLine = BlankLine & {
  blankName: string;
  supplier: string;
  orderUrl?: string;
  unitCost?: number;
  linked: boolean;
  /** Keys used to look up / save catalog entries for this row. */
  catalogKeys: string[];
};

/** Resolve a wholesale blank unit cost for PO / cash estimates. */
export function resolveBlankUnitCost(
  line: Pick<ResolvedBlankLine, "blankName" | "product" | "productIds" | "unitCost" | "catalogKeys">,
  catalog: BlanksCatalog = readBlanksCatalog(),
): number | null {
  if (line.unitCost != null && line.unitCost > 0) return line.unitCost;

  for (const key of line.catalogKeys ?? []) {
    const cost = catalog.entries[key]?.unitCost;
    if (cost != null && cost > 0) return cost;
  }
  for (const id of line.productIds) {
    const cost = catalog.entries[id]?.unitCost;
    if (cost != null && cost > 0) return cost;
  }

  const blankKey = normalizeTitle(line.blankName);
  const supplies = loadShopSupplies();
  for (const brand of SUPPLY_BRANDS) {
    for (const material of supplies[brand]?.materials ?? []) {
      if (material.category !== "blanks") continue;
      if (normalizeTitle(material.name) !== blankKey) continue;
      const piece = materialPieceCost(material);
      if (piece > 0) return piece;
    }
  }

  const productKey = normalizeTitle(line.product);
  const productCosts = loadProductCosts();
  for (const products of Object.values(productCosts)) {
    for (const [title, cost] of Object.entries(products)) {
      if (normalizeTitle(title) !== productKey) continue;
      const garment = Number(cost.garmentCost) || 0;
      if (garment > 0) return garment;
    }
  }

  return null;
}

export function estimateBlankLineTotal(
  line: Pick<
    ResolvedBlankLine,
    "quantity" | "blankName" | "product" | "productIds" | "unitCost" | "catalogKeys"
  >,
): number | null {
  const unit = resolveBlankUnitCost(line);
  if (unit == null) return null;
  return Math.round(unit * line.quantity * 100) / 100;
}

export function formatBlankEstimate(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function lookupEntry(
  catalog: BlanksCatalog,
  line: BlankLine,
): BlankCatalogEntry | undefined {
  for (const id of line.productIds) {
    const hit = catalog.entries[id];
    if (hit) return hit;
  }
  return catalog.entries[blankProductKey(undefined, line.product)];
}

/**
 * Apply blank catalog names/suppliers, then re-group so linked products that share
 * the same wholesale blank + color + size collapse into one order row.
 */
export function resolveBlankLines(
  lines: BlankLine[],
  catalog: BlanksCatalog = readBlanksCatalog(),
): ResolvedBlankLine[] {
  const map = new Map<string, ResolvedBlankLine>();

  for (const line of lines) {
    const entry = lookupEntry(catalog, line);
    const blankName = entry?.blankName?.trim() || line.product;
    const supplier = entry?.supplier?.trim() || "";
    const orderUrl = entry?.orderUrl?.trim() || undefined;
    const unitCost =
      entry?.unitCost != null && entry.unitCost > 0 ? entry.unitCost : undefined;
    const linked = Boolean(entry?.blankName?.trim());
    const catalogKeys = [
      ...line.productIds,
      blankProductKey(undefined, line.product),
    ].filter((k, i, arr) => arr.indexOf(k) === i);

    const key = [
      blankName.toLowerCase(),
      line.color.toLowerCase(),
      line.size.toLowerCase(),
      supplier.toLowerCase(),
    ].join("::");

    const existing = map.get(key);
    if (existing) {
      existing.quantity += line.quantity;
      for (const id of line.productIds) {
        if (!existing.productIds.includes(id)) existing.productIds.push(id);
      }
      for (const k of catalogKeys) {
        if (!existing.catalogKeys.includes(k)) existing.catalogKeys.push(k);
      }
      for (const n of line.orderNumbers) {
        if (!existing.orderNumbers.includes(n)) existing.orderNumbers.push(n);
      }
      for (const o of line.orders) {
        if (!existing.orders.some((x) => x.brand === o.brand && x.id === o.id)) {
          existing.orders.push(o);
        }
      }
      if (linked) existing.linked = true;
      if (orderUrl && !existing.orderUrl) existing.orderUrl = orderUrl;
      if (unitCost != null && existing.unitCost == null) existing.unitCost = unitCost;
    } else {
      map.set(key, {
        ...line,
        blankName,
        supplier: supplier || "—",
        orderUrl,
        unitCost,
        linked,
        catalogKeys,
        productIds: [...line.productIds],
        orderNumbers: [...line.orderNumbers],
        orders: [...line.orders],
      });
    }
  }

  return [...map.values()].sort((a, b) => {
    const blank = a.blankName.localeCompare(b.blankName);
    if (blank) return blank;
    const color = a.color.localeCompare(b.color);
    if (color) return color;
    return a.size.localeCompare(b.size);
  });
}
