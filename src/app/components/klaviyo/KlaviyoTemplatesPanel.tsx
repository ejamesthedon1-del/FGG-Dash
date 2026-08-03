"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createKlaviyoTemplate,
  deleteKlaviyoTemplate,
  fetchKlaviyoTemplate,
  updateKlaviyoTemplate,
  type KlaviyoTemplate,
} from "../../lib/klaviyo-api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

const STARTER_HTML = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Email</title>
  </head>
  <body style="margin:0;padding:24px;background:#f4f4f4;font-family:Helvetica,Arial,sans-serif;color:#111;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;">
      <tr>
        <td style="padding:28px 24px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
            Hey {{ first_name|default:'there' }},
          </p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
            Write your message here.
          </p>
          <p style="margin:24px 0 0;">
            <a href="https://example.com" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;font-size:14px;">
              Shop now
            </a>
          </p>
          <p style="margin:28px 0 0;font-size:12px;line-height:1.4;color:#888;">
            {% unsubscribe %}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

type Props = {
  templates: KlaviyoTemplate[];
  onChange: (next: KlaviyoTemplate[]) => void;
};

export function KlaviyoTemplatesPanel({ templates, onChange }: Props) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [html, setHtml] = React.useState(STARTER_HTML);
  const [busy, setBusy] = React.useState(false);
  const [loadingEdit, setLoadingEdit] = React.useState(false);

  const resetNew = () => {
    setEditingId(null);
    setName("");
    setHtml(STARTER_HTML);
  };

  const openEdit = async (template: KlaviyoTemplate) => {
    setEditingId(template.id);
    setName(template.name || "");
    setLoadingEdit(true);
    try {
      const { template: full } = await fetchKlaviyoTemplate(template.id);
      setHtml(full.html || STARTER_HTML);
      setName(full.name || template.name || "");
    } catch (err) {
      setHtml(template.html || STARTER_HTML);
      toast.error(err instanceof Error ? err.message : "Could not load template");
    } finally {
      setLoadingEdit(false);
    }
  };

  const onSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Template name required");
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        const { template } = await updateKlaviyoTemplate(editingId, {
          name: trimmed,
          html,
        });
        onChange(
          templates.map((t) => (t.id === editingId ? { ...t, ...template } : t)),
        );
        toast.success("Template saved");
      } else {
        const { template } = await createKlaviyoTemplate({
          name: trimmed,
          html,
        });
        onChange([template, ...templates]);
        setEditingId(template.id);
        toast.success("Template created in Klaviyo");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!editingId) return;
    if (!window.confirm("Delete this template from Klaviyo?")) return;
    setBusy(true);
    try {
      await deleteKlaviyoTemplate(editingId);
      onChange(templates.filter((t) => t.id !== editingId));
      resetNew();
      toast.success("Template deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-medium tracking-wide text-gray-400">
            Templates
          </h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            onClick={resetNew}
          >
            <Plus className="size-3" />
            New
          </Button>
        </div>
        <ul className="border-t border-black/[0.06]">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={`flex w-full items-baseline justify-between gap-2 border-b border-black/[0.06] py-3 text-left ${
                  editingId === t.id ? "text-gray-950" : "text-gray-600"
                }`}
                onClick={() => void openEdit(t)}
              >
                <span className="min-w-0 truncate text-[14px]">
                  {t.name || "Untitled"}
                </span>
              </button>
            </li>
          ))}
          {!templates.length ? (
            <li className="py-6 text-[14px] text-gray-400">
              No templates yet — create one
            </li>
          ) : null}
        </ul>
      </section>

      <section className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="tpl-name">Name</Label>
          <Input
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Spring drop announcement"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="tpl-html">HTML</Label>
            <span className="text-[12px] text-gray-400">
              Use {"{{ first_name }}"} · unsubscribe is auto-added if missing
            </span>
          </div>
          {loadingEdit ? (
            <div className="flex items-center gap-2 py-8 text-[14px] text-gray-400">
              <Loader2 className="size-4 animate-spin" />
              Loading template…
            </div>
          ) : (
            <Textarea
              id="tpl-html"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              className="min-h-[280px] font-mono text-[12px] leading-5"
              spellCheck={false}
            />
          )}
        </div>
        <div className="space-y-2">
          <p className="text-[13px] font-medium tracking-wide text-gray-400">
            Preview
          </p>
          <iframe
            title="Template preview"
            className="h-[320px] w-full border border-black/[0.08] bg-white"
            sandbox=""
            srcDoc={html}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void onSave()} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {editingId ? "Save template" : "Create template"}
          </Button>
          {editingId ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void onDelete()}
            >
              Delete
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
