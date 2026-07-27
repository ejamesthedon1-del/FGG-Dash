import { useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  Download,
  ImagePlus,
  Loader2,
  Shirt,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
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

type PreviewFile = {
  id: string;
  file: File;
  url: string;
};

const ASPECT_OPTIONS: MockupAspectRatio[] = [
  "3:4",
  "2:3",
  "1:1",
  "4:3",
  "16:9",
  "9:16",
];

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

function DropZone({
  label,
  hint,
  files,
  multiple,
  max,
  onAdd,
  onRemove,
  required,
}: {
  label: string;
  hint: string;
  files: PreviewFile[];
  multiple?: boolean;
  max: number;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  required?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const takeFiles = (incoming: FileList | null) => {
    if (!incoming?.length) return;
    const images = Array.from(incoming).filter((f) => f.type.startsWith("image/"));
    if (!images.length) {
      toast.error("Only image files are supported");
      return;
    }
    onAdd(images);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </p>
        <p className="text-xs text-gray-400">
          {files.length}/{max}
        </p>
      </div>
      <label
        htmlFor={inputId}
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
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center transition-colors",
          dragOver
            ? "border-blue-500 bg-blue-50/60"
            : "border-gray-200 bg-gray-50/80 hover:border-gray-300 hover:bg-gray-50",
        )}
      >
        <ImagePlus className="mb-2 h-5 w-5 text-gray-400" />
        <span className="text-sm text-gray-700">{hint}</span>
        <span className="mt-1 text-xs text-gray-400">PNG, JPG, WEBP · max 12MB each</span>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={multiple}
          className="sr-only"
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            takeFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {files.length ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((f) => (
            <li key={f.id} className="group relative overflow-hidden rounded-lg bg-gray-100">
              <img
                src={f.url}
                alt={f.file.name}
                className="aspect-square w-full object-cover"
              />
              <button
                type="button"
                className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => onRemove(f.id)}
                aria-label={`Remove ${f.file.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function MockupsPage() {
  const [inspiration, setInspiration] = useState<PreviewFile[]>([]);
  const [fabrics, setFabrics] = useState<PreviewFile[]>([]);
  const [products, setProducts] = useState<PreviewFile[]>([]);
  const [notes, setNotes] = useState("");
  const [aspectRatio, setAspectRatio] = useState<MockupAspectRatio>("3:4");
  const [numImages, setNumImages] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MockupGenerateResult | null>(null);
  const [history, setHistory] = useState<MockupHistoryItem[]>(() => loadMockupHistory());

  const addCapped = (
    current: PreviewFile[],
    incoming: File[],
    max: number,
    replace: boolean,
  ) => {
    const next = replace ? toPreviewFiles(incoming.slice(0, max)) : [
      ...current,
      ...toPreviewFiles(incoming),
    ].slice(0, max);
    if (!replace) {
      const overflow = current.length + incoming.length - max;
      if (overflow > 0) toast.message(`Kept the first ${max} images`);
      // revoke dropped extras that won't be used
      const keptIds = new Set(next.map((n) => n.id));
      for (const old of current) {
        if (!keptIds.has(old.id)) URL.revokeObjectURL(old.url);
      }
    } else {
      revokeAll(current);
    }
    return next;
  };

  const canGenerate =
    inspiration.length === 1 && fabrics.length >= 1 && !loading;

  const onGenerate = async () => {
    if (!canGenerate || !inspiration[0]) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await generateClothingMockup({
        inspiration: inspiration[0].file,
        fabrics: fabrics.map((f) => f.file),
        products: products.map((f) => f.file),
        notes,
        aspectRatio,
        numImages,
      });
      setResult(data);
      setHistory(
        prependMockupHistory({
          prompt: data.prompt,
          seed: data.seed,
          aspectRatio: data.aspectRatio ?? aspectRatio,
          notes: notes.trim() || undefined,
          images: data.images.map((img) => ({ url: img.url })),
        }),
      );
      toast.success(
        data.images.length > 1
          ? `Generated ${data.images.length} mockups`
          : "Mockup ready",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-950">
          Mockups
        </h2>
        <p className="text-sm text-gray-600">
          Recreate an inspiration shot with your fabric and product references —
          photoreal camera look via FLUX Kontext.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <DropZone
            label="Inspiration"
            hint="Drop the Pinterest / scene photo to recreate"
            files={inspiration}
            max={1}
            required
            onAdd={(files) =>
              setInspiration((prev) => addCapped(prev, files, 1, true))
            }
            onRemove={(id) =>
              setInspiration((prev) => {
                const gone = prev.find((p) => p.id === id);
                if (gone) URL.revokeObjectURL(gone.url);
                return prev.filter((p) => p.id !== id);
              })
            }
          />
          <DropZone
            label="Fabric close-ups"
            hint="Drop fabric texture / material refs"
            files={fabrics}
            multiple
            max={4}
            required
            onAdd={(files) =>
              setFabrics((prev) => addCapped(prev, files, 4, false))
            }
            onRemove={(id) =>
              setFabrics((prev) => {
                const gone = prev.find((p) => p.id === id);
                if (gone) URL.revokeObjectURL(gone.url);
                return prev.filter((p) => p.id !== id);
              })
            }
          />
          <DropZone
            label="Product / construction"
            hint="Optional garment shots for fit, seams, hardware"
            files={products}
            multiple
            max={4}
            onAdd={(files) =>
              setProducts((prev) => addCapped(prev, files, 4, false))
            }
            onRemove={(id) =>
              setProducts((prev) => {
                const gone = prev.find((p) => p.id === id);
                if (gone) URL.revokeObjectURL(gone.url);
                return prev.filter((p) => p.id !== id);
              })
            }
          />

          <div>
            <label
              htmlFor="mockup-notes"
              className="mb-1.5 block text-sm font-medium text-gray-900"
            >
              Notes
            </label>
            <Textarea
              id="mockup-notes"
              rows={3}
              placeholder="Fit, wash, stitching, camera vibe…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="min-w-[8rem] flex-1">
              <p className="mb-1.5 text-sm font-medium text-gray-900">Aspect</p>
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
            <div className="min-w-[8rem] flex-1">
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

          <Button
            type="button"
            className="w-full gap-2"
            disabled={!canGenerate}
            onClick={() => void onGenerate()}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating… this can take up to a minute
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate mockup
              </>
            )}
          </Button>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <Shirt className="h-4 w-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-900">Result</h3>
            </div>
            {loading ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                Uploading refs and running Kontext…
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
                        alt={`Mockup ${i + 1}`}
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
                {result.seed != null ? (
                  <p className="text-xs text-gray-400">Seed {result.seed}</p>
                ) : null}
              </div>
            ) : (
              <p className="min-h-[220px] text-sm leading-relaxed text-gray-500">
                Results appear here. Use a clear inspiration photo, tight fabric
                close-ups, and optional product shots for construction.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Recent</h3>
              {history.length ? (
                <Button
                  type="button"
                  variant="tertiary"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    clearMockupHistory();
                    setHistory([]);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </Button>
              ) : null}
            </div>
            {history.length ? (
              <ul className="space-y-3">
                {history.slice(0, 8).map((item) => (
                  <li key={item.id} className="flex gap-3">
                    <button
                      type="button"
                      className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100"
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
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-gray-500">
                        {new Date(item.createdAt).toLocaleString()}
                        {item.aspectRatio ? ` · ${item.aspectRatio}` : ""}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-gray-800">
                        {item.notes || "Photoreal mockup"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No generations yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
