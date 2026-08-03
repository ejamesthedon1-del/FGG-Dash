"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  createKlaviyoSimpleFlow,
  type KlaviyoList,
  type KlaviyoTemplate,
} from "../../lib/klaviyo-api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

type Props = {
  templates: KlaviyoTemplate[];
  lists: KlaviyoList[];
  defaultFromEmail?: string | null;
  defaultFromLabel?: string | null;
  onCreated: () => void;
};

const PRESETS = [
  {
    id: "welcome" as const,
    label: "Welcome",
    hint: "When someone joins a list",
    defaultDelay: 0,
  },
  {
    id: "abandoned_cart" as const,
    label: "Abandoned cart",
    hint: "Started Checkout / cart metric",
    defaultDelay: 4,
  },
  {
    id: "post_purchase" as const,
    label: "Post-purchase",
    hint: "Placed Order metric",
    defaultDelay: 24,
  },
];

export function KlaviyoSimpleFlowForm({
  templates,
  lists,
  defaultFromEmail,
  defaultFromLabel,
  onCreated,
}: Props) {
  const [preset, setPreset] =
    React.useState<(typeof PRESETS)[number]["id"]>("welcome");
  const [name, setName] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");
  const [listId, setListId] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [delayHours, setDelayHours] = React.useState(0);
  const [fromEmail, setFromEmail] = React.useState(defaultFromEmail || "");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (defaultFromEmail && !fromEmail) setFromEmail(defaultFromEmail);
  }, [defaultFromEmail, fromEmail]);

  React.useEffect(() => {
    if (!templateId && templates[0]?.id) setTemplateId(templates[0].id);
  }, [templates, templateId]);

  React.useEffect(() => {
    if (!listId && lists[0]?.id) setListId(lists[0].id);
  }, [lists, listId]);

  React.useEffect(() => {
    const p = PRESETS.find((x) => x.id === preset);
    if (p) setDelayHours(p.defaultDelay);
  }, [preset]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateId || !subject.trim()) {
      toast.error("Template and subject are required");
      return;
    }
    if (preset === "welcome" && !listId) {
      toast.error("Pick a list for the welcome flow");
      return;
    }
    setBusy(true);
    try {
      const res = await createKlaviyoSimpleFlow({
        preset,
        name: name.trim() || undefined,
        templateId,
        subject: subject.trim(),
        listId: preset === "welcome" ? listId : undefined,
        delayHours,
        fromEmail: fromEmail.trim() || undefined,
        fromLabel:
          typeof defaultFromLabel === "string" && defaultFromLabel
            ? defaultFromLabel
            : undefined,
      });
      toast.success(
        `${res.flow.name || "Flow"} created as draft — turn Live when ready`,
      );
      setName("");
      setSubject("");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create flow");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="space-y-4 border-b border-black/[0.06] pb-6"
    >
      <div>
        <h3 className="text-[13px] font-medium tracking-wide text-gray-400">
          Create a simple flow
        </h3>
        <p className="mt-1 text-[13px] text-gray-500">
          One trigger, optional wait, one email from your template. Created as
          draft so you can review before going live.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant={preset === p.id ? "default" : "outline"}
            className="h-8"
            onClick={() => setPreset(p.id)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <p className="text-[12px] text-gray-400">
        {PRESETS.find((p) => p.id === preset)?.hint}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="flow-name">Name (optional)</Label>
          <Input
            id="flow-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              preset === "welcome"
                ? "Welcome series"
                : preset === "abandoned_cart"
                  ? "Abandoned cart"
                  : "Post-purchase"
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="flow-template">Template</Label>
          <select
            id="flow-template"
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
        {preset === "welcome" ? (
          <div className="space-y-2">
            <Label htmlFor="flow-list">List</Label>
            <select
              id="flow-list"
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
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="flow-subject">Subject</Label>
          <Input
            id="flow-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Welcome in"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="flow-delay">Wait (hours)</Label>
          <Input
            id="flow-delay"
            type="number"
            min={0}
            max={720}
            value={delayHours}
            onChange={(e) => setDelayHours(Number(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="flow-from">From email</Label>
          <Input
            id="flow-from"
            type="email"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            placeholder="hello@yourbrand.com"
          />
        </div>
      </div>

      <Button type="submit" disabled={busy || !templates.length}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
        Create draft flow
      </Button>
    </form>
  );
}
