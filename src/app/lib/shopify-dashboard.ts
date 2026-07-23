/** Brands whose Brand Hub KPIs pull from the Shopify backend. */
export const SHOPIFY_LIVE_BRAND_SLUGS = new Set(["live-don", "sinners-testimony"]);

export const SHOPIFY_BRAND_LABELS: Record<string, string> = {
  "live-don": "Liv Don",
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
  timezone?: string;
  currency: string;
  dailySales: number;
  dailyOrderCount: number;
  monthSales: number;
  monthOrderCount: number;
  dailyFees: number;
  monthFees: number;
  dailyShipping: number;
  monthShipping: number;
  dailyOrderShipping: ShopifyOrderShipping[];
  dailyItems: ShopifySoldItem[];
  dailyItemUnits: number;
  monthItems: ShopifySoldItem[];
  monthItemUnits: number;
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

export async function fetchShopifyBrandKpis(brand: string): Promise<ShopifyBrandKpis> {
  const res = await fetch(`/api/shopify/brand-kpis?brand=${encodeURIComponent(brand)}`);
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
  const res = await fetch(`/api/shopify/products?brand=${encodeURIComponent(brand)}`);
  if (!res.ok) {
    throw new Error(`Products request failed (${res.status})`);
  }
  const body = (await res.json()) as { products?: ShopifyProduct[] };
  return body.products ?? [];
}
