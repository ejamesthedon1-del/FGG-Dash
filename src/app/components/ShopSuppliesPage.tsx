import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { fetchOrderFlow } from "../lib/order-flow";
import {
  FileTooLargeError,
  readFileAsPersistedDataUrl,
} from "../lib/file-data-url";
import {
  addMaterial,
  adjustMaterialQty,
  deleteMaterial,
  deleteRecipe,
  ensureLivdonSeedIfEmpty,
  loadBrandSupplies,
  SUPPLY_BRAND_LABELS,
  SUPPLY_BRANDS,
  SUPPLY_CATEGORIES,
  SUPPLY_CATEGORY_LABELS,
  updateMaterial,
  upsertRecipe,
  type BrandSupplies,
  type SupplyBrand,
  type SupplyCategory,
  type SupplyMaterial,
  type SupplyRecipe,
  type SupplyRecipeLine,
  type SupplyUnit,
} from "../lib/shop-supplies-storage";
import { InventoryDataTable } from "./InventoryDataTable";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Textarea } from "./ui/textarea";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";
import { cn } from "./ui/utils";
import { CircleHelp, ExternalLink, ImagePlus, Package, Plus, Trash2 } from "lucide-react";

type CategoryFilter = "all" | SupplyCategory;

const PHOTO_MAX_BYTES = 1.5 * 1024 * 1024;

function materialById(data: BrandSupplies, id: string): SupplyMaterial | undefined {
  return data.materials.find((m) => m.id === id);
}

function normalizeReorderUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function MaterialPhotoThumb({
  photoDataUrl,
  name,
  size = "md",
}: {
  photoDataUrl?: string;
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "sm" ? "h-9 w-9" : size === "lg" ? "h-20 w-20" : "h-12 w-12";
  if (photoDataUrl) {
    return (
      <img
        src={photoDataUrl}
        alt=""
        className={cn(dim, "shrink-0 rounded-lg border border-gray-200 object-cover")}
      />
    );
  }
  return (
    <div
      className={cn(
        dim,
        "flex shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-gray-400",
      )}
      aria-hidden
      title={name}
    >
      <Package className={size === "lg" ? "h-6 w-6" : size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </div>
  );
}

async function readSupplyPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file (JPG, PNG, WebP)");
  }
  return readFileAsPersistedDataUrl(file, PHOTO_MAX_BYTES);
}

