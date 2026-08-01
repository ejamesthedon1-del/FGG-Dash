import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  addMaterial,
  copyRecipeToProducts,
  getRecipeForProduct,
  loadBrandSupplies,
  materialPieceCost,
  materialUnitsPerPack,
  recipeMaterialCost,
  SUPPLY_CATEGORIES,
  SUPPLY_CATEGORY_LABELS,
  updateMaterial,
  upsertRecipe,
  type BrandSupplies,
  type SupplyBrand,
  type SupplyCategory,
  type SupplyMaterial,
} from "../lib/shop-supplies-storage";
import {
  persistProductCostsForBrand,
  type ProductUnitCost,
} from "../lib/brand-hub-product-costs";
import { formatShopifyMoney, type ShopifyProduct } from "../lib/shopify-dashboard";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "./ui/utils";

const NEW_MATERIAL = "__new__";

type CostLineDraft = {
  key: string;
  materialId: string;
  qtyPerUnit: string;
  newName: string;
  newCategory: SupplyCategory;
  unitCost: string;
  boxPrice: string;
  boxCount: string;
};

function newKey(): string {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function emptyLine(): CostLineDraft {
  return {
    key: newKey(),
    materialId: "",
    qtyPerUnit: "1",
    newName: "",
    newCategory: "packing_bags",
    unitCost: "",
    boxPrice: "",
    boxCount: "",
  };
}

function formatPieceCost(cost: number): string {
  if (cost <= 0) return "";
  const rounded = Math.round(cost * 10000) / 10000;
  return String(rounded);
}

function lineFromMaterial(
  materialId: string,
  qtyPerUnit: number,
  materials: SupplyMaterial[],
): CostLineDraft {
  const mat = materials.find((m) => m.id === materialId);
  const cost = mat ? materialPieceCost(mat) : 0;
  return {
    key: newKey(),
    materialId,
    qtyPerUnit: String(qtyPerUnit || 1),
    newName: "",
    newCategory: mat?.category ?? "packing_bags",
    unitCost: formatPieceCost(cost),
    boxPrice: "",
    boxCount: "",
  };
}

function applyBoxMath(line: CostLineDraft): CostLineDraft {
  const price = Number(line.boxPrice);
  const count = Number(line.boxCount);
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(count) || count <= 0) {
    return line;
  }
  return { ...line, unitCost: formatPieceCost(price / count) };
}

function defaultMatchFilter(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("painter")) return "painter";
  if (lower.includes("denim")) return "denim";
  const words = title
    .split(/[\s\-_/]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4);
  return words[0] || "";
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand: SupplyBrand;
  product: ShopifyProduct | null;
  allProducts: ShopifyProduct[];
  data: BrandSupplies;
  productCosts: Record<string, ProductUnitCost>;
  onSaved: (next: BrandSupplies, costs: Record<string, ProductUnitCost>) => void;
};

