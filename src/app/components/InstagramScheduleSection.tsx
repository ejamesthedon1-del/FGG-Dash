"use client";

import * as React from "react";
import { useSearchParams } from "react-router";
import {
  BadgeCheck,
  Bookmark,
  CalendarPlus,
  ChevronRight,
  Heart,
  ImageIcon,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteInstagramSchedulePost,
  fetchInstagramSchedule,
  fetchInstagramStatus,
  publishInstagramPost,
  pushInstagramSchedule,
  upsertInstagramSchedulePost,
  type IgConnectionStatus,
} from "../lib/instagram-api";
import {
  applyRemoteIgSchedule,
  defaultScheduleAt,
  deleteIgPost,
  fromDatetimeLocalValue,
  IG_BRAND_LABELS,
  IG_CAROUSEL_MAX,
  IG_SCHEDULE_BRANDS,
  loadIgSchedule,
  newIgPostId,
  postCoverSrc,
  postImageUrls,
  saveIgSchedule,
  sortIgPosts,
  toDatetimeLocalValue,
  upsertIgPost,
  upsertIgPosts,
  type IgPostKind,
  type IgPostStatus,
  type IgScheduleBrand,
  type IgScheduledPost,
} from "../lib/instagram-schedule-storage";
import {
  assetPublishUrl,
  findAsset,
  isImageItem,
  loadCreativeAssets,
  type AssetItem,
} from "../lib/creative-assets-storage";
import { hostCreativeAssetsOnShopify } from "../lib/creative-assets-shopify";
import { uploadShopifyFile } from "../lib/shopify-files-api";
import { InstagramFeedLayout } from "./InstagramFeedLayout";
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

function flattenImages(items: AssetItem[]): AssetItem[] {
  const out: AssetItem[] = [];
  const walk = (list: AssetItem[]) => {
    for (const item of list) {
      if (isImageItem(item) && item.src) out.push(item);
      if (item.children?.length) walk(item.children);
    }
  };
  walk(items);
  return out;
}

function statusLabel(status: IgPostStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "scheduled":
      return "Scheduled";
    case "publishing":
      return "Publishing…";
    case "posted":
      return "Posted";
    case "failed":
      return "Failed";
  }
}

