import { useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Check, Copy, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { cn } from "./ui/utils";
import {
  addAdCopyCreative,
  copyText,
  createEmptyVariant,
  deleteAdCopyCreative,
  fileToAdImageDataUrl,
  loadAdCopyCreatives,
  updateAdCopyCreative,
  type AdCopyCreative,
  type AdCopyVariant,
} from "../lib/mockups-ad-copy-storage";

/** Facebook Ads Manager recommended lengths (soft guidance). */
const HEADLINE_SOFT = 40;
const PRIMARY_SOFT = 125;
const DESCRIPTION_SOFT = 30;

function charHint(length: number, softLimit: number): string {
  const over = length > softLimit;
  return `${length}/${softLimit}${over ? " · long for Feed" : ""}`;
}

async function copyField(label: string, value: string) {
  const ok = await copyText(value);
  if (!ok) {
    toast.error(`Nothing to copy — add a ${label.toLowerCase()} first`);
    return;
  }
  toast.success(`${label} copied`);
}

function CopyFieldButton({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="tertiary"
      size="sm"
      className="h-7 shrink-0 gap-1 text-xs"
      disabled={!value.trim()}
      onClick={() => {
        void (async () => {
          await copyField(label, value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        })();
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      Copy
    </Button>
  );
}

export function MockupsAdCopySection() {
  const fileInputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [ads, setAds] = useState<AdCopyCreative[]>(() => loadAdCopyCreatives());
  const [name, setName] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [variants, setVariants] = useState<AdCopyVariant[]>(() => [createEmptyVariant()]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const resetComposer = () => {
    setName("");
    setImageDataUrl(null);
    setImageName(null);
    setVariants([createEmptyVariant()]);
  };

  const takeImage = async (file: File | null | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const result = await fileToAdImageDataUrl(file);
      setImageDataUrl(result.dataUrl);
      setImageName(result.name);
      if (!name.trim()) {
        const base = result.name.replace(/\.[^.]+$/, "").trim();
        if (base) setName(base);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload image");
    } finally {
      setUploading(false);
    }
  };

  const onSaveAd = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Add a name for this ad");
      return;
    }
    const cleaned = variants
      .map((v) => ({
        ...v,
        headline: v.headline.trim(),
        primaryText: v.primaryText.trim(),
        description: v.description.trim(),
      }))
      .filter((v) => v.headline || v.primaryText || v.description);

    if (!cleaned.length) {
      toast.error("Add at least one headline or caption");
      return;
    }

    setAds(
      addAdCopyCreative({
        name: trimmedName,
        imageDataUrl,
        imageName,
        variants: cleaned,
      }),
    );
    resetComposer();
    toast.success(`Saved "${trimmedName}"`);
  };

  const patchVariant = (
    list: AdCopyVariant[],
    variantId: string,
    field: keyof Pick<AdCopyVariant, "headline" | "primaryText" | "description">,
    value: string,
  ) => list.map((v) => (v.id === variantId ? { ...v, [field]: value } : v));

  const saveEditedAd = (ad: AdCopyCreative, nextVariants: AdCopyVariant[]) => {
    setAds(updateAdCopyCreative(ad.id, { variants: nextVariants }));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Store Facebook ad creatives with the image you&apos;ll run, plus headline and caption options.
        Copy each field when you set up Ads Manager.
      </p>

      {/* Composer */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-900">New ad creative</h3>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-[220px_1fr]">
          <div>
            <p className="mb-1.5 text-sm font-medium text-gray-900">Ad image</p>
            <div
              onDragOver={(e: DragEvent) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e: DragEvent) => {
                e.preventDefault();
                setDragOver(false);
                void takeImage(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed p-3 transition-colors",
                dragOver ? "border-blue-500 bg-blue-50/50" : "border-gray-200 bg-gray-50/60",
              )}
            >
              {imageDataUrl ? (
                <>
                  <img
                    src={imageDataUrl}
                    alt={imageName ?? "Ad"}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-2 rounded-full bg-black/70 p-1 text-white"
                    aria-label="Remove image"
                    onClick={() => {
                      setImageDataUrl(null);
                      setImageName(null);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <ImagePlus className="mb-2 h-6 w-6 text-gray-400" />
                  <p className="text-center text-xs text-gray-400">
                    {uploading ? "Processing…" : "Drop image or upload"}
                  </p>
                </>
              )}
            </div>
            <div className="mt-2">
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                className="w-full gap-1.5"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="h-3.5 w-3.5" />
                {imageDataUrl ? "Replace image" : "Upload image"}
              </Button>
              <input
                id={fileInputId}
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  void takeImage(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="ad-name" className="mb-1.5 block text-sm font-medium text-gray-900">
                Name
              </label>
              <Input
                id="ad-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Galaxy hoodie — Feed test A"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-900">Headlines & captions</p>
                <Button
                  type="button"
                  variant="tertiary"
                  size="sm"
                  className="gap-1"
                  onClick={() => setVariants((prev) => [...prev, createEmptyVariant()])}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add option
                </Button>
              </div>

              {variants.map((variant, index) => (
                <div
                  key={variant.id}
                  className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/50 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Option {index + 1}
                    </span>
                    {variants.length > 1 ? (
                      <button
                        type="button"
                        className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                        aria-label={`Remove option ${index + 1}`}
                        onClick={() =>
                          setVariants((prev) => prev.filter((v) => v.id !== variant.id))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-gray-600">Headline</label>
                      <span
                        className={cn(
                          "text-[10px]",
                          variant.headline.length > HEADLINE_SOFT
                            ? "text-amber-600"
                            : "text-gray-400",
                        )}
                      >
                        {charHint(variant.headline.length, HEADLINE_SOFT)}
                      </span>
                    </div>
                    <Input
                      value={variant.headline}
                      onChange={(e) =>
                        setVariants((prev) =>
                          patchVariant(prev, variant.id, "headline", e.target.value),
                        )
                      }
                      placeholder="Short headline for the ad"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-gray-600">
                        Primary text (caption)
                      </label>
                      <span
                        className={cn(
                          "text-[10px]",
                          variant.primaryText.length > PRIMARY_SOFT
                            ? "text-amber-600"
                            : "text-gray-400",
                        )}
                      >
                        {charHint(variant.primaryText.length, PRIMARY_SOFT)}
                      </span>
                    </div>
                    <Textarea
                      rows={3}
                      value={variant.primaryText}
                      onChange={(e) =>
                        setVariants((prev) =>
                          patchVariant(prev, variant.id, "primaryText", e.target.value),
                        )
                      }
                      placeholder="Main ad copy shown above the image"
                      className="resize-y"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-gray-600">
                        Description <span className="font-normal text-gray-400">(optional)</span>
                      </label>
                      <span
                        className={cn(
                          "text-[10px]",
                          variant.description.length > DESCRIPTION_SOFT
                            ? "text-amber-600"
                            : "text-gray-400",
                        )}
                      >
                        {charHint(variant.description.length, DESCRIPTION_SOFT)}
                      </span>
                    </div>
                    <Input
                      value={variant.description}
                      onChange={(e) =>
                        setVariants((prev) =>
                          patchVariant(prev, variant.id, "description", e.target.value),
                        )
                      }
                      placeholder="Link description under the headline"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="tertiary" size="sm" onClick={resetComposer}>
                Clear
              </Button>
              <Button type="button" onClick={onSaveAd}>
                Save ad
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Library */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            Saved ads
            {ads.length ? (
              <span className="ml-2 text-xs font-normal text-gray-400">{ads.length}</span>
            ) : null}
          </h3>
        </div>

        {ads.length ? (
          <ul className="space-y-4">
            {ads.map((ad) => (
              <li
                key={ad.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="flex flex-wrap items-start gap-4 border-b border-gray-100 p-4">
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    {ad.imageDataUrl ? (
                      <img
                        src={ad.imageDataUrl}
                        alt={ad.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] text-gray-400">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">{ad.name}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {ad.variants.length} option{ad.variants.length === 1 ? "" : "s"}
                      {ad.imageName ? ` · ${ad.imageName}` : ""}
                      {" · "}
                      Saved {new Date(ad.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="tertiary"
                      size="sm"
                      className="gap-1"
                      onClick={() =>
                        setAds(
                          updateAdCopyCreative(ad.id, {
                            variants: [...ad.variants, createEmptyVariant()],
                          }),
                        )
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Option
                    </Button>
                    <Button
                      type="button"
                      variant="tertiary"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => {
                        setAds(deleteAdCopyCreative(ad.id));
                        toast.message(`Deleted "${ad.name}"`);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <ul className="divide-y divide-gray-100">
                  {ad.variants.map((variant, index) => (
                    <li key={variant.id} className="space-y-3 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Option {index + 1}
                      </p>

                      <div>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <label className="text-xs font-medium text-gray-600">Headline</label>
                          <CopyFieldButton label="Headline" value={variant.headline} />
                        </div>
                        <Input
                          value={variant.headline}
                          onChange={(e) => {
                            const next = patchVariant(
                              ad.variants,
                              variant.id,
                              "headline",
                              e.target.value,
                            );
                            saveEditedAd(ad, next);
                          }}
                          placeholder="Headline"
                        />
                      </div>

                      <div>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <label className="text-xs font-medium text-gray-600">
                            Primary text (caption)
                          </label>
                          <CopyFieldButton label="Primary text" value={variant.primaryText} />
                        </div>
                        <Textarea
                          rows={3}
                          value={variant.primaryText}
                          onChange={(e) => {
                            const next = patchVariant(
                              ad.variants,
                              variant.id,
                              "primaryText",
                              e.target.value,
                            );
                            saveEditedAd(ad, next);
                          }}
                          placeholder="Primary text"
                          className="resize-y"
                        />
                      </div>

                      <div>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <label className="text-xs font-medium text-gray-600">Description</label>
                          <CopyFieldButton label="Description" value={variant.description} />
                        </div>
                        <Input
                          value={variant.description}
                          onChange={(e) => {
                            const next = patchVariant(
                              ad.variants,
                              variant.id,
                              "description",
                              e.target.value,
                            );
                            saveEditedAd(ad, next);
                          }}
                          placeholder="Description (optional)"
                        />
                      </div>

                      {ad.variants.length > 1 ? (
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="tertiary"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => {
                              const next = ad.variants.filter((v) => v.id !== variant.id);
                              saveEditedAd(ad, next.length ? next : [createEmptyVariant()]);
                            }}
                          >
                            Remove option
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center text-sm text-gray-500">
            No saved ads yet. Upload an image, add headlines and captions, then Save ad.
          </div>
        )}
      </section>
    </div>
  );
}