export function ProductCostSheet({
  open,
  onOpenChange,
  brand,
  product,
  allProducts,
  data,
  productCosts,
  onSaved,
}: Props) {
  const [lines, setLines] = useState<CostLineDraft[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [boxOpenKey, setBoxOpenKey] = useState<string | null>(null);
  const [matchFilter, setMatchFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [showBulk, setShowBulk] = useState(false);

  const materialsSorted = useMemo(
    () => [...data.materials].sort((a, b) => a.name.localeCompare(b.name)),
    [data.materials],
  );

  useEffect(() => {
    if (!open || !product) return;
    setBoxOpenKey(null);
    setShowBulk(false);
    const filter = defaultMatchFilter(product.title || "");
    setMatchFilter(filter);
    const recipe = getRecipeForProduct(brand, product.id);
    if (recipe?.lines.length) {
      setLines(
        recipe.lines.map((l) =>
          lineFromMaterial(l.materialId, l.qtyPerUnit, data.materials),
        ),
      );
    } else {
      setLines([emptyLine()]);
    }
    // Pre-select other products matching the filter
    const q = filter.trim().toLowerCase();
    const pre = new Set<string>();
    if (q) {
      for (const p of allProducts) {
        if (p.id === product.id) continue;
        if ((p.title || "").toLowerCase().includes(q)) pre.add(p.id);
      }
    }
    setSelectedIds(pre);
  }, [open, product?.id, brand, data.materials, allProducts]);

  const matchedProducts = useMemo(() => {
    if (!product) return [];
    const q = matchFilter.trim().toLowerCase();
    return allProducts
      .filter((p) => p.id !== product.id)
      .filter((p) => !q || (p.title || "").toLowerCase().includes(q))
      .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  }, [allProducts, matchFilter, product]);

  const previewTotal = useMemo(() => {
    let total = 0;
    let complete = true;
    let any = false;
    for (const line of lines) {
      const qty = Number(line.qtyPerUnit) || 0;
      if (qty <= 0) continue;
      if (!line.materialId) {
        complete = false;
        continue;
      }
      if (line.materialId === NEW_MATERIAL && !line.newName.trim()) {
        complete = false;
        continue;
      }
      any = true;
      const cost = Number(line.unitCost) || 0;
      if (cost <= 0) complete = false;
      total += qty * cost;
    }
    return { total, complete: complete && any };
  }, [lines]);

  const updateLine = (key: string, patch: Partial<CostLineDraft>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        let next = { ...l, ...patch };
        if (patch.materialId && patch.materialId !== NEW_MATERIAL) {
          const mat = data.materials.find((m) => m.id === patch.materialId);
          if (mat) {
            const c = materialPieceCost(mat);
            next.unitCost = c > 0 ? formatPieceCost(c) : next.unitCost;
            next.newCategory = mat.category;
            next.boxPrice = "";
            next.boxCount = "";
          }
        }
        if (patch.boxPrice != null || patch.boxCount != null) {
          next = applyBoxMath(next);
        }
        return next;
      }),
    );
  };

  const persistCurrentRecipe = async (): Promise<{
    store: BrandSupplies;
    costs: Record<string, ProductUnitCost>;
    sourceProductId: string;
    garmentTotal: number;
  } | null> => {
    if (!product) return null;
    const title = product.title?.trim() || "Untitled";
    let store = loadBrandSupplies(brand);
    const recipeLines: Array<{ materialId: string; qtyPerUnit: number }> = [];

    for (const line of lines) {
      const qty = Number(line.qtyPerUnit) || 0;
      if (qty <= 0) continue;

      const pieceCost = Number(line.unitCost);
      if (!Number.isFinite(pieceCost) || pieceCost < 0) {
        toast.error("Enter a valid cost for each component");
        return null;
      }

      let materialId = line.materialId;
      if (materialId === NEW_MATERIAL) {
        const name = line.newName.trim();
        if (!name) {
          toast.error("Name each new component");
          return null;
        }
        const beforeIds = new Set(store.materials.map((m) => m.id));
        store = addMaterial(brand, {
          name,
          category: line.newCategory,
          qtyOnHand: 0,
          lowStockAt: 10,
          unit: "ea",
          unitCost: pieceCost,
        });
        const created = store.materials.find((m) => !beforeIds.has(m.id));
        if (!created) {
          toast.error(`Could not create “${name}”`);
          return null;
        }
        materialId = created.id;
      } else if (!materialId) {
        continue;
      } else {
        const existing = store.materials.find((m) => m.id === materialId);
        const stockCost =
          existing && (existing.unit === "pack" || existing.unit === "roll")
            ? pieceCost * materialUnitsPerPack(existing)
            : pieceCost;
        store = updateMaterial(brand, materialId, { unitCost: stockCost });
      }

      recipeLines.push({ materialId, qtyPerUnit: qty });
    }

    if (!recipeLines.length) {
      toast.error("Add at least one component with qty and cost");
      return null;
    }

    store = upsertRecipe(brand, {
      productId: product.id,
      productName: title,
      lines: recipeLines,
    });

    const recipe = store.recipes.find((r) => r.productId === product.id);
    const rolled = recipe
      ? recipeMaterialCost(recipe, store.materials)
      : { total: 0, complete: false };

    const nextCosts = {
      ...productCosts,
      [title]: {
        garmentCost: rolled.total,
        laborCost: productCosts[title]?.laborCost ?? 0,
      },
    };

    return {
      store,
      costs: nextCosts,
      sourceProductId: product.id,
      garmentTotal: rolled.total,
    };
  };

  const handleSave = async () => {
    if (!product) return;
    setSaving(true);
    try {
      const result = await persistCurrentRecipe();
      if (!result) return;
      const ok = await persistProductCostsForBrand(brand, result.costs);
      if (!ok) {
        toast.error("Saved components, but product cost sync failed");
      } else {
        toast.success(`Saved costs for ${product.title?.trim() || "product"}`);
      }
      onSaved(result.store, result.costs);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleApplyToSelected = async () => {
    if (!product || selectedIds.size === 0) {
      toast.error("Select at least one other product");
      return;
    }
    setSaving(true);
    try {
      const result = await persistCurrentRecipe();
      if (!result) return;

      const targets = allProducts
        .filter((p) => selectedIds.has(p.id))
        .map((p) => ({
          productId: p.id,
          productName: p.title?.trim() || "Untitled",
        }));

      const store = copyRecipeToProducts(
        brand,
        result.sourceProductId,
        targets,
      );

      const nextCosts = { ...result.costs };
      for (const t of targets) {
        nextCosts[t.productName] = {
          garmentCost: result.garmentTotal,
          laborCost: nextCosts[t.productName]?.laborCost ?? 0,
        };
      }

      const ok = await persistProductCostsForBrand(brand, nextCosts);
      if (!ok) {
        toast.error("Copied recipes, but product cost sync failed");
      } else {
        toast.success(
          `Applied costs to this product + ${targets.length} more`,
        );
      }
      onSaved(store, nextCosts);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Product costs</SheetTitle>
          <SheetDescription>
            {product
              ? `Components for “${product.title}” — cost per 1 piece, not the box.`
              : "Select a product"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_4rem_1.75rem] gap-1 border-b border-gray-100 bg-gray-50 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
              <span>Component</span>
              <span className="text-center">Qty</span>
              <span className="text-center">Each $</span>
              <span className="text-right">Line</span>
              <span />
            </div>

            <ul className="divide-y divide-gray-100">
              {lines.map((line) => {
                const lineTotal =
                  (Number(line.qtyPerUnit) || 0) * (Number(line.unitCost) || 0);
                const isNew = line.materialId === NEW_MATERIAL;
                const showBox = boxOpenKey === line.key;
                return (
                  <li key={line.key} className="px-2 py-1.5">
                    <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_4.5rem_4rem_1.75rem] items-center gap-1">
                      <Select
                        value={line.materialId || undefined}
                        onValueChange={(v) =>
                          updateLine(line.key, { materialId: v })
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          className="h-8 min-w-0 border-gray-200 bg-white px-2 text-xs"
                        >
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NEW_MATERIAL}>+ Create new…</SelectItem>
                          {materialsSorted.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-8 px-1 text-center text-xs tabular-nums"
                        value={line.qtyPerUnit}
                        onChange={(e) =>
                          updateLine(line.key, { qtyPerUnit: e.target.value })
                        }
                        aria-label="Qty"
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.0001"
                        className="h-8 px-1 text-center text-xs tabular-nums"
                        value={line.unitCost}
                        onChange={(e) =>
                          updateLine(line.key, {
                            unitCost: e.target.value,
                            boxPrice: "",
                            boxCount: "",
                          })
                        }
                        placeholder="0.00"
                        aria-label="Cost each"
                      />
                      <span className="truncate text-right text-xs tabular-nums text-gray-600">
                        {lineTotal > 0
                          ? formatShopifyMoney(lineTotal, "USD")
                          : "—"}
                      </span>
                      <button
                        type="button"
                        className="inline-flex h-8 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-30"
                        disabled={lines.length <= 1}
                        onClick={() => {
                          setLines((prev) => prev.filter((l) => l.key !== line.key));
                          if (boxOpenKey === line.key) setBoxOpenKey(null);
                        }}
                        aria-label="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {isNew ? (
                      <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_7.5rem] gap-1 pl-0.5">
                        <Input
                          className="h-8 text-xs"
                          value={line.newName}
                          onChange={(e) =>
                            updateLine(line.key, { newName: e.target.value })
                          }
                          placeholder="New component name"
                        />
                        <Select
                          value={line.newCategory}
                          onValueChange={(v) =>
                            updateLine(line.key, {
                              newCategory: v as SupplyCategory,
                            })
                          }
                        >
                          <SelectTrigger size="sm" className="h-8 text-xs">
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
                    ) : null}

                    <div className="mt-1 flex items-center gap-2 pl-0.5">
                      <button
                        type="button"
                        className={cn(
                          "text-[11px] font-medium",
                          showBox
                            ? "text-gray-800"
                            : "text-gray-400 hover:text-gray-700",
                        )}
                        onClick={() =>
                          setBoxOpenKey((k) => (k === line.key ? null : line.key))
                        }
                      >
                        {showBox ? "Hide box math" : "From box…"}
                      </button>
                    </div>

                    {showBox ? (
                      <div className="mt-1.5 grid grid-cols-2 gap-1 pl-0.5">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="h-8 text-xs"
                          value={line.boxPrice}
                          onChange={(e) =>
                            updateLine(line.key, { boxPrice: e.target.value })
                          }
                          placeholder="Box $"
                        />
                        <Input
                          type="number"
                          min={1}
                          step="1"
                          className="h-8 text-xs"
                          value={line.boxCount}
                          onChange={(e) =>
                            updateLine(line.key, { boxCount: e.target.value })
                          }
                          placeholder="Qty in box"
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>

          <Button
            type="button"
            variant="tertiary"
            size="sm"
            className="h-8 gap-1 self-start px-2 text-xs"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add row
          </Button>

          <div className="rounded-lg border border-gray-200 bg-white">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-gray-900"
              onClick={() => setShowBulk((v) => !v)}
            >
              <span>Apply same costs to other products</span>
              <span className="text-xs font-normal text-gray-500">
                {showBulk ? "Hide" : "Show"}
              </span>
            </button>
            {showBulk ? (
              <div className="space-y-2 border-t border-gray-100 px-3 pb-3 pt-2">
                <p className="text-xs text-gray-500">
                  Set costs once here, then copy to every painter hoodie (or
                  whatever matches).
                </p>
                <Input
                  className="h-8 text-xs"
                  value={matchFilter}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMatchFilter(v);
                    const q = v.trim().toLowerCase();
                    const next = new Set<string>();
                    if (q && product) {
                      for (const p of allProducts) {
                        if (p.id === product.id) continue;
                        if ((p.title || "").toLowerCase().includes(q)) {
                          next.add(p.id);
                        }
                      }
                    }
                    setSelectedIds(next);
                  }}
                  placeholder='Filter e.g. "painter"'
                />
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <button
                    type="button"
                    className="font-medium text-gray-600 hover:text-gray-900"
                    onClick={() =>
                      setSelectedIds(new Set(matchedProducts.map((p) => p.id)))
                    }
                  >
                    Select all ({matchedProducts.length})
                  </button>
                  <button
                    type="button"
                    className="font-medium text-gray-600 hover:text-gray-900"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Clear
                  </button>
                  <span className="text-gray-400">
                    {selectedIds.size} selected
                  </span>
                </div>
                <ul className="max-h-40 overflow-y-auto rounded border border-gray-100 divide-y divide-gray-50">
                  {matchedProducts.length === 0 ? (
                    <li className="px-2 py-3 text-xs text-gray-400">
                      No other products match.
                    </li>
                  ) : (
                    matchedProducts.map((p) => (
                      <li key={p.id}>
                        <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs hover:bg-gray-50">
                          <input
                            type="checkbox"
                            className="size-3.5 rounded border-gray-300"
                            checked={selectedIds.has(p.id)}
                            onChange={() => toggleSelected(p.id)}
                          />
                          <span className="min-w-0 truncate text-gray-800">
                            {p.title || "Untitled"}
                          </span>
                        </label>
                      </li>
                    ))
                  )}
                </ul>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 w-full text-xs"
                  disabled={saving || selectedIds.size === 0}
                  onClick={() => void handleApplyToSelected()}
                >
                  Save & apply to {selectedIds.size || "…"} products
                </Button>
              </div>
            ) : null}
          </div>

          <div className="flex items-baseline justify-between gap-2 border-t border-gray-100 pt-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Total materials</p>
              {!previewTotal.complete ? (
                <p className="text-xs text-amber-700">Fill every cost</p>
              ) : null}
            </div>
            <p className="text-lg font-semibold tabular-nums text-gray-950">
              {formatShopifyMoney(previewTotal.total, "USD")}
            </p>
          </div>
        </div>

        <SheetFooter className="border-t border-gray-100">
          <Button
            type="button"
            variant="tertiary"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !product}
          >
            {saving ? "Saving…" : "Save costs"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
