"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createKlaviyoTemplate,
  deleteKlaviyoTemplate,
  updateKlaviyoTemplate,
  type KlaviyoTemplate,
} from "../../lib/klaviyo-api";
import {
  compileLayoutToHtml,
  createDefaultLayout,
} from "../../lib/email-template-layout";
import { KlaviyoVisualTemplateEditor } from "./KlaviyoVisualTemplateEditor";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

const STARTER_HTML = compileLayoutToHtml(createDefaultLayout());

type Props = {
  templates: KlaviyoTemplate[];
  onChange: (next: KlaviyoTemplate[]) => void;
};

export function KlaviyoTemplatesPanel({ templates, onChange }: Props) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [html, setHtml] = React.useState(STARTER_HTML);
  const [busy, setBusy] = React.useState(false);
  const [showHtml, setShowHtml] = React.useState(false);
  const [useVisual, setUseVisual] = React.useState(true);
  const [editorKey, setEditorKey] = React.useState(0);

  const resetNew = () => {
    setEditingId(null);
    setName("");
    setHtml(STARTER_HTML);
    setShowHtml(false);
    setUseVisual(true);
    setEditorKey((k) => k + 1);
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

  const startVisualFromScratch = () => {
    setHtml(STARTER_HTML);
    setShowHtml(false);
    setUseVisual(true);
    setEditorKey((k) => k + 1);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="max-w-sm flex-1 space-y-2">
          <Label htmlFor="tpl-name">Name</Label>
          <Input
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Spring drop announcement"
          />
        </div>
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
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 gap-1"
          onClick={resetNew}
        >
          <Plus className="size-3.5" />
          New
        </Button>
      </div>

      {!useVisual ? (
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-3 text-[13px] text-amber-950">
          <p>
            This template was built outside the visual editor (raw HTML). You
            can keep editing HTML, or start a visual layout (replaces current
            HTML).
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={startVisualFromScratch}
          >
            Start visual layout
          </Button>
        </div>
      ) : (
        <KlaviyoVisualTemplateEditor
          key={editorKey}
          initialHtml={html}
          onHtmlChange={setHtml}
          disabled={busy}
        />
      )}

      <div className="flex items-center justify-between gap-2 border-t border-black/[0.06] pt-3">
        <button
          type="button"
          className="text-[12px] text-gray-500 hover:text-gray-800"
          onClick={() => setShowHtml((v) => !v)}
        >
          {showHtml ? "Hide advanced HTML" : "Advanced HTML"}
        </button>
        <span className="text-[12px] text-gray-400">
          {"{{ first_name }}"} · unsubscribe auto-added
        </span>
      </div>

      {showHtml ? (
        <Textarea
          id="tpl-html"
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          className="min-h-[200px] font-mono text-[12px] leading-5"
          spellCheck={false}
        />
      ) : null}
    </div>
  );
}
