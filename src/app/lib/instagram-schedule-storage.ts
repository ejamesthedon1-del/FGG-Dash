import { writeLocalAndSync } from "@/lib/synced-storage";

export const INSTAGRAM_SCHEDULE_KEY = "fgg.instagram-schedule.v1";

export const IG_SCHEDULE_BRANDS = ["live-don", "sinners-testimony"] as const;
export type IgScheduleBrand = (typeof IG_SCHEDULE_BRANDS)[number];

export const IG_BRAND_LABELS: Record<IgScheduleBrand, string> = {
  "live-don": "Livdon",
  "sinners-testimony": "Sinners Testimony",
};

export type IgPostStatus = "draft" | "scheduled" | "posted" | "failed";

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
  /** ISO datetime local schedule */
  scheduledAt: string;
  status: IgPostStatus;
  createdAt: string;
  updatedAt: string;
  postedAt?: string;
  lastError?: string;
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
    scheduledAt: o.scheduledAt,
    status,
    createdAt,
    updatedAt,
    postedAt: typeof o.postedAt === "string" ? o.postedAt : undefined,
    lastError: typeof o.lastError === "string" ? o.lastError : undefined,
  };
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
    const statusRank = (s: IgPostStatus) =>
      s === "failed" ? 0 : s === "scheduled" || s === "draft" ? 1 : 2;
    const r = statusRank(a.status) - statusRank(b.status);
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
