import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Clock, Square } from "lucide-react";
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
  sessionDurationMs,
  switchActivity,
  type TimeActivity,
  type TimeSession,
} from "../lib/time-clock-storage";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { cn } from "./ui/utils";

function currentActivity(session: TimeSession): string {
  return session.segments[session.segments.length - 1]?.activity ?? TIME_ACTIVITIES[0];
}

function asSelectableActivity(value: string): TimeActivity {
  return (TIME_ACTIVITIES as readonly string[]).includes(value)
    ? (value as TimeActivity)
    : TIME_ACTIVITIES[0];
}

/** Compact clock controls — parked on CEO dashboard until clock work is finished. */
export function TimeClockStickyBar() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const userEmail = user?.email ?? "";
  const userName = userFirstName(user) || userEmail.split("@")[0] || "You";

  const [tick, setTick] = useState(0);
  const [active, setActive] = useState<TimeSession | null>(null);
  const [pick, setPick] = useState<TimeActivity>(TIME_ACTIVITIES[0]);

  const reload = () => {
    const session = getActiveSession(userId);
    setActive(session);
    if (session) {
      setPick(asSelectableActivity(currentActivity(session)));
    }
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

  if (!userId) return null;

  void tick;
  const elapsed = active ? sessionDurationMs(active) : 0;

  const onTaskChange = (value: string) => {
    const next = asSelectableActivity(value);
    setPick(next);
    if (!active) return;
    if (next === currentActivity(active)) return;
    switchActivity(userId, next);
    reload();
    toast.message(`Switched to ${activityLabel(next)}`);
  };

  const onClockIn = () => {
    clockIn({
      userId,
      userEmail,
      userName,
      activity: pick,
    });
    reload();
    toast.success(`Clocked in · ${activityLabel(pick)}`);
  };

  const onClockOut = () => {
    clockOut(userId);
    reload();
    toast.success("Clocked out");
  };

  return (
    <div
      className={cn(
        "flex min-w-0 max-w-full items-center gap-1.5 sm:gap-2",
        active && "rounded-lg bg-emerald-50 px-1.5 py-1 sm:px-2",
      )}
    >
      <Link
        to="/clock"
        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-gray-700 hover:text-gray-950 sm:text-sm"
        title="Open Clock"
      >
        <Clock className="h-3.5 w-3.5 shrink-0" />
        {active ? (
          <span className="tabular-nums text-emerald-700">{formatDuration(elapsed)}</span>
        ) : (
          <span className="hidden text-gray-500 sm:inline">Clock</span>
        )}
      </Link>

      <Select value={pick} onValueChange={onTaskChange}>
        <SelectTrigger size="sm" className="h-8 min-w-0 max-w-[9.5rem] bg-white sm:max-w-[12rem]">
          <SelectValue placeholder="Task" />
        </SelectTrigger>
        <SelectContent position="popper" side="bottom" align="end">
          {TIME_ACTIVITIES.map((a) => (
            <SelectItem key={a} value={a}>
              {activityLabel(a)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {active ? (
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={onClockOut}
          className="shrink-0 border-emerald-200 bg-white"
        >
          <Square className="size-3 sm:mr-1" />
          <span className="hidden sm:inline">Out</span>
        </Button>
      ) : (
        <Button type="button" size="xs" onClick={onClockIn} className="shrink-0">
          In
        </Button>
      )}
    </div>
  );
}
