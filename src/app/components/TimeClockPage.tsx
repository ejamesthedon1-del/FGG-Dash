import { useEffect, useState } from "react";
import { Clock, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/use-auth";
import { userFirstName } from "../lib/auth-roles";
import {
  TIME_ACTIVITIES,
  activityLabel,
  clockIn,
  clockOut,
  formatDuration,
  getActiveSession,
  isSameLocalDay,
  segmentDurationMs,
  sessionDurationMs,
  sessionsForUser,
  summarizeDayHours,
  switchActivity,
  todayIsoLocal,
  type TimeActivity,
  type TimeSession,
} from "../lib/time-clock-storage";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

function formatClock(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDayLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function currentActivity(session: TimeSession): string {
  return session.segments[session.segments.length - 1]?.activity ?? TIME_ACTIVITIES[0];
}

function asSelectableActivity(value: string): TimeActivity {
  return (TIME_ACTIVITIES as readonly string[]).includes(value)
    ? (value as TimeActivity)
    : TIME_ACTIVITIES[0];
}

export function TimeClockPage() {
  const { user, accountIsCeo } = useAuth();
  const userId = user?.id ?? "";
  const userEmail = user?.email ?? "";
  const userName = userFirstName(user) || userEmail.split("@")[0] || "You";

  const [tick, setTick] = useState(0);
  const [activity, setActivity] = useState<TimeActivity>(TIME_ACTIVITIES[0]);
  const [note, setNote] = useState("");
  const [active, setActive] = useState<TimeSession | null>(null);
  const [history, setHistory] = useState<TimeSession[]>([]);
  const [daySummary, setDaySummary] = useState(() => summarizeDayHours());

  const reload = () => {
    const session = getActiveSession(userId);
    setActive(session);
    if (session) {
      setActivity(asSelectableActivity(currentActivity(session)));
    }
    setHistory(sessionsForUser(userId, 30));
    setDaySummary(summarizeDayHours(todayIsoLocal()));
  };

  useEffect(() => {
    reload();
    const onChange = () => reload();
    window.addEventListener("fgg-time-clock-changed", onChange);
    window.addEventListener("fgg-storage-sync", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("fgg-time-clock-changed", onChange);
      window.removeEventListener("fgg-storage-sync", onChange);
      window.removeEventListener("storage", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1_000);
    return () => window.clearInterval(id);
  }, [active?.id]);

  void tick;
  const now = Date.now();
  const elapsed = active ? sessionDurationMs(active, now) : 0;
  const todayHistory = history.filter(
    (s) =>
      isSameLocalDay(s.startedAt) ||
      s.segments.some((seg) => isSameLocalDay(seg.startedAt)),
  );
  const earlierHistory = history.filter((s) => !todayHistory.includes(s));

  const handleClockIn = () => {
    if (!userId) {
      toast.error("Sign in to track time");
      return;
    }
    clockIn({
      userId,
      userEmail,
      userName,
      activity,
      note,
    });
    setNote("");
    reload();
    toast.success(`Clocked in · ${activityLabel(activity)}`);
  };

  const handleTaskChange = (value: string) => {
    const next = asSelectableActivity(value);
    setActivity(next);
    if (!userId || !active) return;
    if (next === currentActivity(active)) return;
    switchActivity(userId, next, note);
    setNote("");
    reload();
    toast.message(`Switched to ${activityLabel(next)}`);
  };

  const handleClockOut = () => {
    if (!userId) return;
    clockOut(userId);
    reload();
    toast.success("Clocked out");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-gray-900">
          <Clock className="h-5 w-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Clock</h1>
        </div>
        <p className="text-sm text-gray-500">
          Clock in when you start working. Switch task when you change what
          you&apos;re doing. Clock out when you&apos;re free.
        </p>
      </header>

      {active ? (
        <section className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">
                Clocked in
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-gray-900">
                {formatDuration(elapsed)}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                Since {formatClock(active.startedAt)} ·{" "}
                {activityLabel(currentActivity(active))}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-emerald-300 bg-white hover:bg-emerald-50"
              onClick={handleClockOut}
            >
              <Square className="mr-1.5 h-3.5 w-3.5" />
              Clock out
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Task</Label>
            <Select value={activity} onValueChange={handleTaskChange}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Select task" />
              </SelectTrigger>
              <SelectContent>
                {TIME_ACTIVITIES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {activityLabel(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="time-note" className="text-xs text-gray-600">
              Optional note (applied on next switch)
            </Label>
            <Input
              id="time-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. batch of 24"
              className="bg-white"
            />
          </div>

          {active.segments.length > 1 ? (
            <ul className="space-y-1 border-t border-emerald-100 pt-3 text-sm text-gray-600">
              {active.segments.map((seg, i) => (
                <li key={`${seg.startedAt}-${i}`} className="flex justify-between gap-3">
                  <span>
                    {activityLabel(seg.activity)}
                    {seg.note ? (
                      <span className="text-gray-400"> — {seg.note}</span>
                    ) : null}
                  </span>
                  <span className="tabular-nums text-gray-500">
                    {formatDuration(segmentDurationMs(seg, now))}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : (
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Task</Label>
            <Select
              value={activity}
              onValueChange={(v) => setActivity(asSelectableActivity(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select task" />
              </SelectTrigger>
              <SelectContent>
                {TIME_ACTIVITIES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {activityLabel(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="time-note-in" className="text-xs text-gray-600">
              Optional note
            </Label>
            <Input
              id="time-note-in"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. batch of 24"
            />
          </div>
          <Button type="button" onClick={handleClockIn} className="w-full sm:w-auto">
            <Play className="mr-1.5 h-3.5 w-3.5" />
            Clock in
          </Button>
        </section>
      )}

      {accountIsCeo ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Today — team hours</h2>
          {daySummary.length === 0 ? (
            <p className="text-sm text-gray-500">No one has clocked time today yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {daySummary.map((row) => (
                <li
                  key={row.userId}
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {row.userName}
                      {row.active ? (
                        <span className="ml-2 text-xs font-normal text-emerald-700">
                          · live
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-gray-500">
                      {Object.entries(row.byActivity)
                        .filter(([, ms]) => (ms || 0) > 0)
                        .map(
                          ([a, ms]) => `${activityLabel(a)} ${formatDuration(ms || 0)}`,
                        )
                        .join(" · ") || "—"}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-gray-900">
                    {formatDuration(row.totalMs)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Your sessions</h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray-500">No sessions yet.</p>
        ) : (
          <div className="space-y-4">
            {todayHistory.length > 0 ? (
              <SessionList title="Today" sessions={todayHistory} now={now} />
            ) : null}
            {earlierHistory.length > 0 ? (
              <SessionList title="Earlier" sessions={earlierHistory} now={now} />
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function SessionList({
  title,
  sessions,
  now,
}: {
  title: string;
  sessions: TimeSession[];
  now: number;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {title}
      </p>
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {sessions.map((s) => {
          const open = s.endedAt == null;
          return (
            <li key={s.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {formatDayLabel(s.startedAt)} · {formatClock(s.startedAt)}
                    {s.endedAt ? ` – ${formatClock(s.endedAt)}` : " – now"}
                    {open ? (
                      <span className="ml-2 text-xs font-normal text-emerald-700">
                        open
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {s.segments
                      .map((seg) => {
                        const label = activityLabel(seg.activity);
                        return seg.note ? `${label} (${seg.note})` : label;
                      })
                      .join(" → ")}
                  </p>
                </div>
                <p className="text-sm tabular-nums text-gray-700">
                  {formatDuration(sessionDurationMs(s, now))}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
