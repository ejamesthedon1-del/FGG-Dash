import { apiUrl } from "./api-base";

export type MockupAspectRatio =
  | "21:9"
  | "16:9"
  | "4:3"
  | "3:2"
  | "1:1"
  | "2:3"
  | "3:4"
  | "9:16"
  | "9:21";

export type MockupGenerateInput = {
  inspiration: File;
  fabrics?: File[];
  products?: File[];
  logo?: File | null;
  notes?: string;
  aspectRatio?: MockupAspectRatio;
  numImages?: 1 | 2;
};

export type MockupImage = {
  url: string;
  contentType?: string;
  width?: number;
  height?: number;
};

export type MockupGenerateResult = {
  images: MockupImage[];
  prompt: string;
  seed?: number;
  aspectRatio?: string;
  designBrief?: string | null;
  photographerBrief?: string | null;
  referenceCount?: {
    inspiration: number;
    fabrics: number;
    products: number;
    logo?: number;
    livdonWordmark?: number;
  };
};

export async function generateClothingMockup(
  input: MockupGenerateInput,
): Promise<MockupGenerateResult> {
  const form = new FormData();
  form.append("inspiration", input.inspiration);
  for (const file of input.fabrics ?? []) {
    form.append("fabrics", file);
  }
  for (const file of input.products ?? []) {
    form.append("products", file);
  }
  if (input.logo) {
    form.append("logo", input.logo);
  }
  form.append("notes", input.notes?.trim() ?? "");
  form.append("aspect_ratio", input.aspectRatio ?? "3:4");
  form.append("num_images", String(input.numImages ?? 1));

  const res = await fetch(apiUrl("/api/mockups/generate"), {
    method: "POST",
    body: form,
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
    throw new Error(detail || `Mockup request failed (${res.status})`);
  }

  return res.json() as Promise<MockupGenerateResult>;
}
