"use client";

import * as React from "react";
import { Loader2, Mail, RefreshCw } from "lucide-react";
import { Link, Navigate, useParams } from "react-router";
import { toast } from "sonner";

import {
  fetchKlaviyoCampaigns,
  fetchKlaviyoFlows,
  fetchKlaviyoLists,
  fetchKlaviyoOverview,
  fetchKlaviyoSegments,
  fetchKlaviyoStatus,
  fetchKlaviyoTemplates,
  setKlaviyoFlowStatus,
  type KlaviyoCampaign,
  type KlaviyoFlow,
  type KlaviyoList,
  type KlaviyoOverview,
  type KlaviyoSegment,
  type KlaviyoTemplate,
} from "../lib/klaviyo-api";
import { KlaviyoSchedulePanel } from "./klaviyo/KlaviyoSchedulePanel";
import { KlaviyoSimpleFlowForm } from "./klaviyo/KlaviyoSimpleFlowForm";
import { KlaviyoSmsPanel } from "./klaviyo/KlaviyoSmsPanel";
import { KlaviyoTemplatesPanel } from "./klaviyo/KlaviyoTemplatesPanel";
import { Button } from "./ui/button";
import { cn } from "./ui/utils";

const EMAIL_SECTIONS = [
  "overview",
  "sms",
  "templates",
  "schedule",
  "campaigns",
  "flows",
  "lists",
] as const;

type EmailSection = (typeof EMAIL_SECTIONS)[number];

const SECTION_META: Record<
  EmailSection,
  { title: string; description: string }
> = {
  overview: {
    title: "Email",
    description:
      "Klaviyo overview — lists, recent campaigns, and account health.",
  },
  sms: {
    title: "SMS",
    description: "Send or schedule SMS campaigns and build re-engage segments.",
  },
  templates: {
    title: "Templates",
    description: "",
  },
  schedule: {
    title: "Schedule",
    description: "Plan and schedule email campaigns on a week or month view.",
  },
  campaigns: {
    title: "Campaigns",
    description: "Recent and upcoming email campaigns from Klaviyo.",
  },
  flows: {
    title: "Flows",
    description: "Spin up simple flows and toggle Live / Manual / Draft.",
  },
  lists: {
    title: "Lists",
    description: "Lists and segments in the connected Klaviyo account.",
  },
};

