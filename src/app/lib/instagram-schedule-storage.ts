import { writeLocalAndSync } from "@/lib/synced-storage";

export const INSTAGRAM_SCHEDULE_KEY = "fgg.instagram-schedule.v1";

export const IG_SCHEDULE_BRANDS = ["live-don", "sinners-testimony"] as const;
export type IgScheduleBrand = (typeof IG_SCHEDULE_BRANDS)[number];

export const IG_BRAND_LABELS: Record<IgScheduleBrand, string> = {
  "live-don": "Livdon",
  "sinners-testimony": "Sinners Testimony",
};

export type IgPostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "posted"
  | "failed";

export type IgPostKind = "feed" | "story";

export type IgScheduledPost = {
  id: string;
  brand: IgScheduleBrand;
  kind: IgPostKind;
  caption: string;
  /** Creative asset id when picked from Studio */
  assetId?: string;
  assetName?: string;
  /** Preview / publish source — https URL preferred for auto-publish */
  imageSrc?: string;
  /** Carousel slides (2–10). Cover is imageSrc / imageSrcs[0]. */
  imageSrcs?: string[];
  /** ISO datetime local schedule */
  scheduledAt: string;
  status: IgPostStatus;
  createdAt: string;
  updatedAt: string;
  postedAt?: string;
  lastError?: string;
  mediaId?: string;
};

export type IgScheduleStore = {
  version: 1;
  posts: IgScheduledPost[];
};

function emptyStore(): IgScheduleStore {
  return { version: 1, posts: [] };
}

function isBrand(value: unknown): value is IgScheduleBrand {
  return (
    typeof value === "string" &&
    (IG_SCHEDULE_BRANDS as readonly string[]).includes(value)
  );
}

function parsePost(raw: unknown): IgScheduledPost | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id.trim()) return null;
  if (!isBrand(o.brand)) return null;
  if (typeof o.caption !== "string") return null;
  if (typeof o.scheduledAt !== "string" || !o.scheduledAt) return null;
  const status = o.status;
  if (
    status !== "draft" &&
    status !== "scheduled" &&
    status !== "publishing" &&
    status !== "posted" &&
    status !== "failed"
  ) {
    return null;
  }
  const kind: IgPostKind = o.kind === "story" ? "story" : "feed";
  const createdAt =
    typeof o.createdAt === "string" && o.createdAt
      ? o.createdAt
      : new Date().toISOString();
  const updatedAt =
    typeof o.updatedAt === "string" && o.updatedAt ? o.updatedAt : createdAt;
  return {
    id: o.id.trim(),
    brand: o.brand,
    kind,
    caption: o.caption,
    assetId: typeof o.assetId === "string" ? o.assetId : undefined,
    assetName: typeof o.assetName === "string" ? o.assetName : undefined,
    imageSrc: typeof o.imageSrc === "string" ? o.imageSrc : undefined,
    imageSrcs: (() => {
      if (Array.isArray(o.imageSrcs)) {
        const srcs = o.imageSrcs
          .filter((u): u is string => typeof u === "string" && Boolean(u.trim()))
          .map((u) => u.trim());
        if (srcs.length) return srcs;
      }
      if (typeof o.imageSrc === "string" && o.imageSrc.trim()) {
        return [o.imageSrc.trim()];
      }
      return undefined;
    })(),
    scheduledAt: o.scheduledAt,
    status,
    createdAt,
    updatedAt,
    postedAt: typeof o.postedAt === "string" ? o.postedAt : undefined,
    lastError: typeof o.lastError === "string" ? o.lastError : undefined,
    mediaId: typeof o.mediaId === "string" ? o.mediaId : undefined,
  };
}

export function parseIgScheduleStore(raw: unknown): IgScheduleStore {
  if (!raw || typeof raw !== "object") return emptyStore();
  const postsRaw = (raw as { posts?: unknown }).posts;
  if (!Array.isArray(postsRaw)) return emptyStore();
  return {
    version: 1,
    posts: postsRaw.map(parsePost).filter((p): p is IgScheduledPost => p != null),
  };
}

function statusRank(status: IgPostStatus): number {
  switch (status) {
    case "posted":
      return 5;
    case "failed":
      return 4;
    case "publishing":
      return 3;
    case "scheduled":
      return 2;
    case "draft":
      return 1;
  }
}

/** Merge local + remote queues; newer updatedAt wins, ties prefer terminal status. */
export function mergeIgPosts(
  left: IgScheduledPost[],
  right: IgScheduledPost[],
): IgScheduledPost[] {
  const byId = new Map<string, IgScheduledPost>();
  for (const post of [...left, ...right]) {
    const existing = byId.get(post.id);
    if (!existing) {
      byId.set(post.id, post);
      continue;
    }
    if (post.updatedAt > existing.updatedAt) {
      byId.set(post.id, post);
    } else if (
      post.updatedAt === existing.updatedAt &&
      statusRank(post.status) > statusRank(existing.status)
    ) {
      byId.set(post.id, post);
    }
  }
  return [...byId.values()];
}

