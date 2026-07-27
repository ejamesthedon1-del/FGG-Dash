export const MOCKUPS_AD_COPY_KEY = "fgg.mockups-ad-copy.v1";
const MAX_ADS = 40;
const MAX_VARIANTS_PER_AD = 20;
const MAX_IMAGE_CHARS = 1_200_000; // ~0.9MB base64 budget per ad image

export type AdCopyVariant = {
  id: string;
  headline: string;
  primaryText: string;
  description: string;
};

export type AdCopyCreative = {
  id: string;
  name: string;
  imageDataUrl: string | null;
  imageName: string | null;
  variants: AdCopyVariant[];
  createdAt: string;
  updatedAt: string;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeParse(raw: string | null): AdCopyCreative[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (row): row is AdCopyCreative =>
        !!row &&
        typeof row === "object" &&
        typeof (row as AdCopyCreative).id === "string" &&
        typeof (row as AdCopyCreative).name === "string" &&
        Array.isArray((row as AdCopyCreative).variants),
    );
  } catch {
    return [];
  }
}

export function loadAdCopyCreatives(): AdCopyCreative[] {
  if (typeof localStorage === "undefined") return [];
  return safeParse(localStorage.getItem(MOCKUPS_AD_COPY_KEY));
}

export function saveAdCopyCreatives(creatives: AdCopyCreative[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MOCKUPS_AD_COPY_KEY, JSON.stringify(creatives.slice(0, MAX_ADS)));
}

export function createEmptyVariant(): AdCopyVariant {
  return {
    id: newId("variant"),
    headline: "",
    primaryText: "",
    description: "",
  };
}

export function addAdCopyCreative(input: {
  name: string;
  imageDataUrl?: string | null;
  imageName?: string | null;
  variants?: AdCopyVariant[];
}): AdCopyCreative[] {
  const name = input.name.trim();
  if (!name) return loadAdCopyCreatives();

  const now = new Date().toISOString();
  const variants = (input.variants?.length ? input.variants : [createEmptyVariant()]).slice(
    0,
    MAX_VARIANTS_PER_AD,
  );

  const next: AdCopyCreative = {
    id: newId("ad"),
    name,
    imageDataUrl: input.imageDataUrl ?? null,
    imageName: input.imageName ?? null,
    variants,
    createdAt: now,
    updatedAt: now,
  };

  const merged = [next, ...loadAdCopyCreatives()].slice(0, MAX_ADS);
  saveAdCopyCreatives(merged);
  return merged;
}

export function updateAdCopyCreative(
  id: string,
  patch: Partial<Pick<AdCopyCreative, "name" | "imageDataUrl" | "imageName" | "variants">>,
): AdCopyCreative[] {
  const now = new Date().toISOString();
  const merged = loadAdCopyCreatives().map((ad) => {
    if (ad.id !== id) return ad;
    return {
      ...ad,
      ...patch,
      variants: (patch.variants ?? ad.variants).slice(0, MAX_VARIANTS_PER_AD),
      updatedAt: now,
    };
  });
  saveAdCopyCreatives(merged);
  return merged;
}

export function deleteAdCopyCreative(id: string): AdCopyCreative[] {
  const merged = loadAdCopyCreatives().filter((ad) => ad.id !== id);
  saveAdCopyCreatives(merged);
  return merged;
}

/** Resize/compress an image file into a data URL suitable for localStorage. */
export async function fileToAdImageDataUrl(file: File): Promise<{
  dataUrl: string;
  name: string;
}> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are supported");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Image too large (max 8MB)");
  }

  const bitmap = await createImageBitmap(file);
  const maxEdge = 1080;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not process image");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = 0.82;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > MAX_IMAGE_CHARS && quality > 0.45) {
    quality -= 0.12;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  if (dataUrl.length > MAX_IMAGE_CHARS) {
    throw new Error("Image is still too large after compression — try a smaller file");
  }

  return { dataUrl, name: file.name };
}

export async function copyText(text: string): Promise<boolean> {
  const value = text.trim();
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
