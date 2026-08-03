import { useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { BookOpen, Download, ImagePlus, Loader2, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { cn } from "./ui/utils";
import { MockupsAdCopySection } from "./MockupsAdCopySection";
import { InstagramScheduleSection } from "./InstagramScheduleSection";
import { MockupsSectionNav } from "./MockupsSectionNav";
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
  addMockupPromptTemplate,
  deleteMockupPromptTemplate,
  loadMockupPromptTemplates,
  type MockupPromptTemplate,
} from "../lib/mockups-prompt-templates-storage";

type PreviewFile = {
  id: string;
  file: File;
  url: string;
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

const MAX_IMAGES = 14;

function revokeAll(files: PreviewFile[]) {
  for (const f of files) URL.revokeObjectURL(f.url);
}

function toPreviewFiles(list: FileList | File[]): PreviewFile[] {
  return Array.from(list).map((file) => ({
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
    file,
    url: URL.createObjectURL(file),
  }));
}

export function MockupsPage() {
  const [searchParams] = useSearchParams();
  const sectionParam = searchParams.get("section");
  const section =
    sectionParam === "ad-copy"
      ? "ad-copy"
      : sectionParam === "schedule"
        ? "schedule"
        : "generate";
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<PreviewFile[]>([]);
  const [aspectRatio, setAspectRatio] = useState<MockupAspectRatio>("auto");
  const [numImages, setNumImages] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<MockupGenerateResult | null>(null);
  const [history, setHistory] = useState<MockupHistoryItem[]>(() => loadMockupHistory());
  const [templates, setTemplates] = useState<MockupPromptTemplate[]>(() =>
    loadMockupPromptTemplates(),
  );
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const addImages = (incoming: File[]) => {
    const onlyImages = incoming.filter((f) => f.type.startsWith("image/"));
    if (!onlyImages.length) {
      toast.error("Only image files are supported");
      return;
    }
    setImages((prev) => {
      const next = [...prev, ...toPreviewFiles(onlyImages)].slice(0, MAX_IMAGES);
      if (prev.length + onlyImages.length > MAX_IMAGES) {
        toast.message(`Kept first ${MAX_IMAGES} images`);
      }
      return next;
    });
  };

  const takeFiles = (list: FileList | null) => {
    if (!list?.length) return;
    addImages(Array.from(list));
  };

  const resetForm = () => {
    revokeAll(images);
    setImages([]);
    setPrompt("");
    setAspectRatio("auto");
    setNumImages(1);
    setResult(null);
  };

  const canRun = prompt.trim().length > 0 && images.length >= 1 && !loading;

  const saveTemplate = () => {
    const trimmedPrompt = prompt.trim();
    const trimmedName = templateName.trim();
    if (!trimmedPrompt) {
      toast.error("Add a prompt before saving");
      return;
    }
    if (!trimmedName) {
      toast.error("Enter a template name");
      return;
    }
    setTemplates(addMockupPromptTemplate(trimmedName, trimmedPrompt));
    setTemplateName("");
    setSaveOpen(false);
    toast.success(`Saved "${trimmedName}"`);
  };

  const loadTemplate = (template: MockupPromptTemplate) => {
    setPrompt(template.prompt);
    setLibraryOpen(false);
    toast.message(`Loaded "${template.name}"`);
  };

  const removeTemplate = (id: string) => {
    setTemplates(deleteMockupPromptTemplate(id));
    toast.message("Template deleted");
  };

  const onRun = async () => {
    if (!canRun) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await generateClothingMockup({
        prompt: prompt.trim(),
        images: images.map((i) => i.file),
        aspectRatio,
        numImages,
      });
      setResult(data);
      setHistory(
        prependMockupHistory({
          prompt: data.prompt,
          seed: data.seed,
          aspectRatio: data.aspectRatio ?? aspectRatio,
          notes: prompt.trim().slice(0, 120),
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
    <div className={cn("w-full", section === "schedule" ? "space-y-1" : "space-y-4")}>
      <header className={cn(section === "schedule" ? "space-y-1" : "space-y-3")}>
        <h2 className="text-[26px] font-semibold leading-[1.2] tracking-[-0.22px] text-gray-900">Studio</h2>
        <MockupsSectionNav active={section} />
      </header>

      {section === "ad-copy" ? (
        <MockupsAdCopySection />
      ) : section === "schedule" ? (
        <InstagramScheduleSection />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-sm text-gray-600">
              Freeform image edit — write your prompt, add reference images in order, run.
              Type <span className="font-medium text-gray-800">#1</span>,{" "}
              <span className="font-medium text-gray-800">#2</span>… to reference inputs.
            </p>
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              className="gap-1.5 text-blue-600 hover:text-blue-700"
              onClick={() => setLibraryOpen(true)}
            >
              <BookOpen className="h-3.5 w-3.5" />
              Template library
              {templates.length ? (
                <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                  {templates.length}
                </span>
              ) : null}
            </Button>
          </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* Input */}
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Input</h3>
            <span className="text-xs text-gray-400">Nano Banana Pro Edit</span>
          </div>

          <div className="flex flex-col gap-4 p-5">
            <div>
              <label
                htmlFor="mockup-prompt"
                className="mb-1.5 block text-sm font-medium text-gray-900"
              >
                Prompt<span className="text-red-500"> *</span>
              </label>
              <Textarea
                id="mockup-prompt"
                rows={6}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='e.g. Swap the hoodie on #1 with the exact product in #2. Keep the same model, pose, and lighting. Fabric in #3 is textile feel only.'
                className="min-h-[140px] resize-y"
              />
              <p className="mt-1.5 text-xs text-gray-400">
                Type # to reference inputs (image order = #1, #2, #3…).
              </p>
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                className="mt-2 gap-1.5"
                disabled={!prompt.trim()}
                onClick={() => setSaveOpen(true)}
              >
                <Save className="h-3.5 w-3.5" />
                Save as template
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
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

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900">
                  Images<span className="text-red-500"> *</span>
                </p>
                <p className="text-xs text-gray-400">
                  {images.length}/{MAX_IMAGES}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="tertiary"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  Add image
                </Button>
                <input
                  id={inputId}
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    takeFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
              <div
                onDragOver={(e: DragEvent) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e: DragEvent) => {
                  e.preventDefault();
                  setDragOver(false);
                  takeFiles(e.dataTransfer.files);
                }}
                className={cn(
                  "mt-3 max-h-[320px] min-h-[120px] overflow-y-auto rounded-xl border border-dashed p-3 transition-colors",
                  dragOver
                    ? "border-blue-500 bg-blue-50/50"
                    : "border-gray-200 bg-gray-50/60",
                )}
              >
                {images.length ? (
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {images.map((img, i) => (
                      <li
                        key={img.id}
                        className="group relative overflow-hidden rounded-lg bg-gray-100"
                      >
                        <img
                          src={img.url}
                          alt={`#${i + 1}`}
                          className="aspect-square w-full object-cover"
                        />
                        <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          #{i + 1}
                        </span>
                        <button
                          type="button"
                          className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label={`Remove image ${i + 1}`}
                          onClick={() =>
                            setImages((prev) => {
                              const gone = prev.find((p) => p.id === img.id);
                              if (gone) URL.revokeObjectURL(gone.url);
                              return prev.filter((p) => p.id !== img.id);
                            })
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="flex h-[96px] items-center justify-center text-center text-xs text-gray-400">
                    Drag and drop images, or use Add image.
                    <br />
                    Order matters — first image is #1.
                  </p>
                )}
              </div>
              {images.length ? (
                <p className="mt-1.5 text-xs text-gray-400">
                  {images.length} image{images.length === 1 ? "" : "s"} added
                </p>
              ) : null}
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

        {/* Result */}
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
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

          <div className="p-5">
            {loading ? (
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-sm text-gray-500">
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
                        className="max-h-[70vh] w-full object-contain"
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
              <p className="flex min-h-[200px] items-center justify-center text-center text-sm text-gray-500">
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
      )}

      {saveOpen ? (
        <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Save prompt template</DialogTitle>
              <DialogDescription>
                Save the current prompt to your library so you can reuse it later.
              </DialogDescription>
            </DialogHeader>
            <div>
              <label htmlFor="template-name" className="mb-1.5 block text-sm font-medium text-gray-900">
                Template name
              </label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. Flat lay hoodie swap"
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTemplate();
                }}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="tertiary" onClick={() => setSaveOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={saveTemplate}>
                Save template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {libraryOpen ? (
        <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
          <DialogContent className="flex max-h-[min(80vh,640px)] flex-col overflow-hidden sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Template library</DialogTitle>
              <DialogDescription>
                Load a saved prompt into the editor, or delete templates you no longer need.
              </DialogDescription>
            </DialogHeader>
            {templates.length ? (
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {templates.map((template) => (
                  <li
                    key={template.id}
                    className="rounded-xl border border-gray-200 bg-gray-50/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900">{template.name}</p>
                        <p className="mt-1 line-clamp-3 text-xs text-gray-500 whitespace-pre-wrap">
                          {template.prompt}
                        </p>
                        <p className="mt-2 text-[10px] text-gray-400">
                          Saved {new Date(template.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => loadTemplate(template)}
                        >
                          Load
                        </Button>
                        <Button
                          type="button"
                          variant="tertiary"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => removeTemplate(template.id)}
                          aria-label={`Delete ${template.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-gray-500">
                No saved templates yet. Write a prompt and use Save as template.
              </p>
            )}
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
