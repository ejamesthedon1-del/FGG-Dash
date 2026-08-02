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
  IG_SCHEDULE_BRANDS,
  loadIgSchedule,
  newIgPostId,
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

function kindLabel(kind: IgPostKind): string {
  return kind === "story" ? "Story" : "Feed";
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
  const [status, setStatus] = React.useState<IgConnectionStatus | null>(null);
  const [statusLoading, setStatusLoading] = React.useState(true);
  const [publishingId, setPublishingId] = React.useState<string | null>(null);
  const [focusedPostId, setFocusedPostId] = React.useState<string | null>(null);
  const queueItemRefs = React.useRef<Map<string, HTMLLIElement>>(new Map());

  const images = React.useMemo(
    () => flattenImages(loadCreativeAssets()),
    [posts],
  );

  const selectedAsset = assetId
    ? findAsset(loadCreativeAssets(), assetId) ??
      images.find((i) => i.id === assetId)
    : undefined;

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

  const imageSrc =
    (externalUrl.trim() && /^https?:\/\//i.test(externalUrl.trim())
      ? externalUrl.trim()
      : null) ||
    selectedAsset?.src ||
    undefined;

  const onSchedule = () => {
    if (kind === "feed" && !caption.trim()) {
      toast.error("Add a caption");
      return;
    }
    if (!imageSrc) {
      toast.error("Pick a creative asset or paste an image URL");
      return;
    }
    if (!scheduledLocal) {
      toast.error("Pick a date and time");
      return;
    }
    if (!isPublicHttpsUrl(imageSrc)) {
      toast.error(
        "Auto-publish needs a public https:// image URL (Shopify Files, CDN, etc.)",
      );
      return;
    }
    const scheduledAt = fromDatetimeLocalValue(scheduledLocal);
    const post: IgScheduledPost = {
      id: newIgPostId(),
      brand,
      kind,
      caption: caption.trim(),
      assetId: selectedAsset?.id,
      assetName: selectedAsset?.name,
      imageSrc,
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
    setScheduledLocal(toDatetimeLocalValue(defaultScheduleAt()));
    toast.success(
      kind === "story"
        ? "Story scheduled — will auto-publish"
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
    if (!isPublicHttpsUrl(post.imageSrc)) {
      toast.error(
        "Instagram requires a public https:// image URL for auto-publish",
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
        imageUrl: post.imageSrc!,
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
      toast.success("Published to Instagram");
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
            <span className="text-[13px] text-gray-400">Creative asset</span>
            <Select
              value={assetId || "__none__"}
              onValueChange={(v) => setAssetId(v === "__none__" ? "" : v)}
            >
              <SelectTrigger aria-label="Creative asset">
                <SelectValue placeholder="Choose image" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
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
              Public image URL (required for auto-publish)
            </span>
            <Input
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://…"
              className="shadow-none"
            />
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
        {imageSrc ? (
          <div className="flex items-center gap-3">
            <img
              src={imageSrc}
              alt=""
              className="size-16 rounded-md object-cover"
            />
            <p className="text-[13px] text-gray-400">
              {selectedAsset?.name || "External image"}
              {!isPublicHttpsUrl(imageSrc)
                ? " · preview only until you use an https URL"
                : null}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[13px] text-gray-400">
            <ImageIcon className="size-4" />
            No image selected
          </div>
        )}
        <Button type="button" className="gap-1.5" onClick={onSchedule}>
          <CalendarPlus className="size-4" />
          {kind === "story" ? "Schedule story" : "Schedule post"}
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
                {post.imageSrc ? (
                  <img
                    src={post.imageSrc}
                    alt=""
                    className="size-14 shrink-0 rounded-md object-cover"
                  />
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
                    {kindLabel(post.kind ?? "feed")} · {statusLabel(post.status)} ·{" "}
                    {formatWhen(post.scheduledAt)}
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
