import { apiUrl } from "./api-base";

/** Brands whose Brand Hub KPIs pull from the Shopify backend. */
export const SHOPIFY_LIVE_BRAND_SLUGS = new Set(["live-don", "sinners-testimony"]);

export const SHOPIFY_BRAND_LABELS: Record<string, string> = {
  "live-don": "Livdon",
  "sinners-testimony": "Sinners Testimony",
};

export type ShopifyOrderShipping = {
  name: string;
  shipping: number;
  orderTotal: number;
};

export type ShopifySoldItem = {
  name: string;
  units: number;
};

export type ShopifyBrandKpis = {
  date: string;
  monthStart: string;
  periodStart?: string;
  periodEnd?: string;
  timezone?: string;
  currency: string;
  dailySales: number;
  dailyOrderCount: number;
  monthSales: number;
  monthOrderCount: number;
  periodSales?: number;
  periodOrderCount?: number;
  dailyFees: number;
  monthFees: number;
  periodFees?: number;
  dailyShipping: number;
  monthShipping: number;
  periodShipping?: number;
  dailyOrderShipping: ShopifyOrderShipping[];
  dailyItems: ShopifySoldItem[];
  dailyItemUnits: number;
  monthItems: ShopifySoldItem[];
  monthItemUnits: number;
  periodItems?: ShopifySoldItem[];
  periodItemUnits?: number;
  topProduct: { name: string; units: number } | null;
  adsSpendToday?: {
    spend: number;
    currency: string;
    impressions?: number;
    clicks?: number;
    date?: string;
  } | null;
  adsSpendMonth?: {
    spend: number;
    currency: string;
    impressions?: number;
    clicks?: number;
    since?: string;
    until?: string;
  } | null;
  adsSpendPeriod?: {
    spend: number;
    currency: string;
    impressions?: number;
    clicks?: number;
    since?: string;
    until?: string;
  } | null;
  adsError?: string | null;
};

export type ShopifyProduct = {
  id: string;
  title: string;
  handle: string;
  status: string;
  totalInventory: number | null;
  updatedAt: string;
};

export function formatShopifyMoney(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

/** Compact label for today's cart/order line items. */
export function formatDailyItems(
  items: Array<{ name: string; units: number }>,
  totalUnits: number,
): string {
  if (!items.length || totalUnits <= 0) return "—";
  if (items.length === 1) {
    const only = items[0];
    return only.units > 1 ? `${only.name} ×${only.units}` : only.name;
  }
  const top = items[0];
  const extra = items.length - 1;
  return `${top.name} ×${top.units} +${extra} more`;
}

export async function fetchShopifyBrandKpis(
  brand: string,
  range?: { start: string; end: string },
): Promise<ShopifyBrandKpis> {
  const qs = new URLSearchParams({ brand });
  if (range?.start) qs.set("start", range.start);
  if (range?.end) qs.set("end", range.end);
  const res = await fetch(apiUrl(`/api/shopify/brand-kpis?${qs.toString()}`));
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Brand KPIs request failed (${res.status})`);
  }
  return res.json() as Promise<ShopifyBrandKpis>;
}

export async function fetchShopifyProducts(brand: string): Promise<ShopifyProduct[]> {
  const res = await fetch(
    apiUrl(`/api/shopify/products?brand=${encodeURIComponent(brand)}`),
  );
  if (!res.ok) {
    throw new Error(`Products request failed (${res.status})`);
  }
  const body = (await res.json()) as { products?: ShopifyProduct[] };
  return body.products ?? [];
}

export type ShopifyPaymentsBalance = {
  brand: string;
  configured: boolean;
  activated: boolean;
  balances: Array<{ amount: number; currency: string }>;
  /** Sum of USD balances only (for combined totals). */
  totalUsd: number;
  /** Primary / default-currency account balance. */
  primaryAmount: number;
  primaryCurrency: string;
  error?: string | null;
};

export async function fetchShopifyPaymentsBalance(
  brand: string,
): Promise<ShopifyPaymentsBalance> {
  const res = await fetch(
    apiUrl(`/api/shopify/payments-balance?brand=${encodeURIComponent(brand)}`),
  );
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Payments balance request failed (${res.status})`);
  }
  return res.json() as Promise<ShopifyPaymentsBalance>;
}
