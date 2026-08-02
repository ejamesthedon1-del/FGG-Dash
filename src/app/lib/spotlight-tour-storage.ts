/** Per-user spotlight tour completion. */

const STORAGE_PREFIX = "fgg.spotlight-tours.v1:";

export type SpotlightTourId = "orders";

type TourState = {
  completed: Partial<Record<SpotlightTourId, string>>;
};

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId.trim() || "anon"}`;
}

function readState(userId: string): TourState {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { completed: {} };
    const parsed = JSON.parse(raw) as TourState;
    return { completed: parsed.completed ?? {} };
  } catch {
    return { completed: {} };
  }
}

function writeState(userId: string, state: TourState): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

export function isSpotlightTourComplete(
  userId: string | undefined | null,
  tourId: SpotlightTourId,
): boolean {
  if (!userId) return true;
  return Boolean(readState(userId).completed[tourId]);
}

export function markSpotlightTourComplete(
  userId: string | undefined | null,
  tourId: SpotlightTourId,
): void {
  if (!userId) return;
  const state = readState(userId);
  state.completed[tourId] = new Date().toISOString();
  writeState(userId, state);
}

export function resetSpotlightTour(
  userId: string | undefined | null,
  tourId: SpotlightTourId,
): void {
  if (!userId) return;
  const state = readState(userId);
  delete state.completed[tourId];
  writeState(userId, state);
}
