"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  scheduleKlaviyoCampaign,
  type KlaviyoCampaign,
  type KlaviyoList,
  type KlaviyoTemplate,
} from "../../lib/klaviyo-api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { cn } from "../ui/utils";

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid send time");
  return d.toISOString();
}

function campaignWhen(c: KlaviyoCampaign): Date | null {
  const raw = c.sendTime || c.scheduledAt;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function statusTone(status: string | null | undefined): string {
  const s = (status || "").toLowerCase();
  if (s === "sent") return "text-emerald-700";
  if (s === "scheduled" || s === "sending") return "text-blue-700";
  if (s === "draft") return "text-amber-700";
  return "text-gray-600";
}

type Props = {
  campaigns: KlaviyoCampaign[];
  templates: KlaviyoTemplate[];
  lists: KlaviyoList[];
  defaultFromEmail?: string | null;
  defaultFromLabel?: string | null;
  onScheduled: () => void;
};

export function KlaviyoSchedulePanel({
  campaigns,
  templates,
  lists,
  defaultFromEmail,
  defaultFromLabel,
  onScheduled,
}: Props) {
  const [mode, setMode] = React.useState<"week" | "month">("week");
  const [anchor, setAnchor] = React.useState(() => new Date());
  const [busy, setBusy] = React.useState(false);

  const [name, setName] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");
  const [listId, setListId] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [previewText, setPreviewText] = React.useState("");
  const [sendAt, setSendAt] = React.useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return toLocalInputValue(d);
  });
  const [fromEmail, setFromEmail] = React.useState(defaultFromEmail || "");

  React.useEffect(() => {
    if (defaultFromEmail && !fromEmail) setFromEmail(defaultFromEmail);
  }, [defaultFromEmail, fromEmail]);

  React.useEffect(() => {
    if (!templateId && templates[0]?.id) setTemplateId(templates[0].id);
  }, [templates, templateId]);

  React.useEffect(() => {
    if (!listId && lists[0]?.id) setListId(lists[0].id);
  }, [lists, listId]);

  const days = React.useMemo(() => {
    if (mode === "week") {
      const start = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
      });
    }
    const start = startOfMonth(anchor);
    const firstWeekday = (start.getDay() + 6) % 7;
    const gridStart = new Date(start);
    gridStart.setDate(1 - firstWeekday);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [anchor, mode]);

  const byDay = React.useMemo(() => {
    const map = new Map<string, KlaviyoCampaign[]>();
    for (const c of campaigns) {
      const when = campaignWhen(c);
      if (!when) continue;
      const key = `${when.getFullYear()}-${when.getMonth()}-${when.getDate()}`;
      const arr = map.get(key) || [];
      arr.push(c);
      map.set(key, arr);
    }
    return map;
  }, [campaigns]);

  const label = mode === "week"
    ? `Week of ${startOfWeek(anchor).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const shift = (dir: -1 | 1) => {
    const next = new Date(anchor);
    if (mode === "week") next.setDate(next.getDate() + dir * 7);
    else next.setMonth(next.getMonth() + dir);
    setAnchor(next);
  };

  const pickDay = (day: Date) => {
    const d = new Date(day);
    d.setHours(10, 0, 0, 0);
    setSendAt(toLocalInputValue(d));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !templateId || !listId || !subject.trim()) {
      toast.error("Name, template, list, and subject are required");
      return;
    }
    setBusy(true);
    try {
      await scheduleKlaviyoCampaign({
        name: name.trim(),
        templateId,
        listId,
        subject: subject.trim(),
        previewText: previewText.trim() || undefined,
        sendAt: fromLocalInputValue(sendAt),
        fromEmail: fromEmail.trim() || undefined,
        fromLabel:
          typeof defaultFromLabel === "string" && defaultFromLabel
            ? defaultFromLabel
            : undefined,
      });
      toast.success("Campaign scheduled in Klaviyo");
      setName("");
      setSubject("");
      setPreviewText("");
      onScheduled();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Schedule failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-medium tracking-wide text-gray-400">
            {label}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "week" ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => setMode("week")}
            >
              Week
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "month" ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => setMode("month")}
            >
              Month
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => shift(-1)}
            >
              Prev
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => setAnchor(new Date())}
            >
              Today
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => shift(1)}
            >
              Next
            </Button>
          </div>
        </div>

        <div
          className={cn(
            "grid gap-px border border-black/[0.06] bg-black/[0.06]",
            mode === "week" ? "grid-cols-1 sm:grid-cols-7" : "grid-cols-7",
          )}
        >
          {days.map((day) => {
            const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
            const items = byDay.get(key) || [];
            const inMonth =
              mode === "week" || day.getMonth() === anchor.getMonth();
            const isToday = sameDay(day, new Date());
            return (
              <button
                key={key + String(day.getTime())}
                type="button"
                onClick={() => pickDay(day)}
                className={cn(
                  "min-h-[88px] bg-white p-2 text-left align-top",
                  !inMonth && "opacity-40",
                  isToday && "ring-1 ring-inset ring-blue-500/40",
                )}
              >
                <p className="text-[12px] text-gray-400">
                  {day.toLocaleDateString(undefined, {
                    weekday: mode === "week" ? "short" : undefined,
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                <ul className="mt-1 space-y-1">
                  {items.slice(0, mode === "week" ? 6 : 3).map((c) => (
                    <li
                      key={c.id}
                      className={cn(
                        "truncate text-[12px]",
                        statusTone(c.status),
                      )}
                      title={c.name || "Campaign"}
                    >
                      {c.name || "Untitled"}
                    </li>
                  ))}
                  {items.length > (mode === "week" ? 6 : 3) ? (
                    <li className="text-[11px] text-gray-400">
                      +{items.length - (mode === "week" ? 6 : 3)} more
                    </li>
                  ) : null}
                </ul>
              </button>
            );
          })}
        </div>
        <p className="text-[12px] text-gray-400">
          Tap a day to set the send time, then schedule below.
        </p>
      </section>

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4 border-t border-black/[0.06] pt-6">
        <h3 className="text-[13px] font-medium tracking-wide text-gray-400">
          Schedule an email
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="sched-name">Campaign name</Label>
            <Input
              id="sched-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Friday drop"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sched-template">Template</Label>
            <select
              id="sched-template"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              required
            >
              {!templates.length ? (
                <option value="">Create a template first</option>
              ) : null}
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || t.id}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sched-list">List</Label>
            <select
              id="sched-list"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              required
            >
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name || l.id}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sched-subject">Subject</Label>
            <Input
              id="sched-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Something new just dropped"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sched-when">Send at</Label>
            <Input
              id="sched-when"
              type="datetime-local"
              value={sendAt}
              onChange={(e) => setSendAt(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sched-preview">Preview text</Label>
            <Input
              id="sched-preview"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="Optional inbox preview"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sched-from">From email</Label>
            <Input
              id="sched-from"
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="hello@yourbrand.com"
            />
          </div>
        </div>
        <Button type="submit" disabled={busy || !templates.length}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Schedule in Klaviyo
        </Button>
      </form>
    </div>
  );
}
