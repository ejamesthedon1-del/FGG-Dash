"use client";

import * as React from "react";
import { useSearchParams } from "react-router";
import {
  CalendarPlus,
  ChevronRight,
  ImageIcon,
  Instagram,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteInstagramSchedulePost,
  disconnectInstagram,
  fetchInstagramSchedule,
  fetchInstagramStatus,
  instagramConnectUrl,
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
  findAsset,
  isImageItem,
  loadCreativeAssets,
  type AssetItem,
} from "../lib/creative-assets-storage";
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

export function InstagramScheduleSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = React.useState<IgScheduledPost[]>(() =>
    sortIgPosts(loadIgSchedule().posts),
  );
  const [brand, setBrand] = React.useState<IgScheduleBrand>("live-don");
  const [caption, setCaption] = React.useState("");
  const [kind, setKind] = React.useState<IgPostKind>("feed");
  const [scheduledLocal, setScheduledLocal] = React.useState(() =>
    toDatetimeLocalValue(defaultScheduleAt()),
  );
  const [assetId, setAssetId] = React.useState<string>("");
  const [externalUrl, setExternalUrl] = React.useState("");
  const [slides, setSlides] = React.useState<
    { src: string; name?: string; assetId?: string }[]
  >([]);
  const [status, setStatus] = React.useState<IgConnectionStatus | null>(null);
  const [statusLoading, setStatusLoading] = React.useState(true);
  const [publishingId, setPublishingId] = React.useState<string | null>(null);
  const [focusedPostId, setFocusedPostId] = React.useState<string | null>(null);
  const queueItemRefs = React.useRef<Map<string, HTMLLIElement>>(new Map());

  const images = React.useMemo(
    () => flattenImages(loadCreativeAssets()),
    [posts],
  );

  const refresh = React.useCallback(() => {
    setPosts(sortIgPosts(loadIgSchedule().posts));
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
    setStatusLoading(true);
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
    } finally {
      setStatusLoading(false);
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
        "Auto-publish needs public https:// image URLs (Shopify Files, CDN, etc.)",
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
    <div className="mx-auto w-full max-w-3xl space-y-12 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.03em] text-gray-950">
            Instagram
          </h2>
          <p className="mt-1 text-[15px] text-gray-500">
            Schedule organic posts — they auto-publish at the set time.
          </p>
        </div>
        <Select
          value={brand}
          onValueChange={(v) => setBrand(v as IgScheduleBrand)}
        >
          <SelectTrigger className="w-[200px]" aria-label="Brand">
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
      </header>

      <section className="space-y-3 border-t border-black/[0.06] pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[15px]">
            <Instagram className="size-4 text-gray-400" strokeWidth={1.5} />
            {statusLoading ? (
              <span className="text-gray-400">Checking connection…</span>
            ) : status?.connected ? (
              <span className="text-gray-950">
                Connected as{" "}
                <span className="font-medium">
                  @{status.username || "instagram"}
                </span>
              </span>
            ) : status?.configured ? (
              <span className="text-gray-500">Not connected</span>
            ) : status?.error ? (
              <span className="text-gray-500">
                Can’t reach API — start the backend on port 8000
              </span>
            ) : (
              <span className="text-gray-500">
                Meta app not configured for Instagram publishing
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {status?.connected ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void (async () => {
                    try {
                      await disconnectInstagram(brand);
                      toast.success("Disconnected");
                      void loadStatus(brand);
                    } catch (err) {
                      toast.error(
                        err instanceof Error ? err.message : "Disconnect failed",
                      );
                    }
                  })();
                }}
              >
                Disconnect
              </Button>
            ) : status?.configured ? (
              <Button type="button" size="sm" className="gap-1.5" asChild>
                <a href={instagramConnectUrl(brand)}>Connect Instagram</a>
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadStatus(brand)}
              >
                Retry
              </Button>
            )}
          </div>
        </div>
        {!statusLoading && !status?.configured && !status?.error ? (
          <p className="text-[13px] text-gray-400">
            Set <code className="text-[12px]">META_APP_ID</code> and{" "}
            <code className="text-[12px]">META_APP_SECRET</code> on the API, add
            redirect{" "}
            <code className="break-all text-[12px]">
              {status?.redirectUri || "…/api/instagram/callback"}
            </code>
            , then connect a Business/Creator account linked to a Facebook Page.
          </p>
        ) : null}
        {!statusLoading && status?.error ? (
          <p className="text-[13px] text-gray-400">
            Run the API locally, then click Retry:{" "}
            <code className="text-[12px]">
              cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000
            </code>
          </p>
        ) : null}
      </section>

      <InstagramFeedLayout
        posts={posts}
        brand={brand}
        focusedId={focusedPostId}
        onFocusPost={onFocusPost}
        onReorder={onFeedReorder}
      />

      <section className="space-y-4 border-t border-black/[0.06] pt-6">
        <h3 className="text-[13px] font-medium tracking-wide text-gray-400">
          New post
        </h3>
        <div className="flex gap-2">
          {(["feed", "story"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
                kind === value
                  ? "bg-gray-950 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              )}
            >
              {value === "feed" ? "Feed" : "Story"}
            </button>
          ))}
        </div>
        {kind === "feed" ? (
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption"
            className="min-h-[110px] resize-y text-[15px] shadow-none"
          />
        ) : (
          <p className="text-[13px] text-gray-400">
            Stories post the image only (no feed caption). Use a vertical 9:16
            image when possible.
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-[13px] text-gray-400">
              Add creative asset
              {kind === "feed" ? " (carousel)" : ""}
            </span>
            <Select
              value={assetId || "__none__"}
              onValueChange={(v) => {
                if (v === "__none__") {
                  setAssetId("");
                  return;
                }
                setAssetId(v);
                const asset =
                  findAsset(loadCreativeAssets(), v) ??
                  images.find((i) => i.id === v);
                if (asset?.src) {
                  addSlide(asset.src, { name: asset.name, assetId: asset.id });
                  setAssetId("");
                }
              }}
            >
              <SelectTrigger aria-label="Creative asset">
                <SelectValue placeholder="Choose image" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Choose to add…</SelectItem>
                {images.map((img) => (
                  <SelectItem key={img.id} value={img.id}>
                    {img.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-[13px] text-gray-400">
              Add public image URL
            </span>
            <div className="flex gap-2">
              <Input
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://…"
                className="shadow-none"
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
                className="shrink-0"
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
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-[13px] text-gray-400">Post at</span>
            <Input
              type="datetime-local"
              value={scheduledLocal}
              onChange={(e) => setScheduledLocal(e.target.value)}
              className="shadow-none"
            />
          </label>
        </div>
        {slides.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[13px] text-gray-400">
              {kind === "story"
                ? "Story image"
                : slides.length > 1
                  ? `Carousel · ${slides.length} of ${IG_CAROUSEL_MAX}`
                  : "1 image · add more for a carousel"}
            </p>
            <div className="flex flex-wrap gap-2">
              {slides.map((slide, index) => (
                <div key={`${slide.src}-${index}`} className="relative">
                  <img
                    src={slide.src}
                    alt=""
                    className="size-16 rounded-md object-cover"
                  />
                  <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 text-[9px] text-white">
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
            {!slides.every((s) => isPublicHttpsUrl(s.src)) ? (
              <p className="text-[13px] text-amber-700">
                Every slide needs a public https:// URL to auto-publish
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[13px] text-gray-400">
            <ImageIcon className="size-4" />
            No images yet — add assets or URLs
            {kind === "feed" ? " (2+ = carousel)" : ""}
          </div>
        )}
        <Button type="button" className="gap-1.5" onClick={onSchedule}>
          <CalendarPlus className="size-4" />
          {kind === "story"
            ? "Schedule story"
            : slides.length > 1
              ? "Schedule carousel"
              : "Schedule post"}
        </Button>
      </section>

      <section className="space-y-2 border-t border-black/[0.06] pt-6">
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
          <ul className="border-t border-black/[0.06]">
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
