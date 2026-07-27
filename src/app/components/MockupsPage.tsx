import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  Download,
  ImagePlus,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { cn } from "./ui/utils";
import {
  generateClothingMockup,
  type MockupAspectRatio,
  type MockupGenerateResult,
} from "../lib/mockups-api";
import {
  clearMockupHistory,
  loadMockupHistory,
  prependMockupHistory,
  type MockupHistoryItem,
} from "../lib/mockups-history-storage";
import {
  BLANK_TEMPLATE,
  compileMockupPrompt,
  createTemplateId,
  defaultSlot,
  loadActiveTemplateId,
  loadMockupTemplates,
  REFS_PLACEHOLDER,
  saveActiveTemplateId,
  saveCustomMockupTemplates,
  type MockupPromptTemplate,
  type MockupReferenceSlotDef,
  type MockupResolution,
} from "../lib/mockups-templates";

type PreviewFile = {
  id: string;
  file: File;
  url: string;
};

type SlotState = MockupReferenceSlotDef & {
  id: string;
  file: PreviewFile | null;
};

const ASPECT_OPTIONS: MockupAspectRatio[] = [
  "auto",
  "3:4",
  "2:3",
  "1:1",
  "4:3",
  "16:9",
  "9:16",
];

const MAX_SLOTS = 14;

function revokePreview(file: PreviewFile | null) {
  if (file) URL.revokeObjectURL(file.url);
}

function revokeAllSlots(slots: SlotState[]) {
  for (const slot of slots) revokePreview(slot.file);
}

function toPreviewFile(file: File): PreviewFile {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
    file,
    url: URL.createObjectURL(file),
  };
}

function slotsFromTemplate(template: MockupPromptTemplate): SlotState[] {
  return template.slots.map((slot, index) => ({
    id: `slot-${index}-${Math.random().toString(36).slice(2, 7)}`,
    label: slot.label,
    description: slot.description,
    file: null,
  }));
}

const RESOLUTION_OPTIONS: MockupResolution[] = ["1K", "2K", "4K"];

function templateFromState(
  name: string,
  promptBody: string,
  slots: SlotState[],
  aspectRatio: MockupAspectRatio,
  numImages: 1 | 2,
  resolution: MockupResolution,
): MockupPromptTemplate {
  return {
    id: createTemplateId(),
    name,
    promptBody,
    aspectRatio,
    numImages,
    resolution,
    slots: slots.map(({ label, description }) => ({ label, description })),
  };
}

