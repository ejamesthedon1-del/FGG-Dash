import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Code2,
  FileText,
  FolderPlus,
  GripVertical,
  ImagePlus,
  LayoutGrid,
  List,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { FolderIcon } from "./icons/FolderIcon";
import { MockupsSectionNav } from "./MockupsSectionNav";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "./ui/utils";
import { Checkbox } from "./ui/checkbox";
import {
  type AssetItem,
  type AssetKind,
  addFolder,
  addImages,
  deleteAsset,
  deleteAssets,
  findAsset,
  folderPrefersGallery,
  formatBytes,
  isImageItem,
  loadCreativeAssets,
  moveAsset,
  renameAsset,
  reorderInFolder,
  saveCreativeAssets,
  setFolderView,
  setQuickAccessMany,
  toggleQuickAccess,
} from "../lib/creative-assets-storage";

function FileTypeIcon({ kind }: { kind: AssetKind }) {
  if (kind === "folder") return <FolderIcon size="sm" />;
  if (kind === "image") {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
        <ImagePlus className="h-4 w-4" />
      </div>
    );
  }
  if (kind === "pptx") {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-500 text-[10px] font-bold text-white">
        P
      </div>
    );
  }
  if (kind === "txt") {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-100 text-sky-700">
        <FileText className="h-4 w-4" />
      </div>
    );
  }
  if (kind === "md") {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 text-gray-600">
        <FileText className="h-4 w-4" />
      </div>
    );
  }
  if (kind === "html") {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-100 text-violet-700">
        <Code2 className="h-4 w-4" />
      </div>
    );
  }
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 text-gray-500">
      <FileText className="h-4 w-4" />
    </div>
  );
}