export function applyRemoteIgSchedule(store: IgScheduleStore): IgScheduleStore {
  const local = loadIgSchedule();
  const merged: IgScheduleStore = {
    version: 1,
    posts: mergeIgPosts(local.posts, store.posts),
  };
  saveIgSchedule(merged);
  return merged;
}

export function loadIgSchedule(): IgScheduleStore {
  try {
    const raw = localStorage.getItem(INSTAGRAM_SCHEDULE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return emptyStore();
    const postsRaw = (parsed as { posts?: unknown }).posts;
    if (!Array.isArray(postsRaw)) return emptyStore();
    return {
      version: 1,
      posts: postsRaw.map(parsePost).filter((p): p is IgScheduledPost => p != null),
    };
  } catch {
    return emptyStore();
  }
}

export function saveIgSchedule(store: IgScheduleStore): boolean {
  return writeLocalAndSync(
    INSTAGRAM_SCHEDULE_KEY,
    JSON.stringify({ version: 1, posts: store.posts }),
  );
}

export function newIgPostId(): string {
  return `ig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function upsertIgPost(post: IgScheduledPost): IgScheduleStore {
  const store = loadIgSchedule();
  const idx = store.posts.findIndex((p) => p.id === post.id);
  const next = { ...post, updatedAt: new Date().toISOString() };
  if (idx >= 0) store.posts[idx] = next;
  else store.posts.unshift(next);
  saveIgSchedule(store);
  return store;
}

export function deleteIgPost(id: string): IgScheduleStore {
  const store = loadIgSchedule();
  store.posts = store.posts.filter((p) => p.id !== id);
  saveIgSchedule(store);
  return store;
}

export function sortIgPosts(posts: IgScheduledPost[]): IgScheduledPost[] {
  return [...posts].sort((a, b) => {
    const queueRank = (s: IgPostStatus) =>
      s === "failed"
        ? 0
        : s === "scheduled" || s === "draft" || s === "publishing"
          ? 1
          : 2;
    const r = queueRank(a.status) - queueRank(b.status);
    if (r) return r;
    return a.scheduledAt.localeCompare(b.scheduledAt);
  });
}

export function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

export function defaultScheduleAt(): string {
  const d = new Date();
  d.setHours(d.getHours() + 2, 0, 0, 0);
  return d.toISOString();
}

export const IG_CAROUSEL_MAX = 10;

/** Ordered publish URLs for a post (carousel or single). */
export function postImageUrls(post: Pick<IgScheduledPost, "imageSrc" | "imageSrcs">): string[] {
  const fromList = (post.imageSrcs || [])
    .map((u) => u.trim())
    .filter(Boolean);
  if (fromList.length) return fromList.slice(0, IG_CAROUSEL_MAX);
  const single = post.imageSrc?.trim();
  return single ? [single] : [];
}

export function postCoverSrc(
  post: Pick<IgScheduledPost, "imageSrc" | "imageSrcs">,
): string | undefined {
  return postImageUrls(post)[0];
}

/** Feed posts for the IG profile grid (stories excluded). Newest / latest first. */
export function feedLayoutPosts(
  posts: IgScheduledPost[],
  brand: IgScheduleBrand,
): IgScheduledPost[] {
  return posts
    .filter(
      (p) =>
        p.brand === brand &&
        (p.kind ?? "feed") === "feed" &&
        Boolean(postCoverSrc(p)),
    )
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
}

const FEED_REORDER_STEP_MS = 60 * 60 * 1000;

/**
 * Apply a new visual feed order (index 0 = top-left = newest).
 * Rewrites `scheduledAt` in 1h steps so order persists.
 */
export function applyFeedLayoutOrder(
  orderedPosts: IgScheduledPost[],
): IgScheduledPost[] {
  if (orderedPosts.length === 0) return [];
  const now = Date.now();
  const times = orderedPosts
    .map((p) => new Date(p.scheduledAt).getTime())
    .filter((t) => !Number.isNaN(t));
  const existingMax = times.length ? Math.max(...times) : 0;
  const top = Math.max(
    existingMax,
    now + orderedPosts.length * FEED_REORDER_STEP_MS,
  );
  const updatedAt = new Date().toISOString();
  return orderedPosts.map((post, i) => ({
    ...post,
    scheduledAt: new Date(top - i * FEED_REORDER_STEP_MS).toISOString(),
    updatedAt,
  }));
}

/** Upsert many posts in one local write. */
export function upsertIgPosts(posts: IgScheduledPost[]): IgScheduleStore {
  const store = loadIgSchedule();
  const updatedAt = new Date().toISOString();
  for (const post of posts) {
    const next = { ...post, updatedAt };
    const idx = store.posts.findIndex((p) => p.id === next.id);
    if (idx >= 0) store.posts[idx] = next;
    else store.posts.unshift(next);
  }
  saveIgSchedule(store);
  return store;
}

export function moveFeedLayoutItem(
  ordered: IgScheduledPost[],
  fromIndex: number,
  toIndex: number,
): IgScheduledPost[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= ordered.length ||
    toIndex >= ordered.length
  ) {
    return ordered;
  }
  const next = [...ordered];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return applyFeedLayoutOrder(next);
}
