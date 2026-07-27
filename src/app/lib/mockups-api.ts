import { apiUrl } from "./api-base";

export type MockupAspectRatio =
  | "auto"
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
  prompt: string;
  images: File[];
  aspectRatio?: MockupAspectRatio;
  numImages?: 1 | 2 | 3 | 4;
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
  model?: string;
  description?: string;
  imageCount?: number;
};

export async function generateClothingMockup(
  input: MockupGenerateInput,
): Promise<MockupGenerateResult> {
  const form = new FormData();
  form.append("prompt", input.prompt.trim());
  for (const file of input.images) {
    form.append("images", file);
  }
  form.append("aspect_ratio", input.aspectRatio ?? "auto");
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