export function ShopSuppliesPage() {
  const [brand, setBrand] = useState<SupplyBrand>("live-don");
  const [data, setData] = useState<BrandSupplies>(() => loadBrandSupplies("live-don"));
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  // New material form
  const [matName, setMatName] = useState("");
  const [matCategory, setMatCategory] = useState<SupplyCategory>("dtf_prints");
  const [matQty, setMatQty] = useState("0");
  const [matLow, setMatLow] = useState("10");
  const [matUnit, setMatUnit] = useState<SupplyUnit>("ea");
  const [matPhoto, setMatPhoto] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const addPhotoInputRef = useRef<HTMLInputElement>(null);
  const detailPhotoInputRef = useRef<HTMLInputElement>(null);
  const detailSheetRef = useRef<HTMLDivElement>(null);
  const [detailMaterialId, setDetailMaterialId] = useState<string | null>(null);
  const [receiveQty, setReceiveQty] = useState("10");
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<SupplyCategory>("other");
  const [editLow, setEditLow] = useState("10");
  const [editUnit, setEditUnit] = useState<SupplyUnit>("ea");
  const [editOnHand, setEditOnHand] = useState("0");
  const [editNotes, setEditNotes] = useState("");
  const [editReorderUrl, setEditReorderUrl] = useState("");

  // Recipe form
  const [recipeProductId, setRecipeProductId] = useState("");
  const [recipeProductName, setRecipeProductName] = useState("");
  const [recipeLines, setRecipeLines] = useState<SupplyRecipeLine[]>([
    { materialId: "", qtyPerUnit: 1 },
  ]);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [orderProducts, setOrderProducts] = useState<
    Array<{ productId: string; productName: string }>
  >([]);

  const refresh = (nextBrand = brand) => {
    if (nextBrand === "live-don") ensureLivdonSeedIfEmpty();
    setData(loadBrandSupplies(nextBrand));
  };

  useEffect(() => {
    refresh(brand);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- brand-driven reload
  }, [brand]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchOrderFlow({ brand, stage: "all", days: 90 });
        if (cancelled) return;
        const byId = new Map<string, string>();
        for (const order of res.orders) {
          for (const item of order.lineItems || []) {
            const id = (item.productId || "").trim();
            if (!id || byId.has(id)) continue;
            byId.set(id, item.product || id);
          }
        }
        setOrderProducts(
          [...byId.entries()]
            .map(([productId, productName]) => ({ productId, productName }))
            .sort((a, b) => a.productName.localeCompare(b.productName)),
        );
      } catch {
        if (!cancelled) setOrderProducts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brand]);

  const materials = useMemo(() => {
    const list =
      categoryFilter === "all"
        ? data.materials
        : data.materials.filter((m) => m.category === categoryFilter);
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [data.materials, categoryFilter]);

  const resetAddForm = () => {
    setMatName("");
    setMatCategory("dtf_prints");
    setMatQty("0");
    setMatLow("10");
    setMatUnit("ea");
    setMatPhoto(null);
    if (addPhotoInputRef.current) addPhotoInputRef.current.value = "";
  };

  const openAddMaterial = () => {
    resetAddForm();
    setAddOpen(true);
  };

  const onAddMaterial = () => {
    if (!matName.trim()) {
      toast.error("Enter a material name");
      return;
    }
    setData(
      addMaterial(brand, {
        name: matName,
        category: matCategory,
        qtyOnHand: Number(matQty) || 0,
        lowStockAt: Number(matLow) || 0,
        unit: matUnit,
        photoDataUrl: matPhoto || undefined,
      }),
    );
    resetAddForm();
    setAddOpen(false);
    toast.success("Material added — set on-hand qty and we track from here");
  };

  const onPickAddPhoto = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await readSupplyPhoto(file);
      setMatPhoto(dataUrl);
    } catch (err) {
      if (err instanceof FileTooLargeError) {
        toast.error("Photo must be 1.5 MB or smaller");
      } else {
        toast.error(err instanceof Error ? err.message : "Could not read photo");
      }
    }
  };

  const openMaterialDetail = (material: SupplyMaterial) => {
    setDetailMaterialId(material.id);
    setReceiveQty("10");
    setEditName(material.name);
    setEditCategory(material.category);
    setEditLow(String(material.lowStockAt));
    setEditUnit(material.unit);
    setEditOnHand(String(material.qtyOnHand));
    setEditNotes(material.notes || "");
    setEditReorderUrl(material.reorderUrl || "");
  };

  useEffect(() => {
    if (!detailMaterialId) return;
    const reset = () => {
      if (detailSheetRef.current) detailSheetRef.current.scrollTop = 0;
    };
    const frame = window.requestAnimationFrame(reset);
    const timer = window.setTimeout(reset, 50);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [detailMaterialId]);

  const detailMaterial = detailMaterialId
    ? materialById(data, detailMaterialId) ?? null
    : null;

  const onPickDetailPhoto = async (file: File | null) => {
    if (!file || !detailMaterialId) return;
    try {
      const dataUrl = await readSupplyPhoto(file);
      setData(updateMaterial(brand, detailMaterialId, { photoDataUrl: dataUrl }));
      toast.success("Photo updated");
    } catch (err) {
      if (err instanceof FileTooLargeError) {
        toast.error("Photo must be 1.5 MB or smaller");
      } else {
        toast.error(err instanceof Error ? err.message : "Could not read photo");
      }
    } finally {
      if (detailPhotoInputRef.current) detailPhotoInputRef.current.value = "";
    }
  };

  const onReceiveStock = () => {
    if (!detailMaterialId) return;
    const n = Number(receiveQty);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter how many were added");
      return;
    }
    const next = adjustMaterialQty(brand, detailMaterialId, n, { type: "receive" });
    setData(next);
    const updated = next.materials.find((m) => m.id === detailMaterialId);
    if (updated) setEditOnHand(String(updated.qtyOnHand));
    toast.success(`Added ${n} to stock`);
    setReceiveQty("10");
  };

  const onSaveMaterialEdits = () => {
    if (!detailMaterialId) return;
    if (!editName.trim()) {
      toast.error("Name is required");
      return;
    }
    const onHand = Number(editOnHand);
    const low = Number(editLow);
    if (!Number.isFinite(onHand) || onHand < 0) {
      toast.error("Enter a valid on-hand quantity");
      return;
    }
    if (!Number.isFinite(low) || low < 0) {
      toast.error("Enter a valid low-stock threshold");
      return;
    }
    setData(
      updateMaterial(brand, detailMaterialId, {
        name: editName,
        category: editCategory,
        qtyOnHand: onHand,
        lowStockAt: low,
        unit: editUnit,
      }),
    );
    toast.success("Settings saved");
  };

  const onSaveItemInfo = () => {
    if (!detailMaterialId) return;
    const url = editReorderUrl.trim();
    if (url && !normalizeReorderUrl(url)) {
      toast.error("Enter a valid reorder link");
      return;
    }
    setData(
      updateMaterial(brand, detailMaterialId, {
        notes: editNotes,
        reorderUrl: url ? normalizeReorderUrl(url) || url : "",
      }),
    );
    toast.success("Item info saved");
  };

  const onDeleteMaterial = (material: SupplyMaterial) => {
    if (!window.confirm(`Delete ${material.name}?`)) return;
    setData(deleteMaterial(brand, material.id));
    if (detailMaterialId === material.id) setDetailMaterialId(null);
    toast.message("Material deleted");
  };

  const onSaveRecipe = () => {
    if (!recipeProductId.trim()) {
      toast.error("Shopify product ID is required");
      return;
    }
    const lines = recipeLines.filter((l) => l.materialId && l.qtyPerUnit > 0);
    if (!lines.length) {
      toast.error("Add at least one material line");
      return;
    }
    setData(
      upsertRecipe(brand, {
        id: editingRecipeId ?? undefined,
        productId: recipeProductId,
        productName: recipeProductName || recipeProductId,
        lines,
      }),
    );
    setRecipeProductId("");
    setRecipeProductName("");
    setRecipeLines([{ materialId: "", qtyPerUnit: 1 }]);
    setEditingRecipeId(null);
    toast.success("Recipe saved");
  };

  const startEditRecipe = (recipe: SupplyRecipe) => {
    setEditingRecipeId(recipe.id);
    setRecipeProductId(recipe.productId);
    setRecipeProductName(recipe.productName);
    setRecipeLines(
      recipe.lines.length ? recipe.lines.map((l) => ({ ...l })) : [{ materialId: "", qtyPerUnit: 1 }],
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-0.5">
          <h2 className="text-2xl font-semibold tracking-tight text-gray-950">
            Inventory
          </h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="-ml-0.5 size-5"
                aria-label="About inventory"
              >
                <CircleHelp />
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={4} className="max-w-[14rem] text-pretty">
              <p>
                Track clothing blanks,
                <br />
                DTF prints, tags, bags,
                <br />
                and shipping supplies
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <Select
          value={brand}
          onValueChange={(v) => {
            setBrand(v as SupplyBrand);
            setCategoryFilter("all");
            setEditingRecipeId(null);
          }}
        >
          <SelectTrigger className="w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPLY_BRANDS.map((b) => (
              <SelectItem key={b} value={b}>
                {SUPPLY_BRAND_LABELS[b]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      <Tabs defaultValue="inventory" className="gap-4">
        <TabsList>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="recipes">Recipes</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4 outline-none">
          <input
            ref={addPhotoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => void onPickAddPhoto(e.target.files?.[0] ?? null)}
          />
          <input
            ref={detailPhotoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => void onPickDetailPhoto(e.target.files?.[0] ?? null)}
          />

          <Sheet
            open={addOpen}
            onOpenChange={(open) => {
              setAddOpen(open);
              if (!open) resetAddForm();
            }}
          >
            <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-sm">
              <SheetHeader className="text-left">
                <SheetTitle>Add material</SheetTitle>
                <SheetDescription>
                  Create a supply item for {SUPPLY_BRAND_LABELS[brand]}. You can
                  receive more stock later from Manage stock.
                </SheetDescription>
              </SheetHeader>
              <div className="grid flex-1 auto-rows-min gap-4 px-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="group relative shrink-0"
                    onClick={() => addPhotoInputRef.current?.click()}
                    title="Add photo"
                  >
                    <MaterialPhotoThumb
                      photoDataUrl={matPhoto || undefined}
                      name={matName || "New material"}
                      size="lg"
                    />
                    <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <ImagePlus className="h-5 w-5 text-white" />
                    </span>
                  </button>
                  {matPhoto ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => setMatPhoto(null)}
                    >
                      Remove photo
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">Optional photo</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="add-material-name">Name</Label>
                  <Input
                    id="add-material-name"
                    placeholder="e.g. Left chest DTF"
                    value={matName}
                    onChange={(e) => setMatName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="add-material-category">Category</Label>
                  <Select
                    value={matCategory}
                    onValueChange={(v) => setMatCategory(v as SupplyCategory)}
                  >
                    <SelectTrigger id="add-material-category" className="w-fit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPLY_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {SUPPLY_CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="grid w-20 gap-2">
                    <Label htmlFor="add-on-hand">On hand</Label>
                    <Input
                      id="add-on-hand"
                      type="number"
                      min={0}
                      value={matQty}
                      onChange={(e) => setMatQty(e.target.value)}
                      className="w-20"
                    />
                  </div>
                  <div className="grid w-20 gap-2">
                    <Label htmlFor="add-low-at">Low at</Label>
                    <Input
                      id="add-low-at"
                      type="number"
                      min={0}
                      value={matLow}
                      onChange={(e) => setMatLow(e.target.value)}
                      className="w-20"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="add-unit">Unit</Label>
                    <Select
                      value={matUnit}
                      onValueChange={(v) => setMatUnit(v as SupplyUnit)}
                    >
                      <SelectTrigger id="add-unit" className="w-fit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ea">Each</SelectItem>
                        <SelectItem value="roll">Roll</SelectItem>
                        <SelectItem value="pack">Pack</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <SheetFooter>
                <Button type="button" size="sm" onClick={onAddMaterial}>
                  Add material
                </Button>
                <SheetClose asChild>
                  <Button type="button" size="sm" variant="outline">
                    Close
                  </Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Card className="gap-0">
            <CardHeader className="px-6 pb-0 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  {categoryFilter === "all"
                    ? "All materials"
                    : SUPPLY_CATEGORY_LABELS[categoryFilter]}
                </CardTitle>
                <p className="text-sm text-gray-500">
                  {materials.length} item{materials.length === 1 ? "" : "s"}
                </p>
              </div>
            </CardHeader>
            <CardContent className="px-6 pt-1.5 pb-4">
              <InventoryDataTable
                data={materials}
                onOpenDetail={openMaterialDetail}
                onDelete={onDeleteMaterial}
                toolbarActions={
                  <>
                    <Select
                      value={categoryFilter}
                      onValueChange={(v) =>
                        setCategoryFilter(v as CategoryFilter)
                      }
                    >
                      <SelectTrigger
                        aria-label="Filter by category"
                        className="w-fit"
                      >
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {SUPPLY_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {SUPPLY_CATEGORY_LABELS[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={openAddMaterial}
                    >
                      <Plus className="size-3.5 stroke-[2.25]" />
                      Add material
                    </Button>
                  </>
                }
              />
            </CardContent>
          </Card>

          <Sheet
            open={Boolean(detailMaterial)}
            onOpenChange={(open) => {
              if (!open) setDetailMaterialId(null);
            }}
          >
            <SheetContent className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-sm">
              <div
                ref={detailSheetRef}
                className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto"
              >
              {detailMaterial ? (
                <>
                  <SheetHeader className="text-left">
                    <div className="flex items-start gap-3 pr-6">
                      <button
                        type="button"
                        className="group relative shrink-0"
                        onClick={() => detailPhotoInputRef.current?.click()}
                        title={
                          detailMaterial.photoDataUrl ? "Change photo" : "Add photo"
                        }
                        aria-label={
                          detailMaterial.photoDataUrl ? "Change photo" : "Add photo"
                        }
                      >
                        {detailMaterial.photoDataUrl ? (
                          <>
                            <MaterialPhotoThumb
                              photoDataUrl={detailMaterial.photoDataUrl}
                              name={detailMaterial.name}
                              size="lg"
                            />
                            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                              <span className="text-xs font-medium text-white">
                                Change
                              </span>
                            </span>
                          </>
                        ) : (
                          <div className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border bg-muted/40 px-1 text-center text-muted-foreground transition-colors group-hover:border-foreground/30 group-hover:bg-muted group-focus-visible:border-foreground/30">
                            <ImagePlus className="h-4 w-4 stroke-[2]" />
                            <span className="text-[10px] font-medium leading-tight">
                              Add photo
                            </span>
                          </div>
                        )}
                      </button>
                      <div className="min-w-0">
                        <SheetTitle>{detailMaterial.name}</SheetTitle>
                        <SheetDescription className="mt-1">
                          {SUPPLY_CATEGORY_LABELS[detailMaterial.category]} ·{" "}
                          <span className="font-medium tabular-nums text-foreground">
                            {detailMaterial.qtyOnHand}
                          </span>{" "}
                          {detailMaterial.unit} on hand
                        </SheetDescription>
                      </div>
                    </div>
                  </SheetHeader>

                  <div className="grid flex-1 auto-rows-min gap-6 px-4 pb-4">
                    <section className="grid gap-2">
                      <div className="flex items-center gap-0.5">
                        <h3 className="text-sm font-medium">Receive stock</h3>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              className="-ml-0.5 size-5"
                              aria-label="About receive stock"
                            >
                              <CircleHelp />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent sideOffset={4} className="max-w-[12.5rem] text-pretty">
                            <p>
                              Enter how many were
                              <br />
                              added to inventory
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          id="receive-qty"
                          type="number"
                          min={1}
                          value={receiveQty}
                          onChange={(e) => setReceiveQty(e.target.value)}
                          className="w-20"
                          aria-label="Quantity to add"
                        />
                        <Button type="button" size="sm" onClick={onReceiveStock}>
                          Add to stock
                        </Button>
                      </div>
                    </section>

                    <section className="grid gap-3">
                      <h3 className="text-sm font-medium">Settings</h3>
                      <div className="grid gap-3">
                        <div className="grid gap-2">
                          <Label htmlFor="edit-material-name">Name</Label>
                          <Input
                            id="edit-material-name"
                            placeholder="e.g. Left chest DTF"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="edit-material-category">Category</Label>
                          <Select
                            value={editCategory}
                            onValueChange={(v) => setEditCategory(v as SupplyCategory)}
                          >
                            <SelectTrigger id="edit-material-category" className="w-fit">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SUPPLY_CATEGORIES.map((c) => (
                                <SelectItem key={c} value={c}>
                                  {SUPPLY_CATEGORY_LABELS[c]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="grid w-20 gap-2">
                            <div className="flex items-center gap-0.5">
                              <Label htmlFor="edit-on-hand">On hand</Label>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="-ml-0.5 size-5"
                                    aria-label="About on hand"
                                  >
                                    <CircleHelp />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={4} className="max-w-[12.5rem] text-pretty">
                                  <p>Current quantity<br />in inventory</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <Input
                              id="edit-on-hand"
                              type="number"
                              min={0}
                              value={editOnHand}
                              onChange={(e) => setEditOnHand(e.target.value)}
                              className="w-20"
                            />
                          </div>
                          <div className="grid w-20 gap-2">
                            <div className="flex items-center gap-0.5">
                              <Label htmlFor="edit-low-at">Low at</Label>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="-ml-0.5 size-5"
                                    aria-label="About low stock at"
                                  >
                                    <CircleHelp />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={4} className="max-w-[12.5rem] text-pretty">
                                  <p>
                                    Show low-stock alert when
                                    <br />
                                    on hand falls to this number
                                    <br />
                                    or below
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <Input
                              id="edit-low-at"
                              type="number"
                              min={0}
                              value={editLow}
                              onChange={(e) => setEditLow(e.target.value)}
                              className="w-20"
                            />
                          </div>
                          <div className="grid gap-2">
                            <div className="flex items-center gap-0.5">
                              <Label htmlFor="edit-unit">Unit</Label>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="-ml-0.5 size-5"
                                    aria-label="About unit"
                                  >
                                    <CircleHelp />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={4} className="max-w-[12.5rem] text-pretty">
                                  <p>
                                    How this item is counted
                                    <br />
                                    (each, roll, or pack)
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <Select
                              value={editUnit}
                              onValueChange={(v) => setEditUnit(v as SupplyUnit)}
                            >
                              <SelectTrigger id="edit-unit" className="w-fit">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ea">Each</SelectItem>
                                <SelectItem value="roll">Roll</SelectItem>
                                <SelectItem value="pack">Pack</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={onSaveMaterialEdits}
                          >
                            Save settings
                          </Button>
                        </div>
                      </div>
                    </section>

                    <section className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3">
                      <div>
                        <h3 className="text-sm font-medium">Item info</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Identification notes and a reorder link for ops managers.
                        </p>
                      </div>

                      <div className="overflow-hidden rounded-md border border-border bg-background">
                        {detailMaterial.photoDataUrl ? (
                          <img
                            src={detailMaterial.photoDataUrl}
                            alt={detailMaterial.name}
                            className="max-h-40 w-full object-contain"
                          />
                        ) : (
                          <div className="flex h-24 flex-col items-center justify-center gap-1 text-muted-foreground">
                            <Package className="h-5 w-5" />
                            <p className="text-xs">No photo yet — tap the square above</p>
                          </div>
                        )}
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="edit-notes">How to identify this item</Label>
                        <Textarea
                          id="edit-notes"
                          rows={4}
                          placeholder="Vendor, SKU, size, color, bin location…"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          className="min-h-[96px] resize-y text-sm"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="edit-reorder-url">Reorder link</Label>
                        <Input
                          id="edit-reorder-url"
                          type="url"
                          placeholder="https://supplier.com/product/…"
                          value={editReorderUrl}
                          onChange={(e) => setEditReorderUrl(e.target.value)}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={onSaveItemInfo}
                          >
                            Save item info
                          </Button>
                          {normalizeReorderUrl(editReorderUrl || detailMaterial.reorderUrl || "") ? (
                            <Button type="button" asChild size="sm" className="gap-1">
                              <a
                                href={
                                  normalizeReorderUrl(
                                    editReorderUrl || detailMaterial.reorderUrl || "",
                                  )!
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="size-3.5 stroke-[2.25]" />
                                Open reorder site
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </section>
                  </div>
                </>
              ) : null}
              </div>
            </SheetContent>
          </Sheet>
        </TabsContent>

        <TabsContent value="recipes" className="space-y-4 outline-none">
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">
              {editingRecipeId ? "Edit recipe" : "New product recipe"}
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Map a Shopify product to the materials used per unit (e.g. painters hoodie → left
              chest DTF + inside tag + bag). Pick from recent Order Flow products or paste a
              product ID.
            </p>
            {orderProducts.length ? (
              <div className="mt-3">
                <Select
                  value={
                    orderProducts.some((p) => p.productId === recipeProductId)
                      ? recipeProductId
                      : undefined
                  }
                  onValueChange={(v) => {
                    const match = orderProducts.find((p) => p.productId === v);
                    setRecipeProductId(v);
                    if (match) setRecipeProductName(match.productName);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick from recent Order Flow products" />
                  </SelectTrigger>
                  <SelectContent>
                    {orderProducts.map((p) => (
                      <SelectItem key={p.productId} value={p.productId}>
                        {p.productName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Shopify product ID (gid://shopify/Product/…)"
                value={recipeProductId}
                onChange={(e) => setRecipeProductId(e.target.value)}
              />
              <Input
                placeholder="Product name"
                value={recipeProductName}
                onChange={(e) => setRecipeProductName(e.target.value)}
              />
            </div>
            <div className="mt-3 space-y-2">
              {recipeLines.map((line, index) => (
                <div key={index} className="flex flex-wrap gap-2">
                  <Select
                    value={line.materialId || undefined}
                    onValueChange={(v) =>
                      setRecipeLines((prev) =>
                        prev.map((l, i) => (i === index ? { ...l, materialId: v } : l)),
                      )
                    }
                  >
                    <SelectTrigger className="min-w-[14rem] flex-1">
                      <SelectValue placeholder="Material" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.materials.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0.1}
                    step={0.1}
                    className="w-28"
                    value={line.qtyPerUnit}
                    onChange={(e) =>
                      setRecipeLines((prev) =>
                        prev.map((l, i) =>
                          i === index
                            ? { ...l, qtyPerUnit: Number(e.target.value) || 0 }
                            : l,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    disabled={recipeLines.length <= 1}
                    onClick={() =>
                      setRecipeLines((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                className="gap-1"
                onClick={() =>
                  setRecipeLines((prev) => [...prev, { materialId: "", qtyPerUnit: 1 }])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add line
              </Button>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              {editingRecipeId ? (
                <Button
                  type="button"
                  variant="tertiary"
                  onClick={() => {
                    setEditingRecipeId(null);
                    setRecipeProductId("");
                    setRecipeProductName("");
                    setRecipeLines([{ materialId: "", qtyPerUnit: 1 }]);
                  }}
                >
                  Cancel
                </Button>
              ) : null}
              <Button type="button" onClick={onSaveRecipe}>
                Save recipe
              </Button>
            </div>
          </section>

          {data.recipes.length ? (
            <ul className="space-y-2">
              {data.recipes.map((recipe) => (
                <li
                  key={recipe.id}
                  className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-950">{recipe.productName}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-gray-400">
                        {recipe.productId}
                      </p>
                      <ul className="mt-2 space-y-1 text-sm text-gray-700">
                        {recipe.lines.map((line) => (
                          <li key={`${recipe.id}-${line.materialId}`}>
                            {line.qtyPerUnit}×{" "}
                            {materialById(data, line.materialId)?.name || "Unknown material"}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="tertiary"
                        onClick={() => startEditRecipe(recipe)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="tertiary"
                        className="text-red-600"
                        onClick={() => {
                          if (!window.confirm(`Delete recipe for ${recipe.productName}?`)) return;
                          setData(deleteRecipe(brand, recipe.id));
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center text-sm text-gray-500">
              No recipes yet. Add materials first, then map each product to what it uses.
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity" className="outline-none">
          {data.events.length ? (
            <ul className="space-y-2">
              {data.events.map((evt) => (
                <li
                  key={evt.id}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-gray-900">
                      {evt.type === "receive"
                        ? "Received"
                        : evt.type === "adjust"
                          ? "Adjusted"
                          : "Applied to order"}
                      {evt.materialName ? ` · ${evt.materialName}` : ""}
                      {evt.orderNumber ? ` · ${evt.orderNumber}` : ""}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(evt.at).toLocaleString()}
                    </p>
                  </div>
                  {evt.delta != null ? (
                    <p className="mt-1 text-xs text-gray-600">
                      {evt.delta > 0 ? "+" : ""}
                      {evt.delta}
                      {evt.qtyAfter != null ? ` → ${evt.qtyAfter} on hand` : ""}
                    </p>
                  ) : null}
                  {evt.deductions?.length ? (
                    <ul className="mt-1 list-disc pl-4 text-xs text-gray-600">
                      {evt.deductions.map((d) => (
                        <li key={`${evt.id}-${d.materialId}`}>
                          −{d.qty} {d.materialName}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center text-sm text-gray-500">
              <Package className="mx-auto mb-2 h-6 w-6 text-gray-300" />
              Activity appears when you receive stock or apply supplies on an order.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
