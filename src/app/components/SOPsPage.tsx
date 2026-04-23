import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
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
  ArrowLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  FolderOpen,
  Layers,
  Maximize2,
  Pencil,
  Plus,
  Search,
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

type HubEditTarget =
  | { kind: "categoryTitle"; categoryId: string }
  | { kind: "menuItemTitle"; categoryId: string; itemId: string }
  | { kind: "categoryBlurb"; categoryId: string }
  | { kind: "menuItemSubtitle"; categoryId: string; itemId: string };

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
  const [isAdmin, setIsAdmin] = useState(false);
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

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setIsAdmin(Boolean(data.session));
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAdmin(Boolean(session));
    });
    return () => subscription.unsubscribe();
  }, []);

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">SOP hub</h2>
          <p className="mt-1 text-gray-600">
            Future Garment Group operating procedures: pick an area, then a section, then the document you need.
          </p>
          {isAdmin ? (
            <p className="mt-2 max-w-xl text-xs text-gray-500">
              Double-click a title or description to edit. To open an area or section, click the icon or the counts line
              (not the title), so a double-click is not swallowed by navigation.
            </p>
          ) : null}
        </div>
        {isAdmin ? (
          <Link to="/sops/create">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Create New SOP
            </button>
          </Link>
        ) : (
          <p className="text-sm text-gray-500">Sign in as admin to edit areas and sections.</p>
        )}
      </div>

      <div className="-mx-4 flex min-w-0 flex-col sm:-mx-6 lg:-mx-10">
        {/* Breadcrumb + context */}
        <div className="flex flex-wrap items-center gap-1 bg-gray-50/60 px-4 py-3 text-sm sm:px-6 lg:px-10">
          <Button
            type="button"
            variant={browseCategoryId ? "ghost" : "secondary"}
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

        <div className="min-w-0 flex-1 px-4 pb-10 pt-2 sm:px-6 lg:px-10">
          {/* Step 3: SOP documents for chosen section */}
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

              <div className="rounded-lg bg-gray-50/70 p-4">
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
                <div className="flex flex-col items-center gap-2 rounded-lg bg-gray-50/80 px-4 py-12 text-center">
                  <ClipboardList className="h-10 w-10 text-gray-300" />
                  <p className="text-sm text-gray-600">No procedures in this section match your filters.</p>
                  {isAdmin && (
                    <Link
                      to={`/sops/create?categoryId=${encodeURIComponent(browseCategoryId)}&menuItemId=${encodeURIComponent(browseMenuItemId)}`}
                    >
                      <Button type="button" variant="outline" size="sm" className="mt-2 gap-1">
                        <Plus className="h-4 w-4" />
                        Add SOP here
                      </Button>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {slotSops.map((sop) => (
                    <Card
                      key={sop.id}
                      className="overflow-hidden border-0 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-blue-600"
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
                                {sop.pdfUrl && (
                                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                                    <FileText className="h-3 w-3" />
                                    PDF
                                  </span>
                                )}
                              </div>
                            </div>
                            <CardTitle className="mt-1 line-clamp-2 text-base">{sop.title}</CardTitle>
                            <CardDescription className="line-clamp-2">
                              {sop.description.trim() ||
                                (sop.pdfUrl
                                  ? "PDF attached — preview below. Click title for full view and print."
                                  : "—")}
                            </CardDescription>
                            {(sop.tags ?? []).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {(sop.tags ?? []).slice(0, 3).map((tag) => (
                                  <Badge key={tag} variant="secondary" className="capitalize">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          {isAdmin && (
                            <Link
                              to={`/sops/edit/${sop.id}`}
                              className="shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button type="button" variant="outline" size="sm">
                                Edit
                              </Button>
                            </Link>
                          )}
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
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-gray-500">
                              Scroll inside the preview, or open a larger panel.
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0 gap-1.5"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPdfSheetSop(sop);
                              }}
                            >
                              <Maximize2 className="h-3.5 w-3.5" />
                              Larger preview
                            </Button>
                          </div>
                        </CardContent>
                      ) : null}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : browseCategoryId && selectedCategory ? (
            /* Step 2: Sections under category */
            <div className="space-y-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-gray-600"
                onClick={goToCategories}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to all areas
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3
                    className={`text-lg font-semibold text-gray-900 ${isAdmin ? "cursor-text select-text" : ""}`}
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
                    {selectedCategory.title}
                  </h3>
                  <div className="space-y-1 text-sm text-gray-500">
                    <p
                      className={isAdmin ? "cursor-text select-text" : undefined}
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
                      {resolveCategoryBlurb(structure, selectedCategory.id)}
                    </p>
                    <p className="text-xs text-gray-500">Choose a section below to open its procedures.</p>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex shrink-0 gap-1">
                    <Link to={`/sops/create?categoryId=${encodeURIComponent(selectedCategory.id)}`}>
                      <Button type="button" variant="outline" size="sm" className="gap-1">
                        <Plus className="h-4 w-4" />
                        Add SOP in area
                      </Button>
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Rename ${selectedCategory.title}`}
                      onClick={() =>
                        openHubEdit(
                          { kind: "categoryTitle", categoryId: selectedCategory.id },
                          selectedCategory.title,
                        )
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              {selectedCategory.items.length === 0 ? (
                <p className="py-6 text-sm text-gray-500">
                  No sections yet —{" "}
                  <Link to="/sops/create" className="font-medium text-blue-600 hover:underline">
                    create an SOP
                  </Link>{" "}
                  to add one.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-lg bg-white/90 shadow-sm">
                  {selectedCategory.items.map((item) => {
                    const count = sopCountInSection(selectedCategory.id, item.id);
                    return (
                      <li key={item.id} className="flex items-stretch">
                        <div
                          role="button"
                          tabIndex={0}
                          className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-gray-50"
                          onClick={() => scheduleNav(() => goToSops(selectedCategory.id, item.id))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              if (!isAdmin) goToSops(selectedCategory.id, item.id);
                              else scheduleNav(() => goToSops(selectedCategory.id, item.id));
                            }
                          }}
                        >
                          <div className="min-w-0">
                            <p
                              className={`font-medium text-gray-900 ${isAdmin ? "cursor-text select-text" : ""}`}
                              onClick={isAdmin ? (e) => e.stopPropagation() : undefined}
                              onDoubleClick={
                                isAdmin
                                  ? (e) => {
                                      e.stopPropagation();
                                      clearPendingNav();
                                      openHubEdit(
                                        { kind: "menuItemTitle", categoryId: selectedCategory.id, itemId: item.id },
                                        item.title,
                                      );
                                    }
                                  : undefined
                              }
                            >
                              {item.title}
                            </p>
                            <p
                              className={`text-xs text-gray-500 ${isAdmin ? "cursor-text select-text" : ""}`}
                              onClick={isAdmin ? (e) => e.stopPropagation() : undefined}
                              onDoubleClick={
                                isAdmin
                                  ? (e) => {
                                      e.stopPropagation();
                                      clearPendingNav();
                                      openHubEdit(
                                        {
                                          kind: "menuItemSubtitle",
                                          categoryId: selectedCategory.id,
                                          itemId: item.id,
                                        },
                                        item.subtitle?.trim() ?? "",
                                      );
                                    }
                                  : undefined
                              }
                            >
                              {item.subtitle?.trim()
                                ? item.subtitle.trim()
                                : `${count} ${count === 1 ? "procedure" : "procedures"}`}
                            </p>
                          </div>
                          <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
                        </div>
                        {isAdmin ? (
                          <div className="flex shrink-0 items-center gap-0.5 bg-gray-50/60 px-2">
                            <Link
                              to={`/sops/create?categoryId=${encodeURIComponent(selectedCategory.id)}&menuItemId=${encodeURIComponent(item.id)}`}
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={`Add SOP in ${item.title}`}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Rename ${item.title}`}
                              onClick={() =>
                                openHubEdit(
                                  { kind: "menuItemTitle", categoryId: selectedCategory.id, itemId: item.id },
                                  item.title,
                                )
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
            /* Step 1: All categories */
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Operational areas</h3>
                <div className="relative w-full sm:max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    value={hubSearch}
                    onChange={(e) => setHubSearch(e.target.value)}
                    placeholder="Search areas, sections, or SOP titles…"
                    className="pl-9"
                    aria-label="Search SOP library"
                  />
                </div>
              </div>
              {filteredStructure.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 px-4 py-8 text-center text-sm text-gray-600">
                  No areas match that search. Try a different keyword or clear the search box.
                </p>
              ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredStructure.map((category) => {
                  const count = sopCountInCategory(category.id);
                  const blurb = resolveCategoryBlurb(structure, category.id);
                  return (
                    <div
                      key={category.id}
                      className="flex flex-col overflow-hidden rounded-xl bg-white/90 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <button
                        type="button"
                        className="flex flex-1 flex-col p-4 text-left"
                        onClick={() => scheduleNav(() => goToSections(category.id))}
                      >
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                          <Layers className="h-5 w-5" />
                        </div>
                        <span
                          className={`font-semibold text-gray-900 ${isAdmin ? "cursor-text select-text" : ""}`}
                          onClick={isAdmin ? (e) => e.stopPropagation() : undefined}
                          onDoubleClick={
                            isAdmin
                              ? (e) => {
                                  e.stopPropagation();
                                  clearPendingNav();
                                  openHubEdit({ kind: "categoryTitle", categoryId: category.id }, category.title);
                                }
                              : undefined
                          }
                        >
                          {category.title}
                        </span>
                        {blurb ? (
                          <span
                            className={`mt-1 line-clamp-2 text-sm leading-snug text-gray-600 ${isAdmin ? "cursor-text select-text" : ""}`}
                            onClick={isAdmin ? (e) => e.stopPropagation() : undefined}
                            onDoubleClick={
                              isAdmin
                                ? (e) => {
                                    e.stopPropagation();
                                    clearPendingNav();
                                    openHubEdit(
                                      { kind: "categoryBlurb", categoryId: category.id },
                                      resolveCategoryBlurb(structure, category.id),
                                    );
                                  }
                                : undefined
                            }
                          >
                            {blurb}
                          </span>
                        ) : isAdmin ? (
                          <span
                            className="mt-1 line-clamp-2 cursor-text select-text text-sm italic leading-snug text-gray-400"
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              clearPendingNav();
                              openHubEdit(
                                { kind: "categoryBlurb", categoryId: category.id },
                                resolveCategoryBlurb(structure, category.id),
                              );
                            }}
                          >
                            Double-click to add area description
                          </span>
                        ) : null}
                        <span className="mt-2 text-xs text-gray-500">
                          {category.items.length} {category.items.length === 1 ? "section" : "sections"} · {count}{" "}
                          {count === 1 ? "SOP" : "SOPs"}
                        </span>
                      </button>
                      {isAdmin ? (
                        <div className="flex justify-end gap-1 bg-gray-50/70 px-2 py-2">
                          <Link to={`/sops/create?categoryId=${encodeURIComponent(category.id)}`}>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Add SOP in ${category.title}`}>
                              <Plus className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Rename ${category.title}`}
                            onClick={() =>
                              openHubEdit({ kind: "categoryTitle", categoryId: category.id }, category.title)
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
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
            <Button type="button" variant="outline" onClick={() => setHubEdit(null)}>
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
