import { writeLocalAndSync } from "@/lib/synced-storage";

export const CREATIVE_ASSETS_KEY = "creative-assets-v2";

export type AssetKind =
  | "folder"
  | "image"
  | "pptx"
  | "txt"
  | "md"
  | "html"
  | "file";

export type AssetView = "list" | "gallery";

export type AssetSharing = "Public" | { avatars: number; extra?: number };

export type AssetItem = {
  id: string;
  name: string;
  kind: AssetKind;
  sizeLabel: string;
  modified: string;
  sharing: AssetSharing;
  children?: AssetItem[];
  quickAccess?: boolean;
  /** How this folder opens — gallery for creative/visual folders */
  view?: AssetView;
  /** Image preview (data URL or remote URL) */
  src?: string;
  /** Public Shopify Files CDN URL (set after auto-host upload) */
  shopifyUrl?: string;
  /** Brand store used for Shopify Files hosting */
  shopifyBrand?: string;
  shopifyFileId?: string;
};

function placeholderSvg(label: string, c1: string, c2: string): string {
  const safe = label.replace(/[<>&'"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/>
    </linearGradient></defs>
    <rect width="800" height="1000" fill="url(#g)"/>
    <text x="40" y="920" fill="white" font-family="system-ui,sans-serif" font-size="36" font-weight="600">${safe}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function sampleImage(
  id: string,
  name: string,
  label: string,
  c1: string,
  c2: string,
): AssetItem {
  return {
    id,
    name,
    kind: "image",
    sizeLabel: "1.2 MB",
    modified: todayLabel(),
    sharing: "Public",
    src: placeholderSvg(label, c1, c2),
  };
}

export const DEFAULT_CREATIVE_ASSETS: AssetItem[] = [
  {
    id: "studio-work",
    name: "Studio Work",
    kind: "folder",
    sizeLabel: "2.3 GB",
    modified: "Yesterday",
    sharing: { avatars: 3 },
    quickAccess: true,
    view: "gallery",
    children: [
      {
        id: "sw-lookbook",
        name: "Lookbook 2026",
        kind: "folder",
        sizeLabel: "840 MB",
        modified: "Yesterday",
        sharing: { avatars: 2 },
        view: "gallery",
        children: [
          sampleImage("sw-lb-1", "Look 01.jpg", "Look 01", "#1e293b", "#334155"),
          sampleImage("sw-lb-2", "Look 02.jpg", "Look 02", "#0f766e", "#115e59"),
          sampleImage("sw-lb-3", "Look 03.jpg", "Look 03", "#7c2d12", "#9a3412"),
          sampleImage("sw-lb-4", "Look 04.jpg", "Look 04", "#1e3a8a", "#3730a3"),
        ],
      },
      {
        id: "sw-product",
        name: "Product flats",
        kind: "folder",
        sizeLabel: "1.1 GB",
        modified: "Jul 18, 2026",
        sharing: "Public",
        view: "gallery",
        children: [
          sampleImage("sw-pf-1", "Tee flat.jpg", "Tee flat", "#f8fafc", "#cbd5e1"),
          sampleImage("sw-pf-2", "Hoodie flat.jpg", "Hoodie", "#e2e8f0", "#94a3b8"),
          sampleImage("sw-pf-3", "Denim flat.jpg", "Denim", "#1e40af", "#1d4ed8"),
        ],
      },
      sampleImage("sw-hero", "Studio hero.jpg", "Studio hero", "#111827", "#4b5563"),
      {
        id: "sw-notes",
        name: "Shoot notes.md",
        kind: "md",
        sizeLabel: "18 KB",
        modified: "Jul 20, 2026",
        sharing: "Public",
      },
    ],
  },
  {
    id: "source",
    name: "Source",
    kind: "folder",
    sizeLabel: "1.2 MB",
    modified: "Apr 10, 2022",
    sharing: { avatars: 2, extra: 4 },
    quickAccess: true,
    view: "list",
    children: [
      {
        id: "src-fonts",
        name: "Fonts",
        kind: "folder",
        sizeLabel: "4.5 MB",
        modified: "Apr 10, 2022",
        sharing: { avatars: 3 },
        view: "list",
      },
      {
        id: "src-ofl",
        name: "OFL.txt",
        kind: "txt",
        sizeLabel: "4 KB",
        modified: "Apr 10, 2022",
        sharing: "Public",
      },
    ],
  },
  {
    id: "brand-assets",
    name: "Brand Assets",
    kind: "folder",
    sizeLabel: "241 MB",
    modified: "Jul 12, 2026",
    sharing: { avatars: 4 },
    quickAccess: true,
    view: "gallery",
    children: [
      {
        id: "ba-sinners",
        name: "Sinners Testimony",
        kind: "folder",
        sizeLabel: "98 MB",
        modified: "Jul 12, 2026",
        sharing: { avatars: 2 },
        view: "gallery",
        children: [
          sampleImage("ba-st-1", "ST campaign 01.jpg", "ST 01", "#18181b", "#3f3f46"),
          sampleImage("ba-st-2", "ST campaign 02.jpg", "ST 02", "#450a0a", "#7f1d1d"),
          sampleImage("ba-st-3", "ST product.jpg", "ST product", "#27272a", "#52525b"),
        ],
      },
      {
        id: "ba-livdon",
        name: "Livdon",
        kind: "folder",
        sizeLabel: "112 MB",
        modified: "Jul 10, 2026",
        sharing: { avatars: 2 },
        view: "gallery",
        children: [
          sampleImage("ba-ld-1", "LD hero.jpg", "Livdon", "#fff1f2", "#fda4af"),
          sampleImage("ba-ld-2", "LD model.jpg", "LD model", "#fce7f3", "#f9a8d4"),
          sampleImage("ba-ld-3", "LD packshot.jpg", "LD pack", "#fafafa", "#e5e5e5"),
        ],
      },
      {
        id: "ba-logos",
        name: "Shared logos",
        kind: "folder",
        sizeLabel: "31 MB",
        modified: "Jun 2, 2026",
        sharing: "Public",
        view: "gallery",
        children: [
          sampleImage("ba-logo-1", "FGG mark.png", "FGG", "#2563eb", "#1d4ed8"),
          sampleImage("ba-logo-2", "Wordmark.png", "Wordmark", "#0f172a", "#334155"),
        ],
      },
    ],
  },
  {
    id: "pitch-deck",
    name: "Great Studios Pitch Deck.pptx",
    kind: "pptx",
    sizeLabel: "12.3 MB",
    modified: "Jul 8, 2026",
    sharing: { avatars: 3 },
    quickAccess: true,
  },
  {
    id: "docs",
    name: "Docs",
    kind: "folder",
    sizeLabel: "4.5 MB",
    modified: "Yesterday",
    sharing: { avatars: 3 },
    view: "list",
    children: [
      {
        id: "docs-readme",
        name: "Readme.md",
        kind: "md",
        sizeLabel: "14 KB",
        modified: "Yesterday",
        sharing: "Public",
      },
      {
        id: "docs-index",
        name: "index.html",
        kind: "html",
        sizeLabel: "21 KB",
        modified: "Jul 15, 2026",
        sharing: "Public",
      },
    ],
  },
  {
    id: "fonts",
    name: "Fonts",
    kind: "folder",
    sizeLabel: "12 MB",
    modified: "Apr 10, 2022",
    sharing: { avatars: 2, extra: 4 },
    view: "list",
  },
  {
    id: "example",
    name: "Example",
    kind: "folder",
    sizeLabel: "890 KB",
    modified: "Mar 3, 2022",
    sharing: { avatars: 1 },
    view: "gallery",
    children: [
      sampleImage("ex-1", "Example 01.jpg", "Example 01", "#312e81", "#4c1d95"),
      sampleImage("ex-2", "Example 02.jpg", "Example 02", "#164e63", "#0e7490"),
    ],
  },
  {
    id: "ofl",
    name: "OFL.txt",
    kind: "txt",
    sizeLabel: "4 KB",
    modified: "Apr 10, 2022",
    sharing: "Public",
  },
  {
    id: "readme",
    name: "Readme.md",
    kind: "md",
    sizeLabel: "14 KB",
    modified: "Yesterday",
    sharing: "Public",
  },
  {
    id: "index-html",
    name: "index.html",
    kind: "html",
    sizeLabel: "21 KB",
    modified: "Jul 1, 2026",
    sharing: "Public",
  },
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseSharing(v: unknown): AssetSharing {
  if (v === "Public") return "Public";
  if (isRecord(v) && typeof v.avatars === "number") {
    return {
      avatars: v.avatars,
      ...(typeof v.extra === "number" ? { extra: v.extra } : {}),
    };
  }
  return "Public";
}

function parseItem(v: unknown): AssetItem | null {
  if (!isRecord(v) || typeof v.id !== "string" || typeof v.name !== "string") return null;
  const kind = (typeof v.kind === "string" ? v.kind : "file") as AssetKind;
  const children = Array.isArray(v.children)
    ? v.children.map(parseItem).filter((x): x is AssetItem => x != null)
    : undefined;
  const view =
    v.view === "gallery" || v.view === "list" ? (v.view as AssetView) : undefined;
  return {
    id: v.id,
    name: v.name,
    kind,
    sizeLabel: typeof v.sizeLabel === "string" ? v.sizeLabel : "—",
    modified: typeof v.modified === "string" ? v.modified : "—",
    sharing: parseSharing(v.sharing),
    ...(children ? { children } : {}),
    ...(v.quickAccess === true ? { quickAccess: true } : {}),
    ...(view ? { view } : {}),
    ...(typeof v.src === "string" && v.src ? { src: v.src } : {}),
    ...(typeof v.shopifyUrl === "string" && v.shopifyUrl
      ? { shopifyUrl: v.shopifyUrl }
      : {}),
    ...(typeof v.shopifyBrand === "string" && v.shopifyBrand
      ? { shopifyBrand: v.shopifyBrand }
      : {}),
    ...(typeof v.shopifyFileId === "string" && v.shopifyFileId
      ? { shopifyFileId: v.shopifyFileId }
      : {}),
  };
}

function indexDefaults(list: AssetItem[], map: Map<string, AssetItem>) {
  for (const item of list) {
    map.set(item.id, item);
    if (item.children?.length) indexDefaults(item.children, map);
  }
}

/** Fill empty gallery folders from defaults so older saves still open galleries. */
function migrateGalleryDefaults(items: AssetItem[]): AssetItem[] {
  const defaults = new Map<string, AssetItem>();
  indexDefaults(DEFAULT_CREATIVE_ASSETS, defaults);

  const walk = (list: AssetItem[]): AssetItem[] =>
    list.map((item) => {
      const def = defaults.get(item.id);
      if (item.kind !== "folder") return item;

      let children = item.children ?? [];
      const hasVisual =
        children.some((c) => isImageItem(c) || c.kind === "folder");
      if (def?.children?.length && children.length === 0) {
        children = structuredClone(def.children);
      } else if (
        def?.children?.some(isImageItem) &&
        children.length > 0 &&
        !hasVisual &&
        (def.view === "gallery" || item.view === "gallery")
      ) {
        // Keep user files, append default sample images once
        const existingIds = new Set(children.map((c) => c.id));
        const extras = def.children.filter(
          (c) => isImageItem(c) && !existingIds.has(c.id),
        );
        children = [...children, ...structuredClone(extras)];
      }

      return {
        ...item,
        view: item.view ?? def?.view,
        children: walk(children),
      };
    });

  return walk(items);
}

export function loadCreativeAssets(): AssetItem[] {
  try {
    const raw =
      localStorage.getItem(CREATIVE_ASSETS_KEY) ??
      localStorage.getItem("creative-assets-v1");
    if (!raw) return structuredClone(DEFAULT_CREATIVE_ASSETS);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return structuredClone(DEFAULT_CREATIVE_ASSETS);
    const items = parsed.map(parseItem).filter((x): x is AssetItem => x != null);
    if (items.length === 0) return structuredClone(DEFAULT_CREATIVE_ASSETS);
    return migrateGalleryDefaults(items);
  } catch {
    return structuredClone(DEFAULT_CREATIVE_ASSETS);
  }
}

export function saveCreativeAssets(items: AssetItem[]): boolean {
  return writeLocalAndSync(CREATIVE_ASSETS_KEY, JSON.stringify(items));
}

export function newAssetId(): string {
  return `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function todayLabel(): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageItem(item: AssetItem): boolean {
  return item.kind === "image" || Boolean(item.src);
}

export function folderPrefersGallery(folder: AssetItem | null | undefined): boolean {
  if (!folder || folder.kind !== "folder") return false;
  if (folder.view === "gallery") return true;
  if (folder.view === "list") return false;
  const kids = folder.children ?? [];
  if (kids.length === 0) return true;
  const visual = kids.filter((k) => k.kind === "folder" || isImageItem(k)).length;
  return visual / kids.length >= 0.5;
}

/** Update items at a folder path (empty = root). */
export function mapFolderChildren(
  items: AssetItem[],
  folderId: string | null,
  mapper: (children: AssetItem[]) => AssetItem[],
): AssetItem[] {
  if (folderId == null) return mapper(items);

  const walk = (list: AssetItem[]): AssetItem[] =>
    list.map((item) => {
      if (item.id === folderId && item.kind === "folder") {
        return { ...item, children: mapper(item.children ?? []) };
      }
      if (item.children?.length) {
        return { ...item, children: walk(item.children) };
      }
      return item;
    });

  return walk(items);
}

export function findAsset(items: AssetItem[], id: string): AssetItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children) {
      const nested = findAsset(item.children, id);
      if (nested) return nested;
    }
  }
  return undefined;
}

/** Flat folder list for pickers (id + breadcrumb path). Root = id "". */
export function listAssetFolders(
  items: AssetItem[],
): Array<{ id: string; path: string }> {
  const out: Array<{ id: string; path: string }> = [
    { id: "", path: "Creative Assets (root)" },
  ];
  const walk = (list: AssetItem[], prefix: string) => {
    for (const item of list) {
      if (item.kind !== "folder") continue;
      const path = prefix ? `${prefix} / ${item.name}` : item.name;
      out.push({ id: item.id, path });
      if (item.children?.length) walk(item.children, path);
    }
  };
  walk(items, "");
  return out;
}

/** True if `maybeDescendantId` is the folder or nested inside it. */
export function isFolderOrDescendant(
  items: AssetItem[],
  folderId: string,
  maybeDescendantId: string,
): boolean {
  if (folderId === maybeDescendantId) return true;
  const folder = findAsset(items, folderId);
  if (!folder || folder.kind !== "folder" || !folder.children?.length) return false;
  const stack = [...folder.children];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.id === maybeDescendantId) return true;
    if (node.children?.length) stack.push(...node.children);
  }
  return false;
}

/**
 * Move one or more assets into `targetFolderId` (null / "" = root).
 * Removes them from their current parent and prepends into the destination.
 * Folders cannot be moved into themselves or their descendants.
 */
export function moveAssetsToFolder(
  items: AssetItem[],
  assetIds: string[],
  targetFolderId: string | null,
): AssetItem[] {
  const ids = [...new Set(assetIds.filter(Boolean))];
  if (!ids.length) return items;

  const destId =
    targetFolderId && targetFolderId.trim() ? targetFolderId.trim() : null;

  for (const id of ids) {
    const asset = findAsset(items, id);
    if (!asset) continue;
    if (asset.kind === "folder" && destId) {
      if (isFolderOrDescendant(items, id, destId)) {
        throw new Error("Can’t move a folder into itself or a subfolder");
      }
    }
    if (destId && id === destId) {
      throw new Error("Can’t move a folder into itself");
    }
  }

  const idSet = new Set(ids);
  const extracted: AssetItem[] = [];

  const extract = (list: AssetItem[]): AssetItem[] => {
    const kept: AssetItem[] = [];
    for (const item of list) {
      if (idSet.has(item.id)) {
        extracted.push(item);
        continue;
      }
      if (item.children?.length) {
        kept.push({ ...item, children: extract(item.children) });
      } else {
        kept.push(item);
      }
    }
    return kept;
  };

  let next = extract(items);
  if (!extracted.length) return items;

  // Preserve selection order when possible
  const byId = new Map(extracted.map((a) => [a.id, a]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as AssetItem[];
  const moved = ordered.length ? ordered : extracted;

  if (destId == null) {
    return [...moved, ...next];
  }

  const dest = findAsset(next, destId);
  if (!dest || dest.kind !== "folder") {
    throw new Error("Destination folder not found");
  }

  return mapFolderChildren(next, destId, (children) => [...moved, ...children]);
}

export function renameAsset(items: AssetItem[], id: string, name: string): AssetItem[] {
  const nextName = name.trim();
  if (!nextName) return items;

  const walk = (list: AssetItem[]): AssetItem[] =>
    list.map((item) => {
      if (item.id === id) return { ...item, name: nextName, modified: todayLabel() };
      if (item.children?.length) return { ...item, children: walk(item.children) };
      return item;
    });

  return walk(items);
}

export function deleteAsset(items: AssetItem[], id: string): AssetItem[] {
  const walk = (list: AssetItem[]): AssetItem[] =>
    list
      .filter((item) => item.id !== id)
      .map((item) =>
        item.children?.length ? { ...item, children: walk(item.children) } : item,
      );
  return walk(items);
}

export function deleteAssets(items: AssetItem[], ids: string[]): AssetItem[] {
  const idSet = new Set(ids);
  if (idSet.size === 0) return items;
  const walk = (list: AssetItem[]): AssetItem[] =>
    list
      .filter((item) => !idSet.has(item.id))
      .map((item) =>
        item.children?.length ? { ...item, children: walk(item.children) } : item,
      );
  return walk(items);
}

export function setQuickAccessMany(
  items: AssetItem[],
  ids: string[],
  enabled: boolean,
): AssetItem[] {
  const idSet = new Set(ids);
  if (idSet.size === 0) return items;
  const walk = (list: AssetItem[]): AssetItem[] =>
    list.map((item) => {
      let next = item;
      if (idSet.has(item.id)) {
        if (enabled) {
          next = { ...item, quickAccess: true };
        } else if (item.quickAccess) {
          const { quickAccess: _qa, ...rest } = item;
          next = rest;
        }
      }
      if (next.children?.length) {
        return { ...next, children: walk(next.children) };
      }
      return next;
    });
  return walk(items);
}

export function reorderInFolder(
  items: AssetItem[],
  folderId: string | null,
  fromIndex: number,
  toIndex: number,
): AssetItem[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return items;
  return mapFolderChildren(items, folderId, (children) => {
    if (fromIndex >= children.length || toIndex >= children.length) return children;
    const next = [...children];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  });
}

export function moveAsset(
  items: AssetItem[],
  folderId: string | null,
  id: string,
  direction: "up" | "down",
): AssetItem[] {
  return mapFolderChildren(items, folderId, (children) => {
    const index = children.findIndex((c) => c.id === id);
    if (index < 0) return children;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= children.length) return children;
    const next = [...children];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
}

export function toggleQuickAccess(items: AssetItem[], id: string): AssetItem[] {
  const walk = (list: AssetItem[]): AssetItem[] =>
    list.map((item) => {
      if (item.id === id) {
        if (item.quickAccess) {
          const { quickAccess: _qa, ...rest } = item;
          return rest;
        }
        return { ...item, quickAccess: true };
      }
      if (item.children?.length) return { ...item, children: walk(item.children) };
      return item;
    });
  return walk(items);
}

export function addFolder(
  items: AssetItem[],
  folderId: string | null,
  name: string,
  view: AssetView = "gallery",
): AssetItem[] {
  const folder: AssetItem = {
    id: newAssetId(),
    name: name.trim() || "Untitled folder",
    kind: "folder",
    sizeLabel: "0 KB",
    modified: todayLabel(),
    sharing: "Public",
    view,
    children: [],
  };
  return mapFolderChildren(items, folderId, (children) => [folder, ...children]);
}

export function addImages(
  items: AssetItem[],
  folderId: string | null,
  images: Array<{ name: string; src: string; sizeLabel: string }>,
): { items: AssetItem[]; added: AssetItem[] } {
  const added: AssetItem[] = images.map((img) => ({
    id: newAssetId(),
    name: img.name,
    kind: "image" as const,
    sizeLabel: img.sizeLabel,
    modified: todayLabel(),
    sharing: "Public" as const,
    src: img.src,
  }));
  return {
    items: mapFolderChildren(items, folderId, (children) => [
      ...added,
      ...children,
    ]),
    added,
  };
}

/** Patch fields on an asset by id (deep). */
export function patchAsset(
  items: AssetItem[],
  id: string,
  patch: Partial<
    Pick<
      AssetItem,
      "name" | "src" | "shopifyUrl" | "shopifyBrand" | "shopifyFileId" | "modified"
    >
  >,
): AssetItem[] {
  const walk = (list: AssetItem[]): AssetItem[] =>
    list.map((item) => {
      if (item.id === id) return { ...item, ...patch };
      if (item.children?.length) {
        return { ...item, children: walk(item.children) };
      }
      return item;
    });
  return walk(items);
}

/** Prefer Shopify CDN for publish; fall back to local/preview src. */
export function assetPublishUrl(asset: AssetItem | undefined): string | undefined {
  if (!asset) return undefined;
  if (asset.shopifyUrl && /^https:\/\//i.test(asset.shopifyUrl)) {
    return asset.shopifyUrl;
  }
  if (asset.src && /^https:\/\//i.test(asset.src)) return asset.src;
  return asset.src;
}

export function setFolderView(
  items: AssetItem[],
  folderId: string,
  view: AssetView,
): AssetItem[] {
  const walk = (list: AssetItem[]): AssetItem[] =>
    list.map((item) => {
      if (item.id === folderId && item.kind === "folder") {
        return { ...item, view };
      }
      if (item.children?.length) return { ...item, children: walk(item.children) };
      return item;
    });
  return walk(items);
}
