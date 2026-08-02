"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, ImageIcon, X } from "lucide-react";

import {
  feedLayoutPosts,
  moveFeedLayoutItem,
  postCoverSrc,
  postImageUrls,
  type IgPostStatus,
  type IgScheduleBrand,
  type IgScheduledPost,
} from "../lib/instagram-schedule-storage";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { cn } from "./ui/utils";

const MIN_SLOTS = 9;
/** Instagram feed recommends ~1080px on the short side. */
const IG_MIN_SHORT_SIDE = 1080;

function statusBadge(status: IgPostStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "scheduled":
      return "Sched";
    case "publishing":
      return "…";
    case "posted":
      return "Live";
    case "failed":
      return "Fail";
  }
}

function formatWhenShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function ratioLabel(width: number, height: number): string {
  if (!width || !height) return "—";
  const g = gcd(width, height);
  const rw = Math.round(width / g);
  const rh = Math.round(height / g);
  // Prefer common IG labels when close
  const r = width / height;
  if (Math.abs(r - 1) < 0.03) return "1:1 (square)";
  if (Math.abs(r - 4 / 5) < 0.04) return "4:5 (portrait)";
  if (Math.abs(r - 5 / 4) < 0.04) return "5:4 (landscape)";
  if (Math.abs(r - 16 / 9) < 0.05) return "16:9";
  if (Math.abs(r - 9 / 16) < 0.05) return "9:16 (story)";
  if (rw <= 50 && rh <= 50) return `${rw}:${rh}`;
  return `${r.toFixed(2)} · ~${rw}:${rh}`;
}