function parseEmailSection(raw: string | undefined): EmailSection | null {
  if (!raw || raw === "overview") return "overview";
  if ((EMAIL_SECTIONS as readonly string[]).includes(raw)) {
    return raw as EmailSection;
  }
  return null;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(status: string | null | undefined): string {
  const s = (status || "").toLowerCase();
  if (s === "live" || s === "sent") return "text-emerald-700";
  if (s === "scheduled" || s === "sending") return "text-blue-700";
  if (s === "manual" || s === "draft") return "text-amber-700";
  if (s === "cancelled" || s === "canceled") return "text-red-700";
  return "text-gray-600";
}

export function KlaviyoPage() {
  const { section: sectionParam } = useParams<{ section?: string }>();
  const section = parseEmailSection(sectionParam);
  const [configured, setConfigured] = React.useState<boolean | null>(null);
  const [overview, setOverview] = React.useState<KlaviyoOverview | null>(null);
  const [campaigns, setCampaigns] = React.useState<KlaviyoCampaign[]>([]);
  const [flows, setFlows] = React.useState<KlaviyoFlow[]>([]);
  const [lists, setLists] = React.useState<KlaviyoList[]>([]);
  const [segments, setSegments] = React.useState<KlaviyoSegment[]>([]);
  const [templates, setTemplates] = React.useState<KlaviyoTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyFlowId, setBusyFlowId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const status = await fetchKlaviyoStatus();
      setConfigured(status.configured);
      if (!status.configured) {
        setOverview(null);
        setCampaigns([]);
        setFlows([]);
        setLists([]);
        setSegments([]);
        setTemplates([]);
        return;
      }
      // Don't let one failing endpoint blank the whole page.
      const settled = await Promise.allSettled([
        fetchKlaviyoOverview(),
        fetchKlaviyoCampaigns(80),
        fetchKlaviyoFlows(50),
        fetchKlaviyoLists(50),
        fetchKlaviyoSegments(50),
        fetchKlaviyoTemplates(50),
      ]);
      const [ov, camps, flowRes, listRes, segRes, tplRes] = settled;
      const errors: string[] = [];

      if (ov.status === "fulfilled") setOverview(ov.value);
      else errors.push(ov.reason instanceof Error ? ov.reason.message : "Overview failed");

      if (camps.status === "fulfilled") setCampaigns(camps.value.campaigns || []);
      else {
        setCampaigns([]);
        errors.push(
          camps.reason instanceof Error ? camps.reason.message : "Campaigns failed",
        );
      }

      if (flowRes.status === "fulfilled") setFlows(flowRes.value.flows || []);
      else {
        setFlows([]);
        errors.push(
          flowRes.reason instanceof Error ? flowRes.reason.message : "Flows failed",
        );
      }

      if (listRes.status === "fulfilled") setLists(listRes.value.lists || []);
      else {
        setLists([]);
        errors.push(
          listRes.reason instanceof Error ? listRes.reason.message : "Lists failed",
        );
      }

      if (segRes.status === "fulfilled") setSegments(segRes.value.segments || []);
      else {
        setSegments([]);
        errors.push(
          segRes.reason instanceof Error
            ? segRes.reason.message
            : "Segments failed",
        );
      }

      if (tplRes.status === "fulfilled") setTemplates(tplRes.value.templates || []);
      else {
        setTemplates([]);
        errors.push(
          tplRes.reason instanceof Error
            ? tplRes.reason.message
            : "Templates failed",
        );
      }

      if (errors.length && settled.every((s) => s.status === "rejected")) {
        toast.error(errors[0] || "Klaviyo load failed");
      } else if (errors.length) {
        toast.message("Some Klaviyo data didn’t load", {
          description: errors[0],
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Klaviyo load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onFlowStatus = async (
    flow: KlaviyoFlow,
    status: "live" | "manual" | "draft",
  ) => {
    setBusyFlowId(flow.id);
    try {
      await setKlaviyoFlowStatus(flow.id, status);
      setFlows((prev) =>
        prev.map((f) => (f.id === flow.id ? { ...f, status } : f)),
      );
      toast.success(`${flow.name || "Flow"} → ${status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update flow");
    } finally {
      setBusyFlowId(null);
    }
  };

  const accountName =
    typeof overview?.account?.name === "string"
      ? overview.account.name
      : "Klaviyo";

  if (section === null) {
    return <Navigate to="/email" replace />;
  }

  const meta = SECTION_META[section];

  return (
    <div
      className={
        section === "templates"
          ? "w-full space-y-2 pb-6"
          : "w-full space-y-6 pb-10"
      }
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.03em] text-gray-950">
            {meta.title}
          </h2>
          {meta.description ? (
            <p className="mt-1 text-[15px] text-gray-500">{meta.description}</p>
          ) : null}
        </div>
        {section !== "templates" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Refresh
          </Button>
        ) : null}
      </header>

      {configured === false ? (
        <section className="space-y-3 border-t border-black/[0.06] pt-6">
          <div className="flex items-center gap-2 text-[15px] text-gray-950">
            <Mail className="size-4 text-gray-400" />
            Klaviyo not connected
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-[14px] text-gray-600">
            <li>
              In Klaviyo: Settings → Account → API keys → Create Private API Key
            </li>
            <li>
              Scopes:{" "}
              <code className="text-[12px]">
                accounts:read, campaigns:read, campaigns:write, templates:read,
                templates:write, flows:read, flows:write, lists:read,
                segments:read, segments:write, metrics:read
              </code>
            </li>
            <li>
              Set{" "}
              <code className="text-[12px]">KLAVIYO_PRIVATE_API_KEY</code> on
              Railway (and local <code className="text-[12px]">backend/.env</code>
              ), then redeploy / restart the API
            </li>
          </ol>
        </section>
      ) : null}

      {configured && section === "overview" ? (
        <div className="space-y-6">
          {loading && !overview ? (
            <p className="text-[14px] text-gray-400">Loading…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Live flows", overview?.counts.liveFlows ?? 0],
                  ["All flows", overview?.counts.flows ?? 0],
                  ["Lists", overview?.counts.lists ?? 0],
                  [
                    "Draft / scheduled",
                    overview?.counts.draftOrScheduledCampaigns ?? 0,
                  ],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="border-t border-black/[0.06] pt-3"
                  >
                    <p className="text-[12px] uppercase tracking-wide text-gray-400">
                      {label}
                    </p>
                    <p className="mt-1 text-[22px] font-semibold tabular-nums text-gray-950">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[13px] text-gray-500">
                Account:{" "}
                <span className="font-medium text-gray-800">{accountName}</span>
                {overview?.account?.timezone
                  ? ` · ${overview.account.timezone}`
                  : null}
              </p>
              <section className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[13px] font-medium tracking-wide text-gray-400">
                    Lists
                  </h3>
                  <Link
                    to="/email/lists"
                    className="text-[12px] text-blue-600 hover:text-blue-700"
                  >
                    View all
                  </Link>
                </div>
                <ul className="border-t border-black/[0.06]">
                  {(lists.length ? lists : overview?.lists || [])
                    .slice(0, 8)
                    .map((list) => (
                      <li
                        key={list.id}
                        className="flex items-baseline justify-between gap-3 border-b border-black/[0.06] py-3"
                      >
                        <span className="min-w-0 truncate text-[15px] text-gray-950">
                          {list.name || "Untitled list"}
                        </span>
                        <span className="shrink-0 text-[13px] tabular-nums text-gray-500">
                          {typeof list.profileCount === "number"
                            ? list.profileCount.toLocaleString()
                            : loading
                              ? "…"
                              : "—"}
                        </span>
                      </li>
                    ))}
                  {!lists.length && !overview?.lists?.length ? (
                    <li className="py-6 text-[14px] text-gray-400">
                      No lists in this Klaviyo account
                    </li>
                  ) : null}
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="text-[13px] font-medium tracking-wide text-gray-400">
                  Recent campaigns
                </h3>
                <ul className="border-t border-black/[0.06]">
                  {(overview?.recentCampaigns || campaigns)
                    .slice(0, 6)
                    .map((c) => (
                      <li
                        key={c.id}
                        className="flex items-baseline justify-between gap-3 border-b border-black/[0.06] py-3"
                      >
                        <span className="min-w-0 truncate text-[15px] text-gray-950">
                          {c.name || "Untitled"}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[13px] capitalize",
                            statusTone(c.status),
                          )}
                        >
                          {c.status || "—"}
                        </span>
                      </li>
                    ))}
                  {!overview?.recentCampaigns?.length && !campaigns.length ? (
                    <li className="py-6 text-[14px] text-gray-400">
                      No recent email campaigns
                    </li>
                  ) : null}
                </ul>
              </section>
            </>
          )}
        </div>
      ) : null}

      {configured && section === "sms" ? (
        <KlaviyoSmsPanel
          lists={lists}
          segments={segments}
          onSegmentsChange={setSegments}
        />
      ) : null}

      {configured && section === "templates" ? (
        <KlaviyoTemplatesPanel templates={templates} onChange={setTemplates} />
      ) : null}

      {configured && section === "schedule" ? (
        <KlaviyoSchedulePanel
          campaigns={campaigns}
          templates={templates}
          lists={lists}
          defaultFromEmail={
            typeof overview?.account?.defaultSenderEmail === "string"
              ? overview.account.defaultSenderEmail
              : null
          }
          defaultFromLabel={
            typeof overview?.account?.name === "string"
              ? overview.account.name
              : null
          }
          onScheduled={() => void load()}
        />
      ) : null}

      {configured && section === "campaigns" ? (
        <ul className="border-t border-black/[0.06]">
          {campaigns.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-1 border-b border-black/[0.06] py-3 sm:flex-row sm:items-baseline sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium text-gray-950">
                  {c.name || "Untitled"}
                </p>
                <p className="text-[13px] text-gray-400">
                  Send {formatWhen(c.sendTime || c.scheduledAt)}
                </p>
              </div>
              <span
                className={cn("text-[13px] capitalize", statusTone(c.status))}
              >
                {c.status || "—"}
              </span>
            </li>
          ))}
          {!loading && campaigns.length === 0 ? (
            <li className="py-8 text-[14px] text-gray-400">
              No email campaigns found
            </li>
          ) : null}
        </ul>
      ) : null}

      {configured && section === "flows" ? (
        <div className="space-y-6">
          <KlaviyoSimpleFlowForm
            templates={templates}
            lists={lists}
            defaultFromEmail={
              typeof overview?.account?.defaultSenderEmail === "string"
                ? overview.account.defaultSenderEmail
                : null
            }
            defaultFromLabel={
              typeof overview?.account?.name === "string"
                ? overview.account.name
                : null
            }
            onCreated={() => void load()}
          />
          <ul className="border-t border-black/[0.06]">
            {flows.map((flow) => {
              const status = (flow.status || "").toLowerCase();
              return (
                <li
                  key={flow.id}
                  className="flex flex-col gap-3 border-b border-black/[0.06] py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium text-gray-950">
                      {flow.name || "Untitled flow"}
                    </p>
                    <p className="text-[13px] text-gray-400">
                      <span className={cn("capitalize", statusTone(status))}>
                        {status || "—"}
                      </span>
                      {flow.triggerType ? ` · ${flow.triggerType}` : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={status === "live" ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      disabled={busyFlowId === flow.id || status === "live"}
                      onClick={() => void onFlowStatus(flow, "live")}
                    >
                      Live
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={status === "manual" ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      disabled={busyFlowId === flow.id || status === "manual"}
                      onClick={() => void onFlowStatus(flow, "manual")}
                    >
                      Manual
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="tertiary"
                      className="h-7 px-2 text-xs"
                      disabled={busyFlowId === flow.id || status === "draft"}
                      onClick={() => void onFlowStatus(flow, "draft")}
                    >
                      Draft
                    </Button>
                  </div>
                </li>
              );
            })}
            {!loading && flows.length === 0 ? (
              <li className="py-8 text-[14px] text-gray-400">No flows found</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {configured && section === "lists" ? (
        <div className="space-y-8">
          <section className="space-y-2">
            <h3 className="text-[13px] font-medium tracking-wide text-gray-400">
              Lists
            </h3>
            <ul className="border-t border-black/[0.06]">
              {lists.map((list) => (
                <li
                  key={list.id}
                  className="flex items-baseline justify-between gap-3 border-b border-black/[0.06] py-3"
                >
                  <span className="min-w-0 truncate text-[15px] text-gray-950">
                    {list.name || "Untitled list"}
                  </span>
                  <span className="shrink-0 text-[13px] tabular-nums text-gray-400">
                    {typeof list.profileCount === "number"
                      ? list.profileCount.toLocaleString()
                      : loading
                        ? "…"
                        : "—"}
                  </span>
                </li>
              ))}
              {!loading && lists.length === 0 ? (
                <li className="py-6 text-[14px] text-gray-400">No lists</li>
              ) : null}
            </ul>
          </section>
          <section className="space-y-2">
            <h3 className="text-[13px] font-medium tracking-wide text-gray-400">
              Segments
            </h3>
            <ul className="border-t border-black/[0.06]">
              {segments.map((seg) => (
                <li
                  key={seg.id}
                  className="flex items-baseline justify-between gap-3 border-b border-black/[0.06] py-3"
                >
                  <span className="min-w-0 truncate text-[15px] text-gray-950">
                    {seg.name || "Untitled segment"}
                  </span>
                  <span className="shrink-0 text-[13px] text-gray-400">
                    {seg.isActive === false ? "Inactive" : "Active"}
                  </span>
                </li>
              ))}
              {!loading && segments.length === 0 ? (
                <li className="py-6 text-[14px] text-gray-400">No segments</li>
              ) : null}
            </ul>
          </section>
        </div>
      ) : null}

      {configured === null && loading ? (
        <div className="flex items-center gap-2 text-[14px] text-gray-400">
          <Loader2 className="size-4 animate-spin" />
          Checking Klaviyo…
        </div>
      ) : null}
    </div>
  );
}
