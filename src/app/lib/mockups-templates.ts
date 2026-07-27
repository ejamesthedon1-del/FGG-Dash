import type { MockupAspectRatio } from "./mockups-api";

export const MOCKUP_TEMPLATES_KEY = "fgg.mockups-templates.v1";
export const MOCKUP_ACTIVE_TEMPLATE_KEY = "fgg.mockups-active-template.v1";

export type MockupReferenceSlotDef = {
  label: string;
  description: string;
};

export type MockupResolution = "1K" | "2K" | "4K";

export type MockupPromptTemplate = {
  id: string;
  name: string;
  promptBody: string;
  slots: MockupReferenceSlotDef[];
  aspectRatio?: MockupAspectRatio;
  numImages?: 1 | 2;
  resolution?: MockupResolution;
  builtIn?: boolean;
};

export const REFS_PLACEHOLDER = "{{refs}}";

export const LIVDON_CLOTHING_SWAP_TEMPLATE: MockupPromptTemplate = {
  id: "builtin-livdon-clothing-swap",
  name: "Livdon clothing swap",
  builtIn: true,
  aspectRatio: "auto",
  numImages: 1,
  promptBody: `You are only changing the model's clothes. Swap the clothing on #1 with the exact product shown in #2. Keep the same model, pose, lighting, camera, and background from #1.

${REFS_PLACEHOLDER}

Rules:
- #1 = inspiration scene to preserve (model, pose, lighting, background)
- #2 = exact product garment that replaces inspiration clothing (color, logo, print placement, construction)
- #3 (if provided) = fabric textile reference only — material hand/nap, NOT color or logo

Deliver photoreal output that looks like a real camera photo, not AI-painted. Do not alter the product design. Do not distort the model's proportions.`,
  slots: [
    {
      label: "Inspiration",
      description:
        "Scene with model, pose, lighting, camera angle, and background to preserve",
    },
    {
      label: "Product",
      description:
        "Your exact garment — hoodie color, logo, print/paint placement, construction",
    },
    {
      label: "Fabric",
      description: "Textile close-up for material feel only (not color or logo)",
    },
  ],
};

export const BLANK_TEMPLATE: MockupPromptTemplate = {
  id: "builtin-blank",
  name: "Blank",
  builtIn: true,
  aspectRatio: "auto",
  numImages: 1,
  promptBody: `Describe what you want the model to do with each reference image.

${REFS_PLACEHOLDER}`,
  slots: [
    {
      label: "Reference 1",
      description: "What this image should show",
    },
  ],
};

export const FLAT_LAY_HOODIE_SWAP_TEMPLATE: MockupPromptTemplate = {
  id: "builtin-flat-lay-hoodie-swap",
  name: "Flat lay hoodie swap (4 ref)",
  builtIn: true,
  aspectRatio: "auto",
  numImages: 1,
  resolution: "4K",
  promptBody: `Replace the hoodie in #1 with the exact hoodie design from #4. Output must look like a real camera photo — not AI-generated. Zero stylization.

${REFS_PLACEHOLDER}

Scene & layout (from #1 only):
- Preserve the exact hoodie position, natural flat lay, wrinkles, folds, and drape from #1
- Preserve lighting, shadows, camera angle, lens character, depth of field, and background from #1
- The #4 hoodie must lay in the SAME wrinkled style and occupy the SAME position as the #1 hoodie

Design (from #4 only — 100% accuracy, no exceptions):
- Copy the exact garment design: base color, logo, paint splatter placement, graphic/print placement, construction
- Do not redesign, simplify, or reinterpret any part of #4
- Logo, paint, and print placement must match #4 pixel-for-pixel in proportion and position on the garment

Fabric realism (from #2 and #3 ONLY — textile reference):
- Use #2 and #3 strictly for hoodie fabric texture, knit/weave, nap, and material realism
- Do NOT take color, logo, paint, graphics, scene, or layout from #2 or #3
- Apply only the textile feel so the #4 design looks like physical fabric in the #1 scene

Quality bar:
- 100% photoreal — must pass as an unedited product photo at 4K clarity
- Preserve camera quality from #1
- Match wrinkle pattern from #1 while wearing the full design from #4`,
  slots: [
    {
      label: "Scene reference",
      description:
        "Flat-lay scene — preserve hoodie position, natural lay, wrinkles, lighting, camera, and background",
    },
    {
      label: "Fabric texture A",
      description: "Textile close-up ONLY — fabric weave/nap/hand (no color, logo, or design)",
    },
    {
      label: "Fabric texture B",
      description: "Second textile close-up ONLY — fabric detail (no color, logo, or design)",
    },
    {
      label: "Product design",
      description:
        "Exact hoodie design — base color, logo, paint splatter, graphic print, construction (100% accurate)",
    },
  ],
};

