import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { useAuth } from "../lib/use-auth";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  BookOpen,
  Box,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FolderOpen,
  LifeBuoy,
  Maximize2,
  MoreVertical,
  Package,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Store,
  type LucideIcon,
} from "lucide-react";
import { SOPsStorage, type SOP } from "../lib/storage";
import { resolveSopNavPlacement } from "../lib/sop-structure";
import {
  getNavStructure,
  renameCategory,
  renameMenuItem,
  resolveCategoryBlurb,
  setCategoryBlurb,
  setMenuItemSubtitle,
  type NavCategory,
} from "../lib/sop-nav-storage";
import { format } from "date-fns";
import { SOPViewDialog } from "./SOPViewDialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { toast } from "sonner";
import { cn } from "./ui/utils";

type HubEditTarget =
  | { kind: "categoryTitle"; categoryId: string }
  | { kind: "menuItemTitle"; categoryId: string; itemId: string }
  | { kind: "categoryBlurb"; categoryId: string }
  | { kind: "menuItemSubtitle"; categoryId: string; itemId: string };

/** Light-gray cover + brand-blue icon (style 1 from the KB mock). */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "start-here": BookOpen,
  "daily-tasks": ClipboardCheck,
  fulfillment: Package,
  "customer-support": LifeBuoy,
  "returns-refunds": ArrowLeftRight,
  inventory: Box,
  "store-operations": Store,
  "fraud-risk-review": ShieldAlert,
  escalations: AlertTriangle,
  "brand-notes": Sparkles,
};

function categoryIcon(categoryId: string): LucideIcon {
  return CATEGORY_ICONS[categoryId] ?? FolderOpen;
}

function CategoryCover({
  categoryId,
  className,
  menu,
}: {
  categoryId: string;
  className?: string;
  menu?: React.ReactNode;
}) {
  const Icon = categoryIcon(categoryId);
  return (
    <div
      className={cn(
        "relative flex w-full items-center justify-center bg-[#F3F4F6]",
        className,
      )}
    >
      <Icon className="h-10 w-10 text-brand sm:h-11 sm:w-11" strokeWidth={1.5} aria-hidden />
      {menu}
    </div>
  );
}

