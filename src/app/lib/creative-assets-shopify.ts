import { toast } from "sonner";

import {
  loadCreativeAssets,
  patchAsset,
  saveCreativeAssets,
  type AssetItem,
} from "./creative-assets-storage";
import { uploadShopifyFile } from "./shopify-files-api";

export const CREATIVE_ASSETS_HOST_BRAND_KEY =
  "fgg.creative-assets-host-brand.v1";

export type CreativeAssetsHostBrand = "live-don" | "sinners-testimony";

export function getCreativeAssetsHostBrand(): CreativeAssetsHostBrand {
  try {
    const v = localStorage.getItem(CREATIVE_ASSETS_HOST_BRAND_KEY);
    if (v === "sinners-testimony" || v === "live-don") return v;
  } catch {
    /* ignore */
  }
  return "live-don";
}

export function setCreativeAssetsHostBrand(brand: CreativeAssetsHostBrand) {
  try {
    localStorage.setItem(CREATIVE_ASSETS_HOST_BRAND_KEY, brand);
  } catch {
    /* ignore */
  }
}

function isHttps(url: string | undefined): boolean {
  return Boolean(url && /^https:\/\//i.test(url));
}

/**
 * Upload Creative Asset images into Shopify Files and persist CDN URLs.
 * Safe to call in the background after save — Schedule can then use shopifyUrl instantly.
 */
export async function hostCreativeAssetsOnShopify(
  assets: AssetItem[],
  options?: { brand?: string; quiet?: boolean },
): Promise<{ hosted: number; failed: number }> {
  const brand = (options?.brand === "sinners-testimony" ||
  options?.brand === "live-don"
    ? options.brand
    : getCreativeAssetsHostBrand()) as CreativeAssetsHostBrand;
  const quiet = options?.quiet ?? false;
  const images = assets.filter(
    (a) => a.kind === "image" && a.src && !isHttps(a.shopifyUrl),
  );
  if (!images.length) return { hosted: 0, failed: 0 };

  let hosted = 0;
  let failed = 0;
  const toastId = quiet
    ? undefined
    : toast.loading(
        images.length === 1
          ? "Hosting image on Shopify Files…"
          : `Hosting ${images.length} images on Shopify Files…`,
      );

  for (const asset of images) {
    try {
      if (isHttps(asset.src)) {
        const tree = loadCreativeAssets();
        saveCreativeAssets(
          patchAsset(tree, asset.id, {
            shopifyUrl: asset.src,
            shopifyBrand: brand,
          }),
        );
        hosted += 1;
        continue;
      }

      const result = await uploadShopifyFile({
        brand,
        source: asset.src!,
        filename: asset.name || undefined,
        alt: asset.name || undefined,
      });
      const tree = loadCreativeAssets();
      saveCreativeAssets(
        patchAsset(tree, asset.id, {
          shopifyUrl: result.url,
          shopifyBrand: brand,
          shopifyFileId: result.fileId,
        }),
      );
      hosted += 1;
    } catch (err) {
      failed += 1;
      console.warn("[creative-assets] Shopify host failed", asset.id, err);
    }
  }

  if (toastId != null) {
    if (failed === 0 && hosted > 0) {
      toast.success(
        hosted === 1
          ? "Shopify URL ready for Schedule"
          : `${hosted} Shopify URLs ready for Schedule`,
        { id: toastId },
      );
    } else if (hosted > 0) {
      toast.message(
        `Hosted ${hosted}; ${failed} failed (Schedule can retry)`,
        { id: toastId },
      );
    } else {
      toast.error(
        "Could not host on Shopify Files — add write_files scope if needed",
        { id: toastId },
      );
    }
  }

  return { hosted, failed };
}
