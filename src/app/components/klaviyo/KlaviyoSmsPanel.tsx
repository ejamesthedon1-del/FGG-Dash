"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  fetchKlaviyoCampaigns,
  sendKlaviyoSmsCampaign,
  type KlaviyoCampaign,
  type KlaviyoList,
  type KlaviyoSegment,
} from "../../lib/klaviyo-api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { cn } from "../ui/utils";

const DEFAULT_BODY = `Still want your 20% off?

Your code:
{% coupon_code 'SMSentry' %}

Shop now: www.sinnerstestimony.com`;

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid send time");
  return d.toISOString();
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(status: string | null | undefined): string {
  const s = (status || "").toLowerCase();
  if (s === "sent") return "text-emerald-700";
  if (s === "scheduled" || s === "sending") return "text-blue-700";
  if (s === "draft") return "text-amber-700";
  return "text-gray-600";
}

type Props = {
  lists: KlaviyoList[];
  segments: KlaviyoSegment[];
};

export function KlaviyoSmsPanel({ lists, segments }: Props) {
  const [name, setName] = React.useState("SMS re-engage — 20% off");
  const [audienceType, setAudienceType] = React.useState<"list" | "segment">(
    "list",
  );
  const [listId, setListId] = React.useState("");
  const [segmentId, setSegmentId] = React.useState("");
  const [body, setBody] = React.useState(DEFAULT_BODY);
  const [mode, setMode] = React.useState<"now" | "schedule">("now");
  const [sendAt, setSendAt] = React.useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return toLocalInputValue(d);
  });
  const [confirmSend, setConfirmSend] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [recent, setRecent] = React.useState<KlaviyoCampaign[]>([]);
  const [loadingRecent, setLoadingRecent] = React.useState(true);

  React.useEffect(() => {
    const smsList =
      lists.find((l) =>
        (l.name || "").toLowerCase().includes("text messaging"),
      ) || lists[0];
    if (smsList?.id && !listId) setListId(smsList.id);
  }, [lists, listId]);

  React.useEffect(() => {
    if (!segmentId && segments[0]?.id) setSegmentId(segments[0].id);
  }, [segments, segmentId]);

  const loadRecent = React.useCallback(async () => {
    setLoadingRecent(true);
    try {
      const res = await fetchKlaviyoCampaigns(25, "sms");
      setRecent(res.campaigns || []);
    } catch {
      setRecent([]);
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  React.useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const approxSegments = Math.max(1, Math.ceil(body.length / 160));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !body.trim()) {
      toast.error("Name and message are required");
      return;
    }
    if (audienceType === "list" && !listId) {
      toast.error("Pick a list");
      return;
    }
    if (audienceType === "segment" && !segmentId) {
      toast.error("Pick a segment");
      return;
    }
    if (mode === "now" && !confirmSend) {
      toast.error("Check the confirmation box to send now");
      return;
    }

    setBusy(true);
    try {
      const res = await sendKlaviyoSmsCampaign({
        name: name.trim(),
        body: body.trim(),
        listId: audienceType === "list" ? listId : undefined,
        segmentId: audienceType === "segment" ? segmentId : undefined,
        sendNow: mode === "now",
        sendAt: mode === "schedule" ? fromLocalInputValue(sendAt) : undefined,
        confirm: mode === "now" ? true : undefined,
      });
      toast.success(
        mode === "now"
          ? "SMS campaign queued to send now"
          : "SMS campaign scheduled",
      );
      setConfirmSend(false);
      void loadRecent();
      console.info("[klaviyo-sms]", res.campaignId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "SMS send failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div>
          <h3 className="text-[13px] font-medium tracking-wide text-gray-400">
            Send SMS
          </h3>
          <p className="mt-1 text-[13px] text-gray-500">
            Blast a list or segment. Coupon tags like{" "}
            <code className="text-[12px]">{"{% coupon_code 'SMSentry' %}"}</code>{" "}
            work the same as in flows.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="sms-name">Campaign name</Label>
            <Input
              id="sms-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Audience type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={audienceType === "list" ? "default" : "outline"}
                className="h-8"
                onClick={() => setAudienceType("list")}
              >
                List
              </Button>
              <Button
                type="button"
                size="sm"
                variant={audienceType === "segment" ? "default" : "outline"}
                className="h-8"
                onClick={() => setAudienceType("segment")}
              >
                Segment
              </Button>
            </div>
          </div>

          {audienceType === "list" ? (
            <div className="space-y-2">
              <Label htmlFor="sms-list">List</Label>
              <select
                id="sms-list"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                required
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name || l.id}
                    {typeof l.profileCount === "number"
                      ? ` (${l.profileCount})`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="sms-segment">Segment</Label>
              <select
                id="sms-segment"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={segmentId}
                onChange={(e) => setSegmentId(e.target.value)}
                required
              >
                {!segments.length ? (
                  <option value="">No segments — create one in Klaviyo</option>
                ) : null}
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="sms-body">Message</Label>
              <span className="text-[12px] text-gray-400">
                ~{body.length} chars · ~{approxSegments} SMS segment
                {approxSegments === 1 ? "" : "s"}
              </span>
            </div>
            <Textarea
              id="sms-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[160px] text-[14px] leading-6"
              required
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setBody(DEFAULT_BODY)}
              >
                Re-engage template
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() =>
                  setBody(
                    (prev) =>
                      `${prev.trim()}\n\n{% coupon_code 'SMSentry' %}`.trim(),
                  )
                }
              >
                Insert SMSentry coupon
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>When</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === "now" ? "default" : "outline"}
                className="h-8"
                onClick={() => setMode("now")}
              >
                Send now
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "schedule" ? "default" : "outline"}
                className="h-8"
                onClick={() => setMode("schedule")}
              >
                Schedule
              </Button>
            </div>
          </div>

          {mode === "schedule" ? (
            <div className="space-y-2">
              <Label htmlFor="sms-when">Send at</Label>
              <Input
                id="sms-when"
                type="datetime-local"
                value={sendAt}
                onChange={(e) => setSendAt(e.target.value)}
                required
              />
            </div>
          ) : (
            <label className="flex items-start gap-2 pt-6 text-[13px] text-gray-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmSend}
                onChange={(e) => setConfirmSend(e.target.checked)}
              />
              <span>
                I understand this will text the selected audience immediately.
              </span>
            </label>
          )}
        </div>

        <Button
          type="submit"
          disabled={
            busy ||
            (mode === "now" && !confirmSend) ||
            (audienceType === "segment" && !segments.length)
          }
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {mode === "now" ? "Send SMS campaign" : "Schedule SMS campaign"}
        </Button>
      </form>

      <section className="space-y-2 border-t border-black/[0.06] pt-6">
        <h3 className="text-[13px] font-medium tracking-wide text-gray-400">
          Recent SMS campaigns
        </h3>
        {loadingRecent ? (
          <p className="text-[14px] text-gray-400">Loading…</p>
        ) : (
          <ul className="border-t border-black/[0.06]">
            {recent.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-1 border-b border-black/[0.06] py-3 sm:flex-row sm:items-baseline sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-gray-950">
                    {c.name || "Untitled"}
                  </p>
                  <p className="text-[13px] text-gray-400">
                    {formatWhen(c.sendTime || c.scheduledAt)}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-[13px] capitalize",
                    statusTone(c.status),
                  )}
                >
                  {c.status || "—"}
                </span>
              </li>
            ))}
            {!recent.length ? (
              <li className="py-6 text-[14px] text-gray-400">
                No SMS campaigns yet
              </li>
            ) : null}
          </ul>
        )}
      </section>
    </div>
  );
}