function statusBadgeClass(status: SOP["status"] | undefined): string {
  switch (status ?? "Active") {
    case "Draft":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "Needs Update":
      return "border-orange-200 bg-orange-50 text-orange-900";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
}

function sopMatchesTextAndStatus(
  sop: SOP,
  statusFilter: "all" | "Draft" | "Active" | "Needs Update",
  normalizedQuery: string,
): boolean {
  if (statusFilter !== "all" && (sop.status ?? "Active") !== statusFilter) return false;
  if (!normalizedQuery) return true;
  const tags = (sop.tags ?? []).join(" ").toLowerCase();
  return (
    sop.title.toLowerCase().includes(normalizedQuery) ||
    sop.description.toLowerCase().includes(normalizedQuery) ||
    tags.includes(normalizedQuery)
  );
}

export function SOPsPage() {
  const { pathname } = useLocation();
  const [structure, setStructure] = useState<NavCategory[]>(() => getNavStructure());
  const [sops, setSops] = useState<SOP[]>([]);
  const [selected, setSelected] = useState<SOP | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [hubEdit, setHubEdit] = useState<HubEditTarget | null>(null);
  const [hubEditDraft, setHubEditDraft] = useState("");
  const { canManageContent: isAdmin } = useAuth();
  const pendingNavTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [hubSearch, setHubSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Draft" | "Active" | "Needs Update">("all");
  const [pdfSheetSop, setPdfSheetSop] = useState<SOP | null>(null);

  /** Drill-down: null,null = pick category → categoryId = pick section → + menuItemId = view SOPs */
  const [browseCategoryId, setBrowseCategoryId] = useState<string | null>(null);
  const [browseMenuItemId, setBrowseMenuItemId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      setStructure(getNavStructure());
      setSops(SOPsStorage.getSOPs());
    };
    refresh();
    window.addEventListener("fgg-storage-sync", refresh);
    return () => window.removeEventListener("fgg-storage-sync", refresh);
  }, [pathname]);

  const clearPendingNav = () => {
    if (pendingNavTimer.current) {
      clearTimeout(pendingNavTimer.current);
      pendingNavTimer.current = null;
    }
  };

  useEffect(() => () => clearPendingNav(), []);

  /** Signed-in admins use a short delay so a second click can become double-click edit without navigating away first. */
  const scheduleNav = (fn: () => void) => {
    if (!isAdmin) {
      fn();
      return;
    }
    clearPendingNav();
    pendingNavTimer.current = setTimeout(() => {
      pendingNavTimer.current = null;
      fn();
    }, 280);
  };

  const placed = useMemo(
    () =>
      sops.map((sop) => ({
        ...sop,
        ...resolveSopNavPlacement(sop, structure),
      })),
    [sops, structure],
  );

  const hubQuery = hubSearch.trim().toLowerCase();
  const filteredStructure = useMemo(() => {
    if (!hubQuery) return structure;
    return structure.filter((cat) => {
      if (cat.title.toLowerCase().includes(hubQuery)) return true;
      if (resolveCategoryBlurb(structure, cat.id).toLowerCase().includes(hubQuery)) return true;
      if (cat.items.some((i) => i.title.toLowerCase().includes(hubQuery))) return true;
      return placed.some((s) => {
        if (s.categoryId !== cat.id) return false;
        const tags = (s.tags ?? []).join(" ").toLowerCase();
        return (
          s.title.toLowerCase().includes(hubQuery) ||
          s.description.toLowerCase().includes(hubQuery) ||
          tags.includes(hubQuery)
        );
      });
    });
  }, [structure, hubQuery, placed]);

  const openSop = (sop: SOP) => {
    setSelected(sop);
    setDialogOpen(true);
  };

  const sopsInSlot = (categoryId: string, menuItemId: string) =>
    placed.filter((s) => s.categoryId === categoryId && s.menuItemId === menuItemId);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const statusCounts = useMemo(
    () =>
      placed.reduce(
        (acc, sop) => {
          const status = sop.status ?? "Active";
          acc[status] += 1;
          return acc;
        },
        { Draft: 0, Active: 0, "Needs Update": 0 },
      ),
    [placed],
  );

  const selectedCategory = browseCategoryId
    ? structure.find((c) => c.id === browseCategoryId)
    : undefined;
  const selectedMenuItem =
    selectedCategory && browseMenuItemId
      ? selectedCategory.items.find((i) => i.id === browseMenuItemId)
      : undefined;

  const slotSops = useMemo(() => {
    if (!browseCategoryId || !browseMenuItemId) return [];
    return sopsInSlot(browseCategoryId, browseMenuItemId).filter((sop) =>
      sopMatchesTextAndStatus(sop, statusFilter, normalizedQuery),
    );
  }, [placed, browseCategoryId, browseMenuItemId, statusFilter, normalizedQuery]);

  const goToCategories = () => {
    setBrowseCategoryId(null);
    setBrowseMenuItemId(null);
  };

  const goToSections = (categoryId: string) => {
    setBrowseCategoryId(categoryId);
    setBrowseMenuItemId(null);
  };

  const goToSops = (categoryId: string, menuItemId: string) => {
    setBrowseCategoryId(categoryId);
    setBrowseMenuItemId(menuItemId);
  };

  const applyHubEdit = () => {
    if (!hubEdit) return;
    const draft = hubEditDraft;
    const v = draft.trim();
    if (hubEdit.kind === "categoryTitle" || hubEdit.kind === "menuItemTitle") {
      if (!v) {
        toast.error("Enter a name");
        return;
      }
      if (hubEdit.kind === "categoryTitle") {
        renameCategory(hubEdit.categoryId, v);
      } else {
        renameMenuItem(hubEdit.categoryId, hubEdit.itemId, v);
      }
    } else if (hubEdit.kind === "categoryBlurb") {
      setCategoryBlurb(hubEdit.categoryId, v === "" ? null : draft.trim());
    } else {
      setMenuItemSubtitle(hubEdit.categoryId, hubEdit.itemId, v === "" ? null : draft.trim());
    }
    setStructure(getNavStructure());
    setHubEdit(null);
    toast.success("Updated");
  };

  const openHubEdit = (target: HubEditTarget, draft: string) => {
    clearPendingNav();
    setHubEdit(target);
    setHubEditDraft(draft);
  };

  const sopCountInCategory = (categoryId: string) =>
    placed.filter((s) => s.categoryId === categoryId).length;

  const sopCountInSection = (categoryId: string, menuItemId: string) =>
    sopsInSlot(categoryId, menuItemId).length;

  return (
    <div className="space-y-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 pt-2">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={hubSearch}
            onChange={(e) => {
              setHubSearch(e.target.value);
              if (browseCategoryId || browseMenuItemId) {
                setBrowseCategoryId(null);
                setBrowseMenuItemId(null);
              }
            }}
            placeholder="Search for everything..."
            className="h-12 rounded-xl border-gray-200 bg-white pl-11 text-base shadow-sm"
            aria-label="Search Knowledge Base"
          />
        </div>
        <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="text-center sm:text-left">
            <h2 className="text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
              Knowledge Base
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Procedures and docs for the floor — open an area to dig in.
            </p>
          </div>
          {isAdmin ? (
            <Link to="/sops/create">
              <Button type="button" className="gap-2">
                <Plus className="h-4 w-4" />
                Create New Document
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="-mx-4 flex min-w-0 flex-col sm:-mx-6 lg:-mx-10">
        {browseCategoryId ? (
          <div className="flex flex-wrap items-center gap-1 border-b border-gray-100 bg-white/80 px-4 py-3 text-sm sm:px-6 lg:px-10">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 font-medium"
              onClick={goToCategories}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              All areas
            </Button>
            {selectedCategory ? (
              <>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                <Button
                  type="button"
                  variant={browseMenuItemId ? "ghost" : "secondary"}
                  size="sm"
                  className="h-8 max-w-[min(100%,14rem)] truncate px-2 font-medium"
                  onClick={() => goToSections(selectedCategory.id)}
                >
                  {selectedCategory.title}
                </Button>
              </>
            ) : null}
            {selectedCategory && selectedMenuItem ? (
              <>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                <span className="truncate font-medium text-gray-900">{selectedMenuItem.title}</span>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="min-w-0 flex-1 px-4 pb-10 pt-4 sm:px-6 lg:px-10">
          {browseCategoryId && browseMenuItemId && selectedCategory && selectedMenuItem ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-fit gap-1 text-gray-600"
                  onClick={() => goToSections(browseCategoryId)}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to sections
                </Button>
                <p className="text-sm text-gray-500">
                  <span className="font-medium text-gray-800">{selectedCategory.title}</span>
                  <span className="mx-1 text-gray-400">·</span>
                  <span>{selectedMenuItem.title}</span>
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search in this section…"
                      className="pl-9"
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as "all" | "Draft" | "Active" | "Needs Update")
                    }
                    className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="all">All statuses</option>
                    <option value="Draft">Draft</option>
                    <option value="Active">Active</option>
                    <option value="Needs Update">Needs Update</option>
                  </select>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">Draft: {statusCounts.Draft}</Badge>
                  <Badge variant="outline">Active: {statusCounts.Active}</Badge>
                  <Badge variant="outline">Needs Update: {statusCounts["Needs Update"]}</Badge>
                </div>
              </div>

              {slotSops.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white px-4 py-12 text-center">
                  <ClipboardList className="h-10 w-10 text-gray-300" />
                  <p className="text-sm text-gray-600">No procedures in this section match your filters.</p>
                  {isAdmin ? (
                    <Link
                      to={`/sops/create?categoryId=${encodeURIComponent(browseCategoryId)}&menuItemId=${encodeURIComponent(browseMenuItemId)}`}
                    >
                      <Button type="button" variant="outline" size="sm" className="mt-2 gap-1">
                        <Plus className="h-4 w-4" />
                        Add document here
                      </Button>
                    </Link>
                  ) : null}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {slotSops.map((sop) => (
                    <Card
                      key={sop.id}
                      className="overflow-hidden border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-blue-600"
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div
                            role="button"
                            tabIndex={0}
                            className="min-w-0 flex-1 cursor-pointer text-left"
                            onClick={() => openSop(sop)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openSop(sop);
                              }
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-gray-500">
                                {format(new Date(sop.updatedAt), "MMM d, yyyy")}
                              </span>
                              <div className="flex items-center gap-1">
                                <Badge
                                  variant="outline"
                                  className={`shrink-0 font-medium ${statusBadgeClass(sop.status)}`}
                                >
                                  {sop.status ?? "Active"}
                                </Badge>
                                {sop.pdfUrl ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                                    <FileText className="h-3 w-3" />
                                    PDF
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <CardTitle className="mt-1 line-clamp-2 text-base">{sop.title}</CardTitle>
                            <CardDescription className="line-clamp-2">
                              {sop.description.trim() ||
                                (sop.pdfUrl
                                  ? "PDF attached — preview below. Click title for full view and print."
                                  : "—")}
                            </CardDescription>
                          </div>
                          {isAdmin ? (
                            <Link
                              to={`/sops/edit/${sop.id}`}
                              className="shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button type="button" variant="outline" size="sm">
                                Edit
                              </Button>
                            </Link>
                          ) : null}
                        </div>
                      </CardHeader>
                      {sop.pdfUrl ? (
                        <CardContent
                          className="space-y-2 bg-gray-50/50 px-4 pb-4 pt-3 sm:px-6"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="overflow-hidden rounded-md">
                            <iframe
                              title={`PDF preview: ${sop.title}`}
                              src={`${sop.pdfUrl}#toolbar=1&navpanes=0`}
                              className="h-52 w-full sm:h-64"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPdfSheetSop(sop);
                            }}
                          >
                            <Maximize2 className="h-3.5 w-3.5" />
                            Larger preview
                          </Button>
                        </CardContent>
                      ) : null}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : browseCategoryId && selectedCategory ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mb-2 gap-1 px-0 text-gray-600"
                    onClick={goToCategories}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to all areas
                  </Button>
                  <h3
                    className={cn(
                      "flex items-center gap-2 text-2xl font-semibold text-gray-900",
                      isAdmin && "cursor-text select-text",
                    )}
                    onDoubleClick={
                      isAdmin
                        ? () =>
                            openHubEdit(
                              { kind: "categoryTitle", categoryId: selectedCategory.id },
                              selectedCategory.title,
                            )
                        : undefined
                    }
                  >
                    {(() => {
                      const Icon = categoryIcon(selectedCategory.id);
                      return <Icon className="h-6 w-6 text-brand" strokeWidth={1.75} aria-hidden />;
                    })()}
                    {selectedCategory.title}
                  </h3>
                  <p
                    className={cn("mt-1 max-w-2xl text-sm text-gray-500", isAdmin && "cursor-text select-text")}
                    onDoubleClick={
                      isAdmin
                        ? () =>
                            openHubEdit(
                              { kind: "categoryBlurb", categoryId: selectedCategory.id },
                              resolveCategoryBlurb(structure, selectedCategory.id),
                            )
                        : undefined
                    }
                  >
                    {resolveCategoryBlurb(structure, selectedCategory.id) ||
                      "This folder has no description yet."}
                  </p>
                </div>
                {isAdmin ? (
                  <Link to={`/sops/create?categoryId=${encodeURIComponent(selectedCategory.id)}`}>
                    <Button type="button" variant="outline" size="sm" className="gap-1">
                      <Plus className="h-4 w-4" />
                      Add document
                    </Button>
                  </Link>
                ) : null}
              </div>

              {selectedCategory.items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
                  No sections yet.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {selectedCategory.items.map((item) => {
                    const count = sopCountInSection(selectedCategory.id, item.id);
                    const Icon = categoryIcon(selectedCategory.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-sm transition-shadow hover:shadow-md"
                        onClick={() => scheduleNav(() => goToSops(selectedCategory.id, item.id))}
                      >
                        <CategoryCover
                          categoryId={selectedCategory.id}
                          className="h-36"
                          menu={
                            isAdmin ? (
                              <span
                                role="presentation"
                                className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-gray-600 shadow-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openHubEdit(
                                    {
                                      kind: "menuItemTitle",
                                      categoryId: selectedCategory.id,
                                      itemId: item.id,
                                    },
                                    item.title,
                                  );
                                }}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </span>
                            ) : undefined
                          }
                        />
                        <div className="flex flex-1 flex-col gap-1 px-4 pb-4 pt-3">
                          <p className="flex items-center gap-2 text-base font-semibold text-gray-900">
                            <Icon className="h-4 w-4 shrink-0 text-brand" strokeWidth={1.75} aria-hidden />
                            {item.title}
                          </p>
                          <p className="line-clamp-2 text-sm leading-relaxed text-gray-500">
                            {item.subtitle?.trim() || "This folder has no description yet."}
                          </p>
                          <p className="mt-auto pt-3 text-xs text-gray-400">
                            {count} {count === 1 ? "document" : "documents"}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {filteredStructure.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-600">
                  No areas match that search. Try a different keyword or clear the search box.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredStructure.map((category) => {
                    const count = sopCountInCategory(category.id);
                    const blurb = resolveCategoryBlurb(structure, category.id);
                    const Icon = categoryIcon(category.id);
                    const sections = category.items.length;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-sm transition-shadow hover:shadow-md"
                        onClick={() => scheduleNav(() => goToSections(category.id))}
                      >
                        <CategoryCover
                          categoryId={category.id}
                          className="h-40 sm:h-44"
                          menu={
                            isAdmin ? (
                              <span
                                role="presentation"
                                className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-gray-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openHubEdit(
                                    { kind: "categoryTitle", categoryId: category.id },
                                    category.title,
                                  );
                                }}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </span>
                            ) : undefined
                          }
                        />
                        <div className="flex flex-1 flex-col gap-1.5 px-4 pb-4 pt-3">
                          <p
                            className={cn(
                              "flex items-center gap-2 text-base font-semibold text-gray-900",
                              isAdmin && "cursor-text select-text",
                            )}
                            onClick={isAdmin ? (e) => e.stopPropagation() : undefined}
                            onDoubleClick={
                              isAdmin
                                ? (e) => {
                                    e.stopPropagation();
                                    clearPendingNav();
                                    openHubEdit(
                                      { kind: "categoryTitle", categoryId: category.id },
                                      category.title,
                                    );
                                  }
                                : undefined
                            }
                          >
                            <Icon className="h-4 w-4 shrink-0 text-brand" strokeWidth={1.75} aria-hidden />
                            {category.title}
                          </p>
                          <p
                            className={cn(
                              "line-clamp-3 text-sm leading-relaxed text-gray-500",
                              isAdmin && "cursor-text select-text",
                            )}
                            onClick={isAdmin ? (e) => e.stopPropagation() : undefined}
                            onDoubleClick={
                              isAdmin
                                ? (e) => {
                                    e.stopPropagation();
                                    clearPendingNav();
                                    openHubEdit(
                                      { kind: "categoryBlurb", categoryId: category.id },
                                      blurb,
                                    );
                                  }
                                : undefined
                            }
                          >
                            {blurb.trim() || "This folder has no description yet."}
                          </p>
                          <div className="mt-auto flex items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-gray-400">
                            <span>
                              {sections} {sections === 1 ? "section" : "sections"}
                            </span>
                            <span>
                              {count} {count === 1 ? "document" : "documents"}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={hubEdit !== null}
        onOpenChange={(open) => {
          if (!open) setHubEdit(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {hubEdit?.kind === "categoryTitle"
                ? "Area name"
                : hubEdit?.kind === "menuItemTitle"
                  ? "Section name"
                  : hubEdit?.kind === "categoryBlurb"
                    ? "Area description"
                    : hubEdit?.kind === "menuItemSubtitle"
                      ? "Section subtext"
                      : "Edit"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="hub-edit-field">
              {hubEdit?.kind === "categoryTitle" || hubEdit?.kind === "menuItemTitle"
                ? "Name"
                : hubEdit?.kind === "categoryBlurb"
                  ? "Description (shown on area cards)"
                  : "Subtext (leave empty to show procedure count)"}
            </Label>
            {hubEdit?.kind === "categoryBlurb" || hubEdit?.kind === "menuItemSubtitle" ? (
              <Textarea
                id="hub-edit-field"
                value={hubEditDraft}
                onChange={(e) => setHubEditDraft(e.target.value)}
                rows={4}
                className="resize-y"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) applyHubEdit();
                }}
              />
            ) : (
              <Input
                id="hub-edit-field"
                value={hubEditDraft}
                onChange={(e) => setHubEditDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyHubEdit();
                }}
              />
            )}
            {(hubEdit?.kind === "categoryBlurb" || hubEdit?.kind === "menuItemSubtitle") && (
              <p className="text-xs text-gray-500">Save empty to restore the default text for this field.</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={() => setHubEdit(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={applyHubEdit}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={pdfSheetSop !== null} onOpenChange={(open) => !open && setPdfSheetSop(null)}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 border-l p-0 sm:max-w-[min(90vw,56rem)]"
        >
          {pdfSheetSop?.pdfUrl ? (
            <>
              <SheetHeader className="shrink-0 border-b px-6 py-4 pr-12 text-left">
                <SheetTitle className="line-clamp-2 text-left">{pdfSheetSop.title}</SheetTitle>
              </SheetHeader>
              <div className="min-h-0 flex-1 bg-gray-100 p-4">
                <iframe
                  key={pdfSheetSop.id}
                  title={`PDF: ${pdfSheetSop.title}`}
                  src={`${pdfSheetSop.pdfUrl}#toolbar=1`}
                  className="h-[min(75vh,720px)] w-full rounded-md border bg-white"
                />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <SOPViewDialog
        sop={selected}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
