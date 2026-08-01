import { writeLocalAndSync } from "@/lib/synced-storage";

export const TIME_CLOCK_KEY = "fgg.time-clock.v1";

export const TIME_ACTIVITIES = [
  "sewing_tags",
  "ordering_blanks",
  "painting_hoodies",
  "sewing_denim",
  "distressing_denim",
  "packaging",
  "monitoring_orders",
  "support",
] as const;

export type TimeActivity = (typeof TIME_ACTIVITIES)[number];

export const TIME_ACTIVITY_LABELS: Record<TimeActivity, string> = {
  sewing_tags: "Sewing tags",
  ordering_blanks: "Ordering blanks",
  painting_hoodies: "Painting hoodies",
  sewing_denim: "Sewing denim",
  distressing_denim: "Distressing denim",
  packaging: "Packaging orders",
  monitoring_orders: "Monitoring orders",
  support: "Support inbox",
};

export function activityLabel(activity: string): string {
  if ((TIME_ACTIVITIES as readonly string[]).includes(activity)) {
    return TIME_ACTIVITY_LABELS[activity as TimeActivity];
  }
  return activity.replace(/_/g, " ");
}

export type TimeSegment = {
  activity: TimeActivity | string;
  note: string;
  startedAt: string;
  endedAt: string | null;
};

export type TimeSession = {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  startedAt: string;
  endedAt: string | null;
  segments: TimeSegment[];
};

type TimeClockStore = {
  sessions: TimeSession[];
};