const BUILT_IN_TEMPLATES = [
  FLAT_LAY_HOODIE_SWAP_TEMPLATE,
  LIVDON_CLOTHING_SWAP_TEMPLATE,
  BLANK_TEMPLATE,
];

function safeParseTemplates(raw: string | null): MockupPromptTemplate[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (row): row is MockupPromptTemplate =>
        !!row &&
        typeof row === "object" &&
        typeof (row as MockupPromptTemplate).id === "string" &&
        typeof (row as MockupPromptTemplate).name === "string" &&
        typeof (row as MockupPromptTemplate).promptBody === "string" &&
        Array.isArray((row as MockupPromptTemplate).slots),
    );
  } catch {
    return [];
  }
}

export function loadMockupTemplates(): MockupPromptTemplate[] {
  if (typeof localStorage === "undefined") return [...BUILT_IN_TEMPLATES];
  const custom = safeParseTemplates(localStorage.getItem(MOCKUP_TEMPLATES_KEY));
  return [...BUILT_IN_TEMPLATES, ...custom];
}

export function saveCustomMockupTemplates(templates: MockupPromptTemplate[]): void {
  if (typeof localStorage === "undefined") return;
  const custom = templates.filter((t) => !t.builtIn);
  localStorage.setItem(MOCKUP_TEMPLATES_KEY, JSON.stringify(custom));
}

export function loadActiveTemplateId(): string {
  if (typeof localStorage === "undefined") return FLAT_LAY_HOODIE_SWAP_TEMPLATE.id;
  return (
    localStorage.getItem(MOCKUP_ACTIVE_TEMPLATE_KEY) ?? FLAT_LAY_HOODIE_SWAP_TEMPLATE.id
  );
}

export function saveActiveTemplateId(id: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MOCKUP_ACTIVE_TEMPLATE_KEY, id);
}

export function buildReferenceBlock(slots: MockupReferenceSlotDef[]): string {
  if (!slots.length) return "";
  const lines = slots.map(
    (slot, index) => `#${index + 1} ${slot.label} — ${slot.description}`,
  );
  return `Reference images:\n${lines.join("\n")}`;
}

export function compileMockupPrompt(
  promptBody: string,
  slots: MockupReferenceSlotDef[],
): string {
  const refs = buildReferenceBlock(slots);
  if (promptBody.includes(REFS_PLACEHOLDER)) {
    return promptBody.replaceAll(REFS_PLACEHOLDER, refs).trim();
  }
  if (!refs) return promptBody.trim();
  return `${promptBody.trim()}\n\n${refs}`.trim();
}

export function createTemplateId(): string {
  return `template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultSlot(index: number): MockupReferenceSlotDef {
  return {
    label: `Reference ${index + 1}`,
    description: "What this image should show",
  };
}

export function cloneTemplate(template: MockupPromptTemplate): MockupPromptTemplate {
  return {
    ...template,
    slots: template.slots.map((slot) => ({ ...slot })),
  };
}
