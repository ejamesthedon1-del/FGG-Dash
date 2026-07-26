import {
  shiftDueTodayStorageKey,
  writeLocalAndSync,
} from "@/lib/synced-storage";

/** Completed Due today checklist items for one user on one calendar day. */
export type ShiftDueTodayDoneMap = Record<string, boolean>;

function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDoneMap(raw: string | null): ShiftDueTodayDoneMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: ShiftDueTodayDoneMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof key === "string" && key.trim() && value === true) {
        out[key] = true;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function loadShiftDueTodayDone(
  userId: string | null | undefined,
  dateIso: string = todayIsoLocal(),
): ShiftDueTodayDoneMap {
  if (!userId?.trim() || typeof window === "undefined") return {};
  return parseDoneMap(
    window.localStorage.getItem(shiftDueTodayStorageKey(userId, dateIso)),
  );
}

export function saveShiftDueTodayDone(
  userId: string | null | undefined,
  done: ShiftDueTodayDoneMap,
  dateIso: string = todayIsoLocal(),
): void {
  if (!userId?.trim() || typeof window === "undefined") return;
  writeLocalAndSync(shiftDueTodayStorageKey(userId, dateIso), JSON.stringify(done));
}

export function toggleShiftDueTodayItem(
  userId: string | null | undefined,
  item: string,
  completed: boolean,
  current: ShiftDueTodayDoneMap,
  dateIso: string = todayIsoLocal(),
): ShiftDueTodayDoneMap {
  const next = { ...current };
  if (completed) next[item] = true;
  else delete next[item];
  saveShiftDueTodayDone(userId, next, dateIso);
  return next;
}

export { todayIsoLocal as shiftDueTodayDate };
