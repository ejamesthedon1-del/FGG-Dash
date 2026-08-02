"use client";

import * as React from "react";
import { ImageIcon } from "lucide-react";

import {
  feedLayoutPosts,
  moveFeedLayoutItem,
  postCoverSrc,
  postImageUrls,
  type IgPostStatus,
  type IgScheduleBrand,
  type IgScheduledPost,
} from "../lib/instagram-schedule-storage";
import { cn } from "./ui/utils";

const MIN_SLOTS = 9;

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

  const slotCount = Math.max(MIN_SLOTS, Math.ceil(layout.length / 3) * 3);

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
                onClick={() => onFocusPost?.(post.id)}
                title={`${formatWhenShort(post.scheduledAt)} · ${statusBadge(post.status)}`}
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
          Drag to plan order · Stories excluded
        </p>
      </div>
    </section>
  );
}