function qualityLabel(width: number, height: number): {
  label: string;
  detail: string;
  tone: "good" | "ok" | "low";
} {
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  if (short >= 1440) {
    return {
      label: "High",
      detail: `${width}×${height} · sharp for Feed`,
      tone: "good",
    };
  }
  if (short >= IG_MIN_SHORT_SIDE) {
    return {
      label: "Good",
      detail: `${width}×${height} · meets IG ~${IG_MIN_SHORT_SIDE}px`,
      tone: "good",
    };
  }
  if (short >= 720) {
    return {
      label: "Soft",
      detail: `${width}×${height} · below ${IG_MIN_SHORT_SIDE}px (may look soft)`,
      tone: "ok",
    };
  }
  return {
    label: "Low",
    detail: `${width}×${height} · too small for crisp Feed`,
    tone: "low",
  };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type ImageMeta = {
  width: number;
  height: number;
  bytes?: number;
};

function useImageMeta(src: string | undefined): {
  meta: ImageMeta | null;
  loading: boolean;
  error: string | null;
} {
  const [meta, setMeta] = React.useState<ImageMeta | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!src) {
      setMeta(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMeta(null);

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const next: ImageMeta = {
        width: img.naturalWidth,
        height: img.naturalHeight,
      };
      setMeta(next);
      setLoading(false);
      // Best-effort file size (often blocked by CORS on CDNs).
      void fetch(src, { method: "HEAD", mode: "cors" })
        .then((res) => {
          if (cancelled || !res.ok) return;
          const len = res.headers.get("content-length");
          if (len && Number(len) > 0) {
            setMeta((m) => (m ? { ...m, bytes: Number(len) } : m));
          }
        })
        .catch(() => undefined);
    };
    img.onerror = () => {
      if (cancelled) return;
      setLoading(false);
      setError("Could not load image metadata");
    };
    img.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return { meta, loading, error };
}

type InstagramFeedLayoutProps = {
  posts: IgScheduledPost[];
  brand: IgScheduleBrand;
  focusedId?: string | null;
  onFocusPost?: (postId: string) => void;
  onReorder?: (reordered: IgScheduledPost[]) => void;
};

export function InstagramFeedLayout({
  posts,
  brand,
  focusedId,
  onFocusPost,
  onReorder,
}: InstagramFeedLayoutProps) {
  const layout = React.useMemo(
    () => feedLayoutPosts(posts, brand),
    [posts, brand],
  );
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);
  const [previewPost, setPreviewPost] = React.useState<IgScheduledPost | null>(
    null,
  );
  const [slideIndex, setSlideIndex] = React.useState(0);

  const previewUrls = previewPost ? postImageUrls(previewPost) : [];
  const previewSrc = previewUrls[slideIndex] || previewUrls[0];
  const { meta, loading: metaLoading, error: metaError } =
    useImageMeta(previewSrc);

  const slotCount = Math.max(MIN_SLOTS, Math.ceil(layout.length / 3) * 3);

  const openPreview = (post: IgScheduledPost) => {
    setPreviewPost(post);
    setSlideIndex(0);
    onFocusPost?.(post.id);
  };

  const handleDrop = (toIndex: number) => {
    if (dragIndex == null || dragIndex === toIndex || !onReorder) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    if (toIndex >= layout.length) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    onReorder(moveFeedLayoutItem(layout, dragIndex, toIndex));
    setDragIndex(null);
    setOverIndex(null);
  };

  const quality = meta
    ? qualityLabel(meta.width, meta.height)
    : null;

  return (
    <section className="space-y-3 border-t border-black/[0.06] pt-6">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-medium tracking-wide text-gray-400">
          Feed layout
        </h3>
        <span className="text-[13px] tabular-nums text-gray-300">
          {layout.length}
        </span>
      </div>

      <div className="mx-auto w-full max-w-[390px]">
        <div
          className="grid grid-cols-3 gap-[2px] bg-white"
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setOverIndex(null);
            }
          }}
        >
          {Array.from({ length: slotCount }, (_, index) => {
            const post = layout[index];
            if (!post) {
              return (
                <div
                  key={`empty-${index}`}
                  className="aspect-square bg-gray-50"
                  aria-hidden
                />
              );
            }
            const isDragging = dragIndex === index;
            const isOver = overIndex === index && dragIndex !== index;
            const isFocused = focusedId === post.id;
            return (
              <button
                key={post.id}
                type="button"
                draggable={Boolean(onReorder)}
                onDragStart={(e) => {
                  setDragIndex(index);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", post.id);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setOverIndex(index);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(index);
                }}
                onClick={() => openPreview(post)}
                title={`${formatWhenShort(post.scheduledAt)} · ${statusBadge(post.status)} · Preview`}
                className={cn(
                  "group relative aspect-square overflow-hidden bg-gray-100 outline-none",
                  "focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-1",
                  isDragging && "opacity-40",
                  isOver && "ring-2 ring-inset ring-gray-950",
                  isFocused && "ring-2 ring-inset ring-blue-500",
                )}
              >
                {postCoverSrc(post) ? (
                  <img
                    src={postCoverSrc(post)}
                    alt=""
                    draggable={false}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-gray-300">
                    <ImageIcon className="size-5" />
                  </div>
                )}
                {postImageUrls(post).length > 1 ? (
                  <span className="absolute top-1 right-1 rounded bg-black/55 px-1 py-0.5 text-[9px] font-medium text-white">
                    {postImageUrls(post).length}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "absolute top-1 left-1 rounded px-1 py-0.5 text-[9px] font-medium tracking-wide uppercase",
                    "bg-black/55 text-white",
                    post.status === "failed" && "bg-red-600/80",
                    post.status === "posted" && "bg-black/40",
                  )}
                >
                  {statusBadge(post.status)}
                </span>
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-1.5 pt-5 pb-1 text-[10px] leading-tight text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  {formatWhenShort(post.scheduledAt)}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-gray-400">
          Tap a tile to preview · Drag to reorder · Stories excluded
        </p>
      </div>

      <Dialog
        open={Boolean(previewPost)}
        onOpenChange={(open) => {
          if (!open) setPreviewPost(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="space-y-1 border-b border-border px-4 py-3 pr-12 text-left">
            <DialogTitle className="text-[15px] font-medium">
              Image preview
            </DialogTitle>
            <DialogDescription className="text-[13px] text-muted-foreground">
              {previewPost
                ? `${formatWhenShort(previewPost.scheduledAt)} · ${statusBadge(previewPost.status)}`
                : null}
            </DialogDescription>
          </DialogHeader>

          <div className="relative bg-black">
            {previewSrc ? (
              <img
                src={previewSrc}
                alt=""
                className="mx-auto max-h-[min(55vh,520px)] w-full object-contain"
              />
            ) : (
              <div className="flex h-48 items-center justify-center text-gray-500">
                <ImageIcon className="size-8" />
              </div>
            )}
            {previewUrls.length > 1 ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="absolute top-1/2 left-2 size-8 -translate-y-1/2 rounded-full p-0"
                  disabled={slideIndex <= 0}
                  onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
                  aria-label="Previous slide"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="absolute top-1/2 right-2 size-8 -translate-y-1/2 rounded-full p-0"
                  disabled={slideIndex >= previewUrls.length - 1}
                  onClick={() =>
                    setSlideIndex((i) =>
                      Math.min(previewUrls.length - 1, i + 1),
                    )
                  }
                  aria-label="Next slide"
                >
                  <ChevronRight className="size-4" />
                </Button>
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
                  {slideIndex + 1} / {previewUrls.length}
                </span>
              </>
            ) : null}
          </div>

          <div className="space-y-3 px-4 py-3">
            {metaLoading ? (
              <p className="text-[13px] text-muted-foreground">Reading image…</p>
            ) : metaError ? (
              <p className="text-[13px] text-muted-foreground">{metaError}</p>
            ) : meta ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-gray-400">
                    Ratio
                  </dt>
                  <dd className="mt-0.5 font-medium text-gray-950">
                    {ratioLabel(meta.width, meta.height)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-gray-400">
                    Quality
                  </dt>
                  <dd
                    className={cn(
                      "mt-0.5 font-medium",
                      quality?.tone === "good" && "text-emerald-700",
                      quality?.tone === "ok" && "text-amber-700",
                      quality?.tone === "low" && "text-red-700",
                    )}
                  >
                    {quality?.label}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] uppercase tracking-wide text-gray-400">
                    Resolution
                  </dt>
                  <dd className="mt-0.5 text-gray-700">{quality?.detail}</dd>
                </div>
                {meta.bytes != null ? (
                  <div className="col-span-2">
                    <dt className="text-[11px] uppercase tracking-wide text-gray-400">
                      File size
                    </dt>
                    <dd className="mt-0.5 text-gray-700">
                      {formatBytes(meta.bytes)}
                      {meta.bytes > 8 * 1024 * 1024
                        ? " · large for upload"
                        : null}
                    </dd>
                  </div>
                ) : null}
                <div className="col-span-2">
                  <dt className="text-[11px] uppercase tracking-wide text-gray-400">
                    Grid crop
                  </dt>
                  <dd className="mt-0.5 text-gray-700">
                    Profile grid shows a 1:1 crop (center). Full ratio appears when
                    the post opens.
                  </dd>
                </div>
              </dl>
            ) : null}

            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setPreviewPost(null)}
              >
                <X className="size-3.5" />
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