const MAX_SESSIONS = 500;

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return `tc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyStore(): TimeClockStore {
  return { sessions: [] };
}

function isActivity(value: unknown): value is TimeActivity {
  return (
    typeof value === "string" &&
    (TIME_ACTIVITIES as readonly string[]).includes(value)
  );
}

function parseStore(raw: string | null): TimeClockStore {
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return emptyStore();
    const sessionsRaw = (parsed as { sessions?: unknown }).sessions;
    if (!Array.isArray(sessionsRaw)) return emptyStore();
    const sessions: TimeSession[] = [];
    for (const row of sessionsRaw) {
      if (!row || typeof row !== "object") continue;
      const s = row as Record<string, unknown>;
      if (typeof s.id !== "string" || typeof s.userId !== "string") continue;
      if (typeof s.startedAt !== "string") continue;
      const segmentsRaw = Array.isArray(s.segments) ? s.segments : [];
      const segments: TimeSegment[] = [];
      for (const seg of segmentsRaw) {
        if (!seg || typeof seg !== "object") continue;
        const g = seg as Record<string, unknown>;
        if (typeof g.activity !== "string" || typeof g.startedAt !== "string") continue;
        segments.push({
          activity: isActivity(g.activity) ? g.activity : g.activity,
          note: typeof g.note === "string" ? g.note : "",
          startedAt: g.startedAt,
          endedAt: typeof g.endedAt === "string" ? g.endedAt : null,
        });
      }
      if (!segments.length) continue;
      sessions.push({
        id: s.id,
        userId: s.userId,
        userEmail: typeof s.userEmail === "string" ? s.userEmail : "",
        userName: typeof s.userName === "string" ? s.userName : "",
        startedAt: s.startedAt,
        endedAt: typeof s.endedAt === "string" ? s.endedAt : null,
        segments,
      });
    }
    return { sessions: sessions.slice(0, MAX_SESSIONS) };
  } catch {
    return emptyStore();
  }
}

function persist(store: TimeClockStore): void {
  if (typeof window === "undefined") return;
  writeLocalAndSync(
    TIME_CLOCK_KEY,
    JSON.stringify({ sessions: store.sessions.slice(0, MAX_SESSIONS) }),
  );
}

export function loadTimeClockStore(): TimeClockStore {
  if (typeof window === "undefined") return emptyStore();
  return parseStore(window.localStorage.getItem(TIME_CLOCK_KEY));
}

export function getActiveSession(userId: string | null | undefined): TimeSession | null {
  if (!userId?.trim()) return null;
  const store = loadTimeClockStore();
  return (
    store.sessions.find((s) => s.userId === userId && s.endedAt == null) ?? null
  );
}

export function clockIn(input: {
  userId: string;
  userEmail?: string;
  userName?: string;
  activity: TimeActivity;
  note?: string;
}): TimeSession {
  const store = loadTimeClockStore();
  const existing = store.sessions.find(
    (s) => s.userId === input.userId && s.endedAt == null,
  );
  if (existing) return existing;

  const at = nowIso();
  const session: TimeSession = {
    id: newId(),
    userId: input.userId.trim(),
    userEmail: (input.userEmail || "").trim(),
    userName: (input.userName || "").trim(),
    startedAt: at,
    endedAt: null,
    segments: [
      {
        activity: input.activity,
        note: (input.note || "").trim(),
        startedAt: at,
        endedAt: null,
      },
    ],
  };
  store.sessions = [session, ...store.sessions].slice(0, MAX_SESSIONS);
  persist(store);
  window.dispatchEvent(new Event("fgg-time-clock-changed"));
  return session;
}

export function switchActivity(
  userId: string,
  activity: TimeActivity,
  note?: string,
): TimeSession | null {
  const store = loadTimeClockStore();
  const idx = store.sessions.findIndex(
    (s) => s.userId === userId && s.endedAt == null,
  );
  if (idx < 0) return null;
  const session = store.sessions[idx];
  const at = nowIso();
  const segments = session.segments.map((seg, i) =>
    i === session.segments.length - 1 && seg.endedAt == null
      ? { ...seg, endedAt: at }
      : seg,
  );
  segments.push({
    activity,
    note: (note || "").trim(),
    startedAt: at,
    endedAt: null,
  });
  const next = { ...session, segments };
  store.sessions = store.sessions.map((s, i) => (i === idx ? next : s));
  persist(store);
  window.dispatchEvent(new Event("fgg-time-clock-changed"));
  return next;
}

export function clockOut(userId: string): TimeSession | null {
  const store = loadTimeClockStore();
  const idx = store.sessions.findIndex(
    (s) => s.userId === userId && s.endedAt == null,
  );
  if (idx < 0) return null;
  const at = nowIso();
  const session = store.sessions[idx];
  const segments = session.segments.map((seg) =>
    seg.endedAt == null ? { ...seg, endedAt: at } : seg,
  );
  const next = { ...session, endedAt: at, segments };
  store.sessions = store.sessions.map((s, i) => (i === idx ? next : s));
  persist(store);
  window.dispatchEvent(new Event("fgg-time-clock-changed"));
  return next;
}

export function sessionsForUser(
  userId: string | null | undefined,
  limit = 40,
): TimeSession[] {
  if (!userId?.trim()) return [];
  return loadTimeClockStore()
    .sessions.filter((s) => s.userId === userId)
    .slice(0, limit);
}

export function allSessions(limit = 100): TimeSession[] {
  return loadTimeClockStore().sessions.slice(0, limit);
}

export function sessionDurationMs(
  session: TimeSession,
  now = Date.now(),
): number {
  const end = session.endedAt ? +new Date(session.endedAt) : now;
  const start = +new Date(session.startedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

export function segmentDurationMs(
  segment: TimeSegment,
  now = Date.now(),
): number {
  const end = segment.endedAt ? +new Date(segment.endedAt) : now;
  const start = +new Date(segment.startedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isSameLocalDay(iso: string, dayIso = todayIsoLocal()): boolean {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}` === dayIso;
  } catch {
    return false;
  }
}

export type DayHoursRow = {
  userId: string;
  userName: string;
  userEmail: string;
  totalMs: number;
  active: boolean;
  byActivity: Partial<Record<string, number>>;
};

export function summarizeDayHours(dayIso = todayIsoLocal()): DayHoursRow[] {
  const now = Date.now();
  const map = new Map<string, DayHoursRow>();
  for (const session of loadTimeClockStore().sessions) {
    const daySegments = session.segments.filter((seg) =>
      isSameLocalDay(seg.startedAt, dayIso),
    );
    if (!daySegments.length) continue;
    let row = map.get(session.userId);
    if (!row) {
      row = {
        userId: session.userId,
        userName: session.userName || session.userEmail || "Teammate",
        userEmail: session.userEmail,
        totalMs: 0,
        active: false,
        byActivity: {},
      };
      map.set(session.userId, row);
    }
    if (session.endedAt == null) row.active = true;
    for (const seg of daySegments) {
      const ms = segmentDurationMs(seg, now);
      row.totalMs += ms;
      row.byActivity[seg.activity] = (row.byActivity[seg.activity] || 0) + ms;
    }
  }
  return [...map.values()].sort((a, b) => b.totalMs - a.totalMs);
}