export function MockupsPage() {
  const [templates, setTemplates] = useState<MockupPromptTemplate[]>(() =>
    loadMockupTemplates(),
  );
  const [templateId, setTemplateId] = useState(() => loadActiveTemplateId());
  const [promptBody, setPromptBody] = useState(() => {
    const active =
      loadMockupTemplates().find((t) => t.id === loadActiveTemplateId()) ??
      BLANK_TEMPLATE;
    return active.promptBody;
  });
  const [slots, setSlots] = useState<SlotState[]>(() => {
    const active =
      loadMockupTemplates().find((t) => t.id === loadActiveTemplateId()) ??
      BLANK_TEMPLATE;
    return slotsFromTemplate(active);
  });
  const [aspectRatio, setAspectRatio] = useState<MockupAspectRatio>(() => {
    const active =
      loadMockupTemplates().find((t) => t.id === loadActiveTemplateId()) ??
      BLANK_TEMPLATE;
    return active.aspectRatio ?? "auto";
  });
  const [numImages, setNumImages] = useState<1 | 2>(() => {
    const active =
      loadMockupTemplates().find((t) => t.id === loadActiveTemplateId()) ??
      BLANK_TEMPLATE;
    return active.numImages ?? 1;
  });
  const [resolution, setResolution] = useState<MockupResolution>(() => {
    const active =
      loadMockupTemplates().find((t) => t.id === loadActiveTemplateId()) ??
      BLANK_TEMPLATE;
    return active.resolution ?? "1K";
  });
  const [showCompiledPrompt, setShowCompiledPrompt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MockupGenerateResult | null>(null);
  const [history, setHistory] = useState<MockupHistoryItem[]>(() => loadMockupHistory());
  const [saveName, setSaveName] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);

  const slotFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === templateId),
    [templates, templateId],
  );

  const compiledPrompt = useMemo(
    () =>
      compileMockupPrompt(
        promptBody,
        slots.map(({ label, description }) => ({ label, description })),
      ),
    [promptBody, slots],
  );

  const uploadedCount = slots.filter((s) => s.file).length;
  const canRun =
    compiledPrompt.trim().length > 0 &&
    uploadedCount >= 1 &&
    uploadedCount === slots.length &&
    !loading;

  const applyTemplate = useCallback((template: MockupPromptTemplate) => {
    setTemplateId(template.id);
    saveActiveTemplateId(template.id);
    setPromptBody(template.promptBody);
    setSlots(slotsFromTemplate(template));
    setAspectRatio(template.aspectRatio ?? "auto");
    setNumImages(template.numImages ?? 1);
    setResolution(template.resolution ?? "1K");
    setResult(null);
  }, []);

  useEffect(() => {
    return () => revokeAllSlots(slots);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup on unmount only
  }, []);

  const setSlotCount = (count: number) => {
    const next = Math.max(1, Math.min(MAX_SLOTS, count));
    setSlots((prev) => {
      if (next === prev.length) return prev;
      if (next < prev.length) {
        for (let i = next; i < prev.length; i += 1) revokePreview(prev[i].file);
        return prev.slice(0, next);
      }
      const extra: SlotState[] = [];
      for (let i = prev.length; i < next; i += 1) {
        extra.push({
          id: `slot-${i}-${Math.random().toString(36).slice(2, 7)}`,
          ...defaultSlot(i),
          file: null,
        });
      }
      return [...prev, ...extra];
    });
  };

  const setSlotFile = (slotId: string, file: File | null) => {
    setSlots((prev) =>
      prev.map((slot) => {
        if (slot.id !== slotId) return slot;
        revokePreview(slot.file);
        return { ...slot, file: file ? toPreviewFile(file) : null };
      }),
    );
  };

  const insertRefTag = (index: number) => {
    const tag = `#${index + 1}`;
    setPromptBody((prev) => (prev.includes(tag) ? prev : `${prev.trim()}\n${tag}`));
  };

  const resetForm = () => {
    if (activeTemplate) applyTemplate(activeTemplate);
    else applyTemplate(BLANK_TEMPLATE);
    setShowSaveForm(false);
    setSaveName("");
  };

  const saveCurrentAsTemplate = () => {
    const name = saveName.trim();
    if (!name) {
      toast.error("Enter a template name");
      return;
    }
    const next = templateFromState(name, promptBody, slots, aspectRatio, numImages, resolution);
    const custom = [...templates.filter((t) => !t.builtIn), next];
    saveCustomMockupTemplates(custom);
    setTemplates(loadMockupTemplates());
    setTemplateId(next.id);
    saveActiveTemplateId(next.id);
    setShowSaveForm(false);
    setSaveName("");
    toast.success(`Saved template "${name}"`);
  };

  const deleteCurrentTemplate = () => {
    if (!activeTemplate || activeTemplate.builtIn) return;
    const custom = templates.filter((t) => !t.builtIn && t.id !== templateId);
    saveCustomMockupTemplates(custom);
    const refreshed = loadMockupTemplates();
    setTemplates(refreshed);
    applyTemplate(refreshed[0] ?? BLANK_TEMPLATE);
    toast.message("Template deleted");
  };

  const onRun = async () => {
    if (!canRun) return;
    setLoading(true);
    setResult(null);
    try {
      const files = slots.map((s) => s.file!.file);
      const data = await generateClothingMockup({
        prompt: compiledPrompt,
        images: files,
        aspectRatio,
        numImages,
        resolution,
      });
      setResult(data);
      setHistory(
        prependMockupHistory({
          prompt: data.prompt,
          seed: data.seed,
          aspectRatio: data.aspectRatio ?? aspectRatio,
          notes: activeTemplate?.name ?? "Custom",
          images: data.images.map((img) => ({ url: img.url })),
        }),
      );
      toast.success(data.images.length > 1 ? `${data.images.length} images ready` : "Image ready");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight text-gray-950">Mockups</h2>
        <p className="mt-1 text-sm text-gray-600">
          Pick a prompt template, define what each reference image is, upload in order, then run.
          Use <span className="font-medium text-gray-800">#1</span>,{" "}
          <span className="font-medium text-gray-800">#2</span>… in your prompt to reference slots.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Input</h3>
            <span className="text-xs text-gray-400">Nano Banana Pro Edit</span>
          </div>

          <div className="flex flex-1 flex-col gap-4 p-5">
            <div>
              <p className="mb-1.5 text-sm font-medium text-gray-900">Template</p>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={templateId}
                  onValueChange={(id) => {
                    const next = templates.find((t) => t.id === id);
                    if (next) applyTemplate(next);
                  }}
                >
                  <SelectTrigger className="min-w-[12rem] flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                        {t.builtIn ? " (built-in)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="tertiary"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowSaveForm((v) => !v)}
                >
                  <Save className="h-3.5 w-3.5" />
                  Save as template
                </Button>
                {activeTemplate && !activeTemplate.builtIn ? (
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    className="gap-1.5 text-red-600 hover:text-red-700"
                    onClick={deleteCurrentTemplate}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                ) : null}
              </div>
              {showSaveForm ? (
                <div className="mt-2 flex gap-2">
                  <Input
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="Template name"
                    className="flex-1"
                  />
                  <Button type="button" size="sm" onClick={saveCurrentAsTemplate}>
                    Save
                  </Button>
                </div>
              ) : null}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-900">
                  Reference images<span className="text-red-500"> *</span>
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={slots.length <= 1}
                    onClick={() => setSlotCount(slots.length - 1)}
                    aria-label="Remove reference slot"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="min-w-[4rem] text-center text-xs text-gray-500">
                    {slots.length} slot{slots.length === 1 ? "" : "s"}
                  </span>
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={slots.length >= MAX_SLOTS}
                    onClick={() => setSlotCount(slots.length + 1)}
                    aria-label="Add reference slot"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <ul className="space-y-3">
                {slots.map((slot, index) => (
                  <ReferenceSlotRow
                    key={slot.id}
                    index={index}
                    slot={slot}
                    inputRef={(el) => {
                      slotFileRefs.current[slot.id] = el;
                    }}
                    onLabelChange={(label) =>
                      setSlots((prev) =>
                        prev.map((s) => (s.id === slot.id ? { ...s, label } : s)),
                      )
                    }
                    onDescriptionChange={(description) =>
                      setSlots((prev) =>
                        prev.map((s) => (s.id === slot.id ? { ...s, description } : s)),
                      )
                    }
                    onPickFile={() => slotFileRefs.current[slot.id]?.click()}
                    onFile={(file) => setSlotFile(slot.id, file)}
                    onClear={() => setSlotFile(slot.id, null)}
                    onInsertRef={() => insertRefTag(index)}
                  />
                ))}
              </ul>
              <p className="mt-2 text-xs text-gray-400">
                {uploadedCount}/{slots.length} uploaded — all slots need an image before Run.
              </p>
            </div>

            <div>
              <label
                htmlFor="mockup-prompt-body"
                className="mb-1.5 block text-sm font-medium text-gray-900"
              >
                Prompt template<span className="text-red-500"> *</span>
              </label>
              <Textarea
                id="mockup-prompt-body"
                rows={8}
                value={promptBody}
                onChange={(e) => setPromptBody(e.target.value)}
                className="min-h-[160px] resize-y font-mono text-[13px]"
              />
              <p className="mt-1.5 text-xs text-gray-400">
                Use <code className="rounded bg-gray-100 px-1">{REFS_PLACEHOLDER}</code> to auto-insert
                the reference list from your slots above. Type #1, #2… to point at each upload.
              </p>
              <button
                type="button"
                className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
                onClick={() => setShowCompiledPrompt((v) => !v)}
              >
                {showCompiledPrompt ? "Hide" : "Show"} compiled prompt sent to model
              </button>
              {showCompiledPrompt ? (
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-wrap">
                  {compiledPrompt}
                </pre>
              ) : null}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="mb-1.5 text-sm font-medium text-gray-900">Aspect ratio</p>
                <Select
                  value={aspectRatio}
                  onValueChange={(v) => setAspectRatio(v as MockupAspectRatio)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASPECT_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-gray-900">Resolution</p>
                <Select
                  value={resolution}
                  onValueChange={(v) => setResolution(v as MockupResolution)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESOLUTION_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-gray-900">Variants</p>
                <Select
                  value={String(numImages)}
                  onValueChange={(v) => setNumImages(v === "2" ? 2 : 1)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 image</SelectItem>
                    <SelectItem value="2">2 images</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-5 py-3">
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              className="gap-1.5"
              onClick={resetForm}
              disabled={loading}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            <Button
              type="button"
              className="min-w-[7rem] gap-2"
              disabled={!canRun}
              onClick={() => void onRun()}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running…
                </>
              ) : (
                "Run"
              )}
            </Button>
          </div>
        </section>

        <section className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Result</h3>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                loading
                  ? "bg-blue-50 text-blue-700"
                  : result
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-gray-100 text-gray-500",
              )}
            >
              {loading ? "Running" : result ? "Done" : "Idle"}
            </span>
          </div>

          <div className="flex flex-1 flex-col p-5">
            {loading ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                Generating…
              </div>
            ) : result?.images?.length ? (
              <div className="space-y-3">
                <div
                  className={cn(
                    "grid gap-3",
                    result.images.length > 1 ? "grid-cols-2" : "grid-cols-1",
                  )}
                >
                  {result.images.map((img, i) => (
                    <div
                      key={`${img.url}-${i}`}
                      className="overflow-hidden rounded-xl bg-gray-100"
                    >
                      <img
                        src={img.url}
                        alt={`Result ${i + 1}`}
                        className="w-full object-cover"
                      />
                      <div className="flex justify-end border-t border-gray-100 p-2">
                        <a
                          href={img.url}
                          download={`fgg-mockup-${i + 1}.jpg`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
                {result.model ? (
                  <p className="text-xs text-gray-400">{result.model}</p>
                ) : null}
              </div>
            ) : (
              <p className="flex min-h-[280px] items-center justify-center text-center text-sm text-gray-500">
                Results appear here after you run.
              </p>
            )}
          </div>

          {history.length ? (
            <div className="border-t border-gray-100 px-5 py-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Recent
                </p>
                <Button
                  type="button"
                  variant="tertiary"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => {
                    clearMockupHistory();
                    setHistory([]);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </Button>
              </div>
              <ul className="flex gap-2 overflow-x-auto pb-1">
                {history.slice(0, 8).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="h-14 w-14 overflow-hidden rounded-lg bg-gray-100"
                      onClick={() =>
                        setResult({
                          images: item.images,
                          prompt: item.prompt,
                          seed: item.seed,
                          aspectRatio: item.aspectRatio,
                        })
                      }
                    >
                      {item.images[0]?.url ? (
                        <img
                          src={item.images[0].url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

type ReferenceSlotRowProps = {
  index: number;
  slot: SlotState;
  inputRef: (el: HTMLInputElement | null) => void;
  onLabelChange: (label: string) => void;
  onDescriptionChange: (description: string) => void;
  onPickFile: () => void;
  onFile: (file: File | null) => void;
  onClear: () => void;
  onInsertRef: () => void;
};

function ReferenceSlotRow({
  index,
  slot,
  inputRef,
  onLabelChange,
  onDescriptionChange,
  onPickFile,
  onFile,
  onClear,
  onInsertRef,
}: ReferenceSlotRowProps) {
  const inputId = useId();

  const takeFile = (list: FileList | null) => {
    const file = list?.[0];
    if (!file?.type.startsWith("image/")) {
      toast.error("Only image files are supported");
      return;
    }
    onFile(file);
  };

  return (
    <li className="rounded-xl border border-gray-200 bg-gray-50/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="rounded bg-gray-900 px-2 py-0.5 text-[11px] font-semibold text-white">
          #{index + 1}
        </span>
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          className="h-7 text-xs"
          onClick={onInsertRef}
        >
          Insert #{index + 1} in prompt
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Label</label>
          <Input
            value={slot.label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="e.g. Inspiration"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">What this image is</label>
          <Input
            value={slot.description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="e.g. Model pose and lighting to keep"
          />
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          className="gap-1.5"
          onClick={onPickFile}
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {slot.file ? "Replace" : "Upload"}
        </Button>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            takeFile(e.target.files);
            e.target.value = "";
          }}
        />
        {slot.file ? (
          <>
            <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-gray-200">
              <img
                src={slot.file.url}
                alt={`Reference ${index + 1}`}
                className="h-full w-full object-cover"
              />
            </div>
            <button
              type="button"
              className="rounded-full p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-800"
              aria-label={`Remove image ${index + 1}`}
              onClick={onClear}
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <span
            className="text-xs text-gray-400"
            onDragOver={(e: DragEvent) => e.preventDefault()}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              takeFile(e.dataTransfer.files);
            }}
          >
            or drop image here
          </span>
        )}
      </div>
    </li>
  );
}