function kindLabel(kind: IgPostKind, slideCount = 1): string {
  if (kind === "story") return "Story";
  if (slideCount > 1) return `Carousel · ${slideCount}`;
  return "Feed";
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isPublicHttpsUrl(src: string | undefined): boolean {
  if (!src) return false;
  return /^https:\/\//i.test(src);
}

function brandHandle(brand: IgScheduleBrand): string {
  return brand === "live-don" ? "livdon" : "sinnerstestimony";
}

/** Split caption body vs trailing @/# tokens for IG-style preview. */
function splitCaptionPreview(text: string): { body: string; tags: string } {
  const trimmed = text.trim();
  if (!trimmed) return { body: "", tags: "" };
  const match = trimmed.match(/^(.*?)((?:\s+(?:@\w[\w.]*|#\w+))+)$/s);
  if (!match) return { body: trimmed, tags: "" };
  return { body: match[1].trim(), tags: match[2].trim() };
}

export function InstagramScheduleSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = React.useState<IgScheduledPost[]>(() =>
    sortIgPosts(loadIgSchedule().posts),
  );
  const [brand, setBrand] = React.useState<IgScheduleBrand>("live-don");
  const [caption, setCaption] = React.useState("");
  const kind: IgPostKind = "feed";
  /** Composer IG preview frame — how Feed would crop/show the media. */
  const [previewFrame, setPreviewFrame] = React.useState<
    "square" | "portrait"
  >("square");
  const [scheduledLocal, setScheduledLocal] = React.useState(() =>
    toDatetimeLocalValue(defaultScheduleAt()),
  );
  const [assetId, setAssetId] = React.useState<string>("");
  const [externalUrl, setExternalUrl] = React.useState("");
  const [hostingAsset, setHostingAsset] = React.useState(false);
  const [slides, setSlides] = React.useState<
    { src: string; name?: string; assetId?: string }[]
  >([]);
  const [status, setStatus] = React.useState<IgConnectionStatus | null>(null);
  const [publishingId, setPublishingId] = React.useState<string | null>(null);
  const [focusedPostId, setFocusedPostId] = React.useState<string | null>(null);
  const queueItemRefs = React.useRef<Map<string, HTMLLIElement>>(new Map());

  const [assetsTick, setAssetsTick] = React.useState(0);
  const images = React.useMemo(
    () => flattenImages(loadCreativeAssets()),
    [assetsTick],
  );

  const refresh = React.useCallback(() => {
    setPosts(sortIgPosts(loadIgSchedule().posts));
    setAssetsTick((n) => n + 1);
  }, []);

  const syncFromBackend = React.useCallback(async () => {
    try {
      const remote = await fetchInstagramSchedule();
      const merged = applyRemoteIgSchedule(remote);
      setPosts(sortIgPosts(merged.posts));
    } catch {
      // Backend optional while offline; keep local queue.
    }
  }, []);

  const pushLocalQueue = React.useCallback(async () => {
    try {
      const remote = await pushInstagramSchedule(loadIgSchedule());
      const merged = applyRemoteIgSchedule(remote);
      setPosts(sortIgPosts(merged.posts));
    } catch {
      // Keep local; auto-publisher needs backend sync when API is up.
    }
  }, []);

  React.useEffect(() => {
    void (async () => {
      await pushLocalQueue();
    })();
    const onSync = () => refresh();
    window.addEventListener("fgg-storage-sync", onSync);
    const poll = window.setInterval(() => {
      void syncFromBackend();
    }, 15_000);
    return () => {
      window.removeEventListener("fgg-storage-sync", onSync);
      window.clearInterval(poll);
    };
  }, [pushLocalQueue, refresh, syncFromBackend]);

  const loadStatus = React.useCallback(async (b: IgScheduleBrand) => {
    try {
      const next = await fetchInstagramStatus(b);
      setStatus(next);
    } catch (err) {
      setStatus({
        configured: false,
        connected: false,
        brand: b,
        username: null,
        igUserId: null,
        pageId: null,
        error:
          err instanceof Error
            ? err.message
            : "Could not reach API — is the backend running on :8000?",
      });
    }
  }, []);

  React.useEffect(() => {
    void loadStatus(brand);
  }, [brand, loadStatus]);

  React.useEffect(() => {
    const ig = searchParams.get("instagram");
    if (!ig) return;
    if (ig === "connected") {
      toast.success("Instagram connected");
      void loadStatus(brand);
    } else if (ig === "error") {
      const reason = searchParams.get("reason") || "connection_failed";
      toast.error(`Instagram connect failed: ${reason.replace(/_/g, " ")}`);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("instagram");
    next.delete("reason");
    next.set("section", "schedule");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, brand, loadStatus]);

  const addSlide = (src: string, meta?: { name?: string; assetId?: string }) => {
    const trimmed = src.trim();
    if (!trimmed) return;
    if (kind === "story" && slides.length >= 1) {
      toast.error("Stories only support one image");
      return;
    }
    if (slides.length >= IG_CAROUSEL_MAX) {
      toast.error(`Max ${IG_CAROUSEL_MAX} images per carousel`);
      return;
    }
    if (slides.some((s) => s.src === trimmed)) {
      toast.message("Image already added");
      return;
    }
    setSlides((prev) => [
      ...prev,
      { src: trimmed, name: meta?.name, assetId: meta?.assetId },
    ]);
  };

  /** Prefer stored Shopify CDN URL; only upload if missing. */
  const addAssetSlide = async (asset: AssetItem) => {
    if (!asset.src && !asset.shopifyUrl) return;
    if (kind === "story" && slides.length >= 1) {
      toast.error("Stories only support one image");
      return;
    }
    if (slides.length >= IG_CAROUSEL_MAX) {
      toast.error(`Max ${IG_CAROUSEL_MAX} images per carousel`);
      return;
    }

    // Fresh copy in case hosting finished after the picker opened.
    const latest =
      findAsset(loadCreativeAssets(), asset.id) ?? asset;
    const ready = assetPublishUrl(latest);
    if (isPublicHttpsUrl(ready)) {
      addSlide(ready!, { name: latest.name, assetId: latest.id });
      return;
    }

    setHostingAsset(true);
    const toastId = toast.loading(
      `Uploading “${latest.name || "image"}” to Shopify Files…`,
    );
    try {
      await hostCreativeAssetsOnShopify([latest], {
        brand,
        quiet: true,
      });
      const hosted = findAsset(loadCreativeAssets(), latest.id) ?? latest;
      const url = assetPublishUrl(hosted);
      if (!isPublicHttpsUrl(url)) {
        // Last resort: upload for this schedule brand without persisting fail.
        const result = await uploadShopifyFile({
          brand,
          source: latest.src!,
          filename: latest.name || undefined,
          alt: latest.name || undefined,
        });
        addSlide(result.url, { name: latest.name, assetId: latest.id });
      } else {
        addSlide(url!, { name: hosted.name, assetId: hosted.id });
      }
      toast.success("Added from Shopify Files", { id: toastId });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Shopify Files upload failed",
        { id: toastId },
      );
    } finally {
      setHostingAsset(false);
    }
  };

  const removeSlide = (index: number) => {
    setSlides((prev) => prev.filter((_, i) => i !== index));
  };

  React.useEffect(() => {
    if (kind === "story" && slides.length > 1) {
      setSlides((prev) => prev.slice(0, 1));
    }
  }, [kind, slides.length]);

  const onSchedule = () => {
    if (kind === "feed" && !caption.trim()) {
      toast.error("Add a caption");
      return;
    }
    if (slides.length === 0) {
      toast.error("Add at least one image");
      return;
    }
    if (!scheduledLocal) {
      toast.error("Pick a date and time");
      return;
    }
    if (kind === "story" && slides.length > 1) {
      toast.error("Stories only support one image");
      return;
    }
    if (!slides.every((s) => isPublicHttpsUrl(s.src))) {
      toast.error(
        "Auto-publish needs public https:// URLs — pick a Creative Asset (auto-uploads to Shopify Files) or paste an https link",
      );
      return;
    }
    const scheduledAt = fromDatetimeLocalValue(scheduledLocal);
    const srcs = slides.map((s) => s.src);
    const post: IgScheduledPost = {
      id: newIgPostId(),
      brand,
      kind,
      caption: caption.trim(),
      assetId: slides[0]?.assetId,
      assetName: slides[0]?.name,
      imageSrc: srcs[0],
      imageSrcs: srcs,
      scheduledAt,
      status: "scheduled",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    upsertIgPost(post);
    refresh();
    setCaption("");
    setAssetId("");
    setExternalUrl("");
    setSlides([]);
    setScheduledLocal(toDatetimeLocalValue(defaultScheduleAt()));
    toast.success(
      kind === "story"
        ? "Story scheduled — will auto-publish"
        : srcs.length > 1
          ? `Carousel scheduled (${srcs.length} images)`
          : "Post scheduled — will auto-publish",
    );
    void (async () => {
      try {
        const remote = await upsertInstagramSchedulePost(post);
        applyRemoteIgSchedule(remote);
        refresh();
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "Saved locally, but could not reach auto-publisher API",
        );
      }
    })();
  };

  const onMarkPosted = (post: IgScheduledPost) => {
    const next = {
      ...post,
      status: "posted" as const,
      postedAt: new Date().toISOString(),
      lastError: undefined,
    };
    upsertIgPost(next);
    refresh();
    toast.success("Marked as posted");
    void upsertInstagramSchedulePost(next).catch(() => undefined);
  };

  const onDelete = (id: string) => {
    deleteIgPost(id);
    refresh();
    void deleteInstagramSchedulePost(id)
      .then((remote) => {
        saveIgSchedule(remote);
        refresh();
      })
      .catch(() => undefined);
  };

  const onPublishNow = async (post: IgScheduledPost) => {
    if (!status?.connected) {
      toast.error("Connect Instagram for this brand first");
      return;
    }
    const urls = postImageUrls(post);
    if (!urls.length || !urls.every((u) => isPublicHttpsUrl(u))) {
      toast.error(
        "Instagram requires public https:// image URL(s) for auto-publish",
      );
      return;
    }
    setPublishingId(post.id);
    const publishing = {
      ...post,
      status: "publishing" as const,
      lastError: undefined,
    };
    upsertIgPost(publishing);
    refresh();
    void upsertInstagramSchedulePost(publishing).catch(() => undefined);
    try {
      const result = await publishInstagramPost({
        brand: post.brand,
        caption: post.caption,
        imageUrl: urls[0],
        imageUrls: urls,
        kind: post.kind ?? "feed",
      });
      if (!result.ok) {
        const failed = {
          ...post,
          status: "failed" as const,
          lastError: result.error || "Publish failed",
        };
        upsertIgPost(failed);
        refresh();
        void upsertInstagramSchedulePost(failed).catch(() => undefined);
        toast.error(result.error || "Publish failed");
        return;
      }
      const posted = {
        ...post,
        status: "posted" as const,
        postedAt: new Date().toISOString(),
        lastError: undefined,
        mediaId: result.mediaId,
      };
      upsertIgPost(posted);
      refresh();
      void upsertInstagramSchedulePost(posted).catch(() => undefined);
      toast.success(
        urls.length > 1
          ? `Carousel published (${urls.length} images)`
          : "Published to Instagram",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishingId(null);
    }
  };

  const brandPosts = posts.filter((p) => p.brand === brand);
  const previewHandle = brandHandle(brand);
  const { body: captionBody, tags: captionTags } = splitCaptionPreview(caption);

  const onFocusPost = React.useCallback((postId: string) => {
    setFocusedPostId(postId);
    const el = queueItemRefs.current.get(postId);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const onFeedReorder = React.useCallback(
    (reordered: IgScheduledPost[]) => {
      upsertIgPosts(reordered);
      refresh();
      toast.success("Feed order updated");
      void (async () => {
        try {
          const remote = await pushInstagramSchedule(loadIgSchedule());
          applyRemoteIgSchedule(remote);
          refresh();
        } catch {
          toast.message("Order saved locally — sync when API is available");
        }
      })();
    },
    [refresh],
  );

  return (
    <div className="relative w-full pb-10">
      <div className="absolute top-0 right-0 z-10">
        <Select
          value={brand}
          onValueChange={(v) => setBrand(v as IgScheduleBrand)}
        >
          <SelectTrigger className="h-7 w-[160px] text-[12px]" aria-label="Brand">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {IG_SCHEDULE_BRANDS.map((b) => (
              <SelectItem key={b} value={b}>
                {IG_BRAND_LABELS[b]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] lg:gap-8">
          <div className="min-w-0 space-y-3">
            <div>
              <div className="flex h-14 items-end">
                <span className="text-[12px] leading-none text-gray-400">
                  Caption
                </span>
              </div>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write a caption…"
                className="min-h-[80px] resize-y rounded-xl px-3 py-2 text-[13px] shadow-none"
                aria-label="Caption"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setPreviewFrame("square")}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    previewFrame === "square"
                      ? "bg-gray-950 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                  )}
                >
                  Square · 1080×1080
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFrame("portrait")}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    previewFrame === "portrait"
                      ? "bg-gray-950 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                  )}
                >
                  4:5 · 1080×1350
                </button>
              </div>
            </div>

            {slides.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {slides.map((slide, index) => (
                  <div key={`${slide.src}-${index}`} className="relative">
                    <img
                      src={slide.src}
                      alt=""
                      className="size-12 rounded-md object-cover"
                    />
                    <span className="absolute bottom-0.5 left-0.5 rounded bg-black/55 px-1 text-[9px] text-white">
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSlide(index)}
                      className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-gray-950 text-[10px] text-white"
                      aria-label={`Remove image ${index + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {slides.length > 0 &&
            !slides.every((s) => isPublicHttpsUrl(s.src)) ? (
              <p className="text-[12px] text-amber-700">
                Needs a public https:// URL (Creative Assets upload to Shopify
                Files automatically)
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-2.5">
              <label className="block space-y-1.5">
                <span className="text-[12px] text-gray-400">
                  Asset · carousel
                  {hostingAsset ? " · uploading…" : ""}
                </span>
                <Select
                  value={assetId || "__none__"}
                  disabled={hostingAsset}
                  onValueChange={(v) => {
                    if (v === "__none__") {
                      setAssetId("");
                      return;
                    }
                    setAssetId("");
                    const asset =
                      findAsset(loadCreativeAssets(), v) ??
                      images.find((i) => i.id === v);
                    if (asset?.src) {
                      void addAssetSlide(asset);
                    }
                  }}
                >
                  <SelectTrigger
                    aria-label="Creative asset"
                    className="h-7 w-full rounded-full px-3 text-[12px]"
                  >
                    <SelectValue
                      placeholder={
                        hostingAsset ? "Uploading to Shopify…" : "Choose to add…"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Choose to add…</SelectItem>
                    {images.map((img) => (
                      <SelectItem key={img.id} value={img.id}>
                        {img.name}
                        {isPublicHttpsUrl(assetPublishUrl(img))
                          ? " · ready"
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-[12px] text-gray-400">Image URL</span>
                <div className="flex gap-1.5">
                  <Input
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://…"
                    className="h-7 rounded-full px-3 text-[12px] shadow-none md:text-[12px]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (externalUrl.trim()) {
                          addSlide(externalUrl.trim());
                          setExternalUrl("");
                        }
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 rounded-full px-3 text-[12px]"
                    onClick={() => {
                      if (!externalUrl.trim()) return;
                      addSlide(externalUrl.trim());
                      setExternalUrl("");
                    }}
                  >
                    Add
                  </Button>
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="text-[12px] text-gray-400">Post at</span>
                <Input
                  type="datetime-local"
                  value={scheduledLocal}
                  onChange={(e) => setScheduledLocal(e.target.value)}
                  className="h-7 rounded-full px-3 text-[12px] shadow-none md:text-[12px]"
                />
              </label>
            </div>

            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 rounded-full px-3.5 text-[12px]"
              onClick={onSchedule}
            >
              <CalendarPlus className="size-3.5" />
              {slides.length > 1 ? "Schedule carousel" : "Schedule post"}
            </Button>
          </div>

          <div className="grid min-w-0 items-start gap-6 sm:grid-cols-2">
            <div className="min-w-0 w-full max-w-[360px]">
              <div className="w-full overflow-hidden rounded-2xl bg-white">
                <div className="flex h-14 items-center gap-2.5 px-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(45deg,#f09433_0%,#e6683c_25%,#dc2743_50%,#cc2366_75%,#bc1888_100%)] p-[2px]">
                    <div className="flex size-full items-center justify-center rounded-full bg-white p-[2px]">
                      <div className="flex size-full items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold uppercase text-gray-500">
                        {IG_BRAND_LABELS[brand].slice(0, 1)}
                      </div>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="truncate text-[13px] font-semibold text-gray-950">
                      {previewHandle}
                    </span>
                    <span className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full bg-[#3897f0]">
                      <BadgeCheck
                        className="size-2.5 text-white"
                        strokeWidth={2.5}
                      />
                    </span>
                  </div>
                  <MoreHorizontal
                    className="size-5 shrink-0 text-gray-950"
                    strokeWidth={1.75}
                  />
                </div>

                <div
                  className={cn(
                    "relative w-full bg-[#efefef]",
                    previewFrame === "portrait"
                      ? "aspect-[1080/1350]"
                      : "aspect-square",
                  )}
                >
                  {slides[0]?.src ? (
                    <img
                      src={slides[0].src}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-1 px-4 text-center">
                      <ImageIcon
                        className="size-12 text-[#8e8e8e]"
                        strokeWidth={1.25}
                      />
                      <p className="text-[11px] text-gray-400">
                        {previewFrame === "portrait"
                          ? "1080×1350 preview"
                          : "1080×1080 preview"}
                      </p>
                    </div>
                  )}
                  <span className="absolute bottom-2.5 left-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
                    {previewFrame === "portrait"
                      ? "4:5 · 1080×1350"
                      : "1:1 · 1080×1080"}
                  </span>
                  {slides.length > 1 ? (
                    <span className="absolute top-2.5 right-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">
                      1 / {slides.length}
                    </span>
                  ) : null}
                  {slides[0] ? (
                    <button
                      type="button"
                      onClick={() => removeSlide(0)}
                      className="absolute top-2.5 left-2.5 flex size-6 items-center justify-center rounded-full bg-black/55 text-xs text-white hover:bg-black/70"
                      aria-label="Remove image"
                    >
                      ×
                    </button>
                  ) : null}
                </div>

                <div className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-3.5">
                    <Heart
                      className="size-[22px] fill-[#ed4956] text-[#ed4956]"
                      strokeWidth={0}
                    />
                    <MessageCircle
                      className="size-[22px] text-gray-950"
                      strokeWidth={1.75}
                    />
                    <Send
                      className="size-[22px] text-gray-950"
                      strokeWidth={1.75}
                    />
                  </div>
                  <Bookmark
                    className="size-[22px] text-gray-950"
                    strokeWidth={1.75}
                  />
                </div>

                <div className="space-y-1.5 px-3 pb-3.5">
                  <p className="text-[13px] font-semibold text-gray-950">
                    3,452 likes
                  </p>
                  <div className="text-[13px] leading-snug text-gray-950">
                    <span className="inline-flex items-center gap-0.5 align-middle font-semibold">
                      {previewHandle}
                      <span className="inline-flex size-3 items-center justify-center rounded-full bg-[#3897f0]">
                        <BadgeCheck
                          className="size-2 text-white"
                          strokeWidth={2.5}
                        />
                      </span>
                    </span>{" "}
                    {captionBody || caption.trim() ? (
                      <span className="font-normal">
                        {captionBody || caption.trim()}
                      </span>
                    ) : (
                      <span className="font-normal text-gray-400">
                        Write a caption…
                      </span>
                    )}
                    {captionTags ? (
                      <p className="mt-1 font-normal text-[#00376b]">
                        {captionTags}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <InstagramFeedLayout
              posts={posts}
              brand={brand}
              focusedId={focusedPostId}
              onFocusPost={onFocusPost}
              onReorder={onFeedReorder}
              className="min-w-0 border-0 pt-0"
            />
          </div>
      </div>

      <section className="space-y-2 pt-2">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-medium tracking-wide text-gray-400">
            Queue · {IG_BRAND_LABELS[brand]}
          </h3>
          <span className="text-[13px] tabular-nums text-gray-300">
            {brandPosts.length}
          </span>
        </div>
        {brandPosts.length === 0 ? (
          <p className="py-8 text-[15px] text-gray-400">No scheduled posts yet</p>
        ) : (
          <ul>
            {brandPosts.map((post) => (
              <li
                key={post.id}
                ref={(node) => {
                  if (node) queueItemRefs.current.set(post.id, node);
                  else queueItemRefs.current.delete(post.id);
                }}
                className={cn(
                  "flex gap-3 border-b border-black/[0.06] py-4 transition-colors",
                  focusedPostId === post.id && "bg-blue-50/60",
                )}
              >
                {postCoverSrc(post) ? (
                  <div className="relative shrink-0">
                    <img
                      src={postCoverSrc(post)}
                      alt=""
                      className="size-14 rounded-md object-cover"
                    />
                    {postImageUrls(post).length > 1 ? (
                      <span className="absolute -right-1 -bottom-1 rounded bg-gray-950 px-1 text-[9px] font-medium text-white">
                        {postImageUrls(post).length}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-300">
                    <ImageIcon className="size-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[15px] font-medium text-gray-950">
                    {post.kind === "story"
                      ? post.assetName || "Story"
                      : post.caption || "(No caption)"}
                  </p>
                  <p className="mt-1 text-[13px] text-gray-400">
                    {kindLabel(post.kind ?? "feed", postImageUrls(post).length)}{" "}
                    · {statusLabel(post.status)} · {formatWhen(post.scheduledAt)}
                    {post.lastError ? ` · ${post.lastError}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {post.status !== "posted" && post.status !== "publishing" ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={publishingId === post.id}
                          onClick={() => void onPublishNow(post)}
                        >
                          {publishingId === post.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            "Publish now"
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="tertiary"
                          className="h-7 px-2 text-xs"
                          onClick={() => onMarkPosted(post)}
                        >
                          Mark posted
                        </Button>
                      </>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="tertiary"
                      className="h-7 px-2 text-xs text-gray-400"
                      onClick={() => onDelete(post.id)}
                      aria-label="Delete post"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <ChevronRight
                  className={cn(
                    "mt-1 size-4 shrink-0 text-gray-200",
                    post.status === "posted" && "opacity-40",
                  )}
                  strokeWidth={1.5}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
