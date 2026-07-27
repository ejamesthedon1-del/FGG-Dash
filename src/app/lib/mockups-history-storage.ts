export const MOCKUPS_HISTORY_KEY = "fgg.mockups-history.v1";
const MAX_ITEMS = 20;

export type MockupHistoryItem = {
  id: string;
  createdAt: string;
  prompt: string;
  seed?: number;
  aspectRatio?: string;
  notes?: string;
  images: Array<{ url: string }>;
};

function safeParse(raw: string | null): MockupHistoryItem[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (row): row is MockupHistoryItem =>
        !!row &&
        typeof row === "object" &&
        typeof (row as MockupHistoryItem).id === "string" &&
        Array.isArray((row as MockupHistoryItem).images),
    );
  } catch {
    return [];
  }
}

export function loadMockupHistory(): MockupHistoryItem[] {
  if (typeof localStorage === "undefined") return [];
  return safeParse(localStorage.getItem(MOCKUPS_HISTORY_KEY));
}

export function saveMockupHistory(items: MockupHistoryItem[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MOCKUPS_HISTORY_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

export function prependMockupHistory(
  item: Omit<MockupHistoryItem, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  },
): MockupHistoryItem[] {
  const next: MockupHistoryItem = {
    id: item.id ?? `mockup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: item.createdAt ?? new Date().toISOString(),
    prompt: item.prompt,
    seed: item.seed,
    aspectRatio: item.aspectRatio,
    notes: item.notes,
    images: item.images,
  };
  const merged = [next, ...loadMockupHistory()].slice(0, MAX_ITEMS);
  saveMockupHistory(merged);
  return merged;
}

export function clearMockupHistory(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(MOCKUPS_HISTORY_KEY);
}
