import { apiUrl } from "./api-base";

export const SHOPIFY_PUSH_BRANDS = [
  { slug: "live-don", label: "Livdon" },
  { slug: "sinners-testimony", label: "Sinners Testimony" },
] as const;

export type ShopifyPushBrand = (typeof SHOPIFY_PUSH_BRANDS)[number]["slug"];

export const DEFAULT_APPAREL_SIZES = ["S", "M", "L", "XL", "2XL"] as const;

export type PushShopifyProductInput = {
  brand: ShopifyPushBrand | string;
  title: string;
  descriptionHtml?: string;
  price?: string;
  sizes?: string[];
  color?: string;
  imageUrls?: string[];
  productType?: string;
  tags?: string[];
  status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
};

export type PushShopifyProductResult = {
  brand: string;
  brandLabel?: string;
  product: {
    id: string;
    title: string;
    handle?: string;
    status?: string;
  };
  variants?: Array<{ id?: string; title?: string; price?: string }>;
  adminUrl?: string;
  imageCount?: number;
};

function errorDetail(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "message" in item) {
          return String((item as { message: unknown }).message);
        }
        return JSON.stringify(item);
      })
      .join("; ");
  }
  if (detail) return JSON.stringify(detail);
  return fallback;
}

export async function pushShopifyProduct(
  input: PushShopifyProductInput,
): Promise<PushShopifyProductResult> {
  const res = await fetch(apiUrl("/api/shopify/products"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brand: input.brand,
      title: input.title.trim(),
      description_html: input.descriptionHtml?.trim() || undefined,
      price: input.price?.trim() || undefined,
      sizes: input.sizes?.length ? input.sizes : undefined,
      color: input.color?.trim() || undefined,
      image_urls: input.imageUrls?.filter(Boolean),
      product_type: input.productType?.trim() || undefined,
      tags: input.tags,
      status: input.status ?? "DRAFT",
    }),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = errorDetail(await res.json(), detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Shopify push failed (${res.status})`);
  }

  return res.json() as Promise<PushShopifyProductResult>;
}