function SharingCell({ sharing }: { sharing: AssetItem["sharing"] }) {
  if (sharing === "Public") {
    return <span className="text-sm text-gray-500">Public</span>;
  }
  const colors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-violet-500"];
  const count = Math.min(sharing.avatars, 4);
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {Array.from({ length: count }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-white",
              colors[i % colors.length],
            )}
          >
            {String.fromCharCode(65 + i)}
          </span>
        ))}
      </div>
      {sharing.extra ? (
        <span className="ml-1.5 text-xs font-medium text-gray-500">+{sharing.extra}</span>
      ) : null}
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function CreativeAssetsPage() {
  const [tree, setTree] = useState<AssetItem[]>(() => loadCreativeAssets());
  const [path, setPath] = useState<{ id: string; name: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [renameTarget, setRenameTarget] = useState<AssetItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AssetItem | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [viewOverride, setViewOverride] = useState<"list" | "gallery" | null>(null);
  const [lightbox, setLightbox] = useState<AssetItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const persist = useCallback((next: AssetItem[]) => {
    setTree(next);
    saveCreativeAssets(next);
  }, []);

  useEffect(() => {
    const refresh = () => setTree(loadCreativeAssets());
    window.addEventListener("fgg-storage-sync", refresh);
    return () => window.removeEventListener("fgg-storage-sync", refresh);
  }, []);

  const currentFolderId = path.length ? path[path.length - 1].id : null;
  const currentFolder = currentFolderId ? findAsset(tree, currentFolderId) : null;

  const items = useMemo(() => {
    if (!currentFolderId) return tree;
    return findAsset(tree, currentFolderId)?.children ?? [];
  }, [tree, currentFolderId]);

  const quickAccess = useMemo(() => tree.filter((item) => item.quickAccess), [tree]);

  const showGallery =
    currentFolderId != null &&
    (viewOverride ?? (folderPrefersGallery(currentFolder) ? "gallery" : "list")) ===
      "gallery";

  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    items.length > 0 && items.every((item) => selectedIds.has(item.id));
  const someVisibleSelected =
    items.some((item) => selectedIds.has(item.id)) && !allVisibleSelected;

  useEffect(() => {
    setPath((prev) =>
      prev.map((crumb) => {
        const found = findAsset(tree, crumb.id);
        return found ? { ...crumb, name: found.name } : crumb;
      }),
    );
  }, [tree]);

  useEffect(() => {
    setSelectedIds(new Set());
    setLastClickedIndex(null);
    setViewOverride(null);
    setLightbox(null);
  }, [currentFolderId]);

  const clearSelection = () => {
    setSelectedIds(new Set());
    setLastClickedIndex(null);
  };

  const toggleSelectId = (
    id: string,
    index: number,
    opts?: { range?: boolean; additive?: boolean },
  ) => {
    setSelectedIds((prev) => {
      if (opts?.range && lastClickedIndex != null) {
        const next = new Set(prev);
        const start = Math.min(lastClickedIndex, index);
        const end = Math.max(lastClickedIndex, index);
        for (let i = start; i <= end; i += 1) next.add(items[i].id);
        return next;
      }
      if (opts?.additive) {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      if (prev.size === 1 && prev.has(id)) return new Set();
      return new Set([id]);
    });
    if (!opts?.range) setLastClickedIndex(index);
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      clearSelection();
      return;
    }
    setSelectedIds(new Set(items.map((item) => item.id)));
    setLastClickedIndex(items.length ? items.length - 1 : null);
  };

  const openFolder = (item: AssetItem) => {
    if (item.kind !== "folder") return;
    clearSelection();
    setPath((prev) => [...prev, { id: item.id, name: item.name }]);
  };

  const goHome = () => {
    setPath([]);
    clearSelection();
  };

  const goBack = () => {
    setPath((prev) => prev.slice(0, -1));
    clearSelection();
  };

  const goToCrumb = (index: number) => {
    if (index < 0) {
      goHome();
      return;
    }
    setPath((prev) => prev.slice(0, index + 1));
    clearSelection();
  };

  const commitRename = () => {
    if (!renameTarget) return;
    persist(renameAsset(tree, renameTarget.id, renameValue));
    setRenameTarget(null);
    setRenameValue("");
  };

  const commitDelete = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    persist(deleteAsset(tree, id));
    setPath((prev) => {
      const cut = prev.findIndex((c) => c.id === id);
      return cut >= 0 ? prev.slice(0, cut) : prev.filter((c) => c.id !== id);
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (lightbox?.id === id) setLightbox(null);
    setDeleteTarget(null);
  };

  const commitBulkDelete = () => {
    const ids = [...selectedIds];
    persist(deleteAssets(tree, ids));
    setPath((prev) => prev.filter((c) => !selectedIds.has(c.id)));
    if (lightbox && selectedIds.has(lightbox.id)) setLightbox(null);
    clearSelection();
    setBulkDeleteOpen(false);
  };

  const commitAdd = () => {
    persist(addFolder(tree, currentFolderId, addName, currentFolderId ? "gallery" : "gallery"));
    setAddOpen(false);
    setAddName("");
  };

  const onDropRow = (toIndex: number) => {
    if (dragIndex == null || dragIndex === toIndex) {
      setDragIndex(null);
      return;
    }
    persist(reorderInFolder(tree, currentFolderId, dragIndex, toIndex));
    setDragIndex(null);
  };

  const handleUploadImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const imageFiles = [...files].filter((f) => f.type.startsWith("image/"));
    if (!imageFiles.length) return;

    const prepared: Array<{ name: string; src: string; sizeLabel: string }> = [];
    for (const file of imageFiles) {
      // Keep uploads modest for localStorage
      if (file.size > 2.5 * 1024 * 1024) continue;
      const src = await readFileAsDataUrl(file);
      prepared.push({
        name: file.name,
        src,
        sizeLabel: formatBytes(file.size),
      });
    }
    if (!prepared.length) return;
    persist(addImages(tree, currentFolderId, prepared));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const itemMenu = (item: AssetItem, index: number) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-lg p-1.5 text-gray-400 hover:bg-white/90 hover:text-gray-700"
          aria-label={`Options for ${item.name}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {item.kind === "folder" ? (
          <DropdownMenuItem onClick={() => openFolder(item)}>Open</DropdownMenuItem>
        ) : null}
        {isImageItem(item) ? (
          <DropdownMenuItem onClick={() => setLightbox(item)}>Preview</DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onClick={() => {
            setRenameTarget(item);
            setRenameValue(item.name);
          }}
        >
          <Pencil className="mr-2 h-4 w-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={index === 0}
          onClick={() => persist(moveAsset(tree, currentFolderId, item.id, "up"))}
        >
          <ArrowUp className="mr-2 h-4 w-4" />
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={index >= items.length - 1}
          onClick={() => persist(moveAsset(tree, currentFolderId, item.id, "down"))}
        >
          <ArrowDown className="mr-2 h-4 w-4" />
          Move down
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => persist(toggleQuickAccess(tree, item.id))}>
          <Star className="mr-2 h-4 w-4" />
          {item.quickAccess ? "Remove from Quick Access" : "Add to Quick Access"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-600 focus:text-red-600"
          onClick={() => setDeleteTarget(item)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const onItemActivate = (item: AssetItem, index: number, e: ReactMouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      toggleSelectId(item.id, index, {
        additive: e.metaKey || e.ctrlKey,
        range: e.shiftKey,
      });
      return;
    }
    if (item.kind === "folder") {
      openFolder(item);
      return;
    }
    if (isImageItem(item)) {
      setLightbox(item);
      return;
    }
    toggleSelectId(item.id, index);
  };

  const atHome = path.length === 0;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold text-gray-900">Mockups</h2>
        <MockupsSectionNav active="creative-assets" />
      </div>

      {atHome ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900">Quick Access</h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Quick access options"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setAddName("");
                    setAddOpen(true);
                  }}
                >
                  <FolderPlus className="mr-2 h-4 w-4" />
                  New folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {quickAccess.length === 0 ? (
            <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-gray-500 shadow-sm">
              No quick access items. Use the ⋮ menu on a file or folder to pin one.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {quickAccess.map((item) => (
                <div
                  key={item.id}
                  className="group relative rounded-2xl border-0 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (item.kind === "folder") openFolder(item);
                      else if (isImageItem(item)) setLightbox(item);
                    }}
                    className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <div className="mb-3">
                      {item.kind === "folder" ? (
                        <FolderIcon size="lg" />
                      ) : isImageItem(item) && item.src ? (
                        <img
                          src={item.src}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        <FileTypeIcon kind={item.kind} />
                      )}
                    </div>
                    <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {item.sizeLabel}
                      {item.kind === "folder"
                        ? ` · ${(item.children ?? []).length} item${(item.children ?? []).length === 1 ? "" : "s"}`
                        : ""}
                      {item.kind === "folder" && folderPrefersGallery(item)
                        ? " · Gallery"
                        : ""}
                    </p>
                  </button>
                  <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                    {itemMenu(item, tree.findIndex((t) => t.id === item.id))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {path.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={path.length === 1 ? goHome : goBack}
              >
                <ArrowLeft className="h-4 w-4" />
                {path.length === 1 ? "Back to Home" : "Back"}
              </Button>
            ) : null}
            <nav className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm" aria-label="Breadcrumb">
              <button
                type="button"
                onClick={goHome}
                className={cn(
                  "rounded px-0.5 transition-colors",
                  path.length === 0
                    ? "font-semibold text-gray-900"
                    : "text-gray-500 hover:text-gray-800",
                )}
              >
                Home
              </button>
              {path.map((crumb, index) => (
                <span key={crumb.id} className="flex items-center gap-1.5">
                  <span className="text-gray-300">›</span>
                  <button
                    type="button"
                    onClick={() => goToCrumb(index)}
                    className={cn(
                      "truncate rounded px-0.5 transition-colors",
                      index === path.length - 1
                        ? "font-semibold text-gray-900"
                        : "text-gray-500 hover:text-gray-800",
                    )}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {currentFolderId ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="h-4 w-4" />
                  Upload
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => void handleUploadImages(e.target.files)}
                />
                <button
                  type="button"
                  className={cn(
                    "rounded-lg p-2 transition-colors",
                    showGallery
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-400 hover:bg-gray-50 hover:text-gray-600",
                  )}
                  aria-label="Gallery view"
                  onClick={() => {
                    setViewOverride("gallery");
                    if (currentFolderId) {
                      persist(setFolderView(tree, currentFolderId, "gallery"));
                    }
                  }}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-lg p-2 transition-colors",
                    !showGallery
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-400 hover:bg-gray-50 hover:text-gray-600",
                  )}
                  aria-label="List view"
                  onClick={() => {
                    setViewOverride("list");
                    if (currentFolderId) {
                      persist(setFolderView(tree, currentFolderId, "list"));
                    }
                  }}
                >
                  <List className="h-4 w-4" />
                </button>
              </>
            ) : null}
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setAddName("");
                setAddOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add New
            </Button>
          </div>
        </div>

        {selectedCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2.5 sm:px-6">
            <span className="text-sm font-medium text-blue-900">{selectedCount} selected</span>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-blue-200 bg-white"
              onClick={() => persist(setQuickAccessMany(tree, [...selectedIds], true))}
            >
              <Star className="mr-1.5 h-3.5 w-3.5" />
              Quick Access
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-blue-200 bg-white text-red-600 hover:text-red-700"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-blue-800" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        ) : null}

        {showGallery ? (
          <div className="p-4 sm:p-6">
            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 px-6 py-16 text-center">
                <p className="text-sm font-medium text-gray-900">This gallery is empty</p>
                <p className="mt-1 text-sm text-gray-500">Upload images or add a subfolder.</p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="h-4 w-4" />
                    Upload images
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setAddName("");
                      setAddOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    New folder
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <Checkbox
                    checked={
                      allVisibleSelected
                        ? true
                        : someVisibleSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={() => toggleSelectAllVisible()}
                    aria-label="Select all"
                  />
                  <span className="text-xs text-gray-500">
                    Click a folder to open · click an image to preview · checkbox / ⌘-click to multi-select
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {items.map((item, index) => {
                    const selected = selectedIds.has(item.id);
                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={() => setDragIndex(index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => onDropRow(index)}
                        onDragEnd={() => setDragIndex(null)}
                        className={cn(
                          "group relative overflow-hidden rounded-xl bg-gray-50 shadow-sm ring-1 ring-black/5 transition",
                          selected && "ring-2 ring-blue-500",
                          dragIndex === index && "opacity-50",
                        )}
                      >
                        <div className="absolute left-2 top-2 z-10 flex items-center gap-1">
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() =>
                              toggleSelectId(item.id, index, { additive: true })
                            }
                            aria-label={`Select ${item.name}`}
                            className="border-white bg-white/90 shadow"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="absolute right-1 top-1 z-10 opacity-0 transition-opacity group-hover:opacity-100">
                          {itemMenu(item, index)}
                        </div>
                        <button
                          type="button"
                          className="block w-full text-left"
                          onClick={(e) => onItemActivate(item, index, e)}
                        >
                          <div className="aspect-[4/5] w-full overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200">
                            {item.kind === "folder" ? (
                              <div className="flex h-full flex-col items-center justify-center gap-2">
                                <FolderIcon size="lg" />
                                <span className="text-xs text-gray-500">
                                  {(item.children ?? []).length} items
                                </span>
                              </div>
                            ) : isImageItem(item) && item.src ? (
                              <img
                                src={item.src}
                                alt={item.name}
                                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center">
                                <FileTypeIcon kind={item.kind} />
                              </div>
                            )}
                          </div>
                          <div className="space-y-0.5 px-3 py-2.5">
                            <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                            <p className="truncate text-xs text-gray-500">{item.sizeLabel}</p>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-medium text-gray-400">
                  <th className="w-10 px-3 py-3">
                    <Checkbox
                      checked={
                        allVisibleSelected
                          ? true
                          : someVisibleSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={() => toggleSelectAllVisible()}
                      aria-label="Select all"
                      disabled={items.length === 0}
                    />
                  </th>
                  <th className="w-10 px-2 py-3" />
                  <th className="px-2 py-3 font-medium sm:px-4">Name</th>
                  <th className="px-4 py-3 font-medium">Sharing</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Modified</th>
                  <th className="w-12 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const selected = selectedIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      draggable={!selectedCount || selectedCount === 1}
                      onDragStart={() => setDragIndex(index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDropRow(index)}
                      onDragEnd={() => setDragIndex(null)}
                      onClick={(e) => onItemActivate(item, index, e)}
                      className={cn(
                        "cursor-pointer border-b border-gray-50 transition-colors last:border-0",
                        selected ? "bg-blue-50/80" : "hover:bg-gray-50",
                        dragIndex === index && "opacity-50",
                      )}
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() =>
                            toggleSelectId(item.id, index, { additive: true })
                          }
                          aria-label={`Select ${item.name}`}
                        />
                      </td>
                      <td className="px-2 py-3">
                        <span
                          className="inline-flex cursor-grab text-gray-300 active:cursor-grabbing"
                          title="Drag to rearrange"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <GripVertical className="h-4 w-4" />
                        </span>
                      </td>
                      <td className="px-2 py-3 sm:px-4">
                        <div className="flex items-center gap-3">
                          {isImageItem(item) && item.src ? (
                            <img
                              src={item.src}
                              alt=""
                              className="h-8 w-8 rounded object-cover"
                            />
                          ) : (
                            <FileTypeIcon kind={item.kind} />
                          )}
                          <span className="text-sm font-medium text-gray-900">{item.name}</span>
                          {item.kind === "folder" && folderPrefersGallery(item) ? (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                              Gallery
                            </span>
                          ) : null}
                          {item.quickAccess ? (
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <SharingCell sharing={item.sharing} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{item.sizeLabel}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{item.modified}</td>
                      <td className="px-2 py-3">{itemMenu(item, index)}</td>
                    </tr>
                  );
                })}
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">
                      This folder is empty. Use Add New or Upload.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Lightbox */}
      {lightbox?.src ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal
          aria-label={lightbox.name}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setLightbox(null)}
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="max-h-[90vh] max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightbox.src}
              alt={lightbox.name}
              className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
            />
            <p className="mt-3 text-center text-sm text-white/90">{lightbox.name}</p>
          </div>
        </div>
      ) : null}

      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={commitRename} disabled={!renameValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Folder name"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAdd();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={commitAdd}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === "folder"
                ? "This folder and everything inside it will be removed."
                : "This item will be permanently removed from Creative Assets."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={commitDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedCount} item{selectedCount === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Selected folders and files will be removed. Folder contents are deleted too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={commitBulkDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
