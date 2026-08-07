import { apiUrl } from "./api-base";

export type ShopifyFileUploadResult = {
  brand: string;
  brandLabel?: string;
  fileId: string;
  url: string;
  filename: string;
  byteLength?: number;
};

/** Upload image (data: or https) into Shopify Content → Files; returns CDN https URL. */
export async function uploadShopifyFile(input: {
  brand: string;
  source: string;
  filename?: string;
  alt?: string;
}): Promise<ShopifyFileUploadResult> {
  const res = await fetch(apiUrl("/api/shopify/files/upload"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brand: input.brand,
      source: input.source,
      filename: input.filename,
      alt: input.alt,
    }),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string | unknown };
      if (typeof body.detail === "string") detail = body.detail;
      else if (body.detail) detail = JSON.stringify(body.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Shopify file upload failed (${res.status})`);
  }

  return res.json() as Promise<ShopifyFileUploadResult>;
}
