export const MOCKUP_PROMPT_TEMPLATES_KEY = "fgg.mockups-prompt-templates.v1";
const MAX_TEMPLATES = 50;

export type MockupPromptTemplate = {
  id: string;
  name: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
};

function safeParse(raw: string | null): MockupPromptTemplate[] {
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
        typeof (row as MockupPromptTemplate).prompt === "string",
    );
  } catch {
    return [];
  }
}

export function loadMockupPromptTemplates(): MockupPromptTemplate[] {
  if (typeof localStorage === "undefined") return [];
  return safeParse(localStorage.getItem(MOCKUP_PROMPT_TEMPLATES_KEY));
}

export function saveMockupPromptTemplates(templates: MockupPromptTemplate[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    MOCKUP_PROMPT_TEMPLATES_KEY,
    JSON.stringify(templates.slice(0, MAX_TEMPLATES)),
  );
}

export function addMockupPromptTemplate(
  name: string,
  prompt: string,
): MockupPromptTemplate[] {
  const trimmedName = name.trim();
  const trimmedPrompt = prompt.trim();
  if (!trimmedName || !trimmedPrompt) return loadMockupPromptTemplates();

  const now = new Date().toISOString();
  const next: MockupPromptTemplate = {
    id: `prompt-template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmedName,
    prompt: trimmedPrompt,
    createdAt: now,
    updatedAt: now,
  };
  const merged = [next, ...loadMockupPromptTemplates()].slice(0, MAX_TEMPLATES);
  saveMockupPromptTemplates(merged);
  return merged;
}

export function deleteMockupPromptTemplate(id: string): MockupPromptTemplate[] {
  const merged = loadMockupPromptTemplates().filter((t) => t.id !== id);
  saveMockupPromptTemplates(merged);
  return merged;
}
