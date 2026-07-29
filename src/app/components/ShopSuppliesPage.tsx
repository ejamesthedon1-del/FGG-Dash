import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fetchOrderFlow } from "../lib/order-flow";
import {
  addMaterial,
  adjustMaterialQty,
  deleteMaterial,
  deleteRecipe,
  ensureLivdonSeedIfEmpty,
  isLowStock,
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
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { cn } from "./ui/utils";
import { Minus, Package, Plus, Trash2 } from "lucide-react";

type CategoryFilter = "all" | SupplyCategory;

function materialById(data: BrandSupplies, id: string): SupplyMaterial | undefined {
  return data.materials.find((m) => m.id === id);
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

  const lowCount = data.materials.filter(isLowStock).length;

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
      }),
    );
    setMatName("");
    setMatQty("0");
    toast.success("Material added — set on-hand qty and we track from here");
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
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
            Ops / Productions
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-gray-950">
            Shop supplies
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Track tags, DTF prints, bags, and shipping supplies per brand. Set on-hand qty, map
            recipes to products, then apply supplies from Order Flow.
          </p>
        </div>
        <Select
          value={brand}
          onValueChange={(v) => {
            setBrand(v as SupplyBrand);
            setCategoryFilter("all");
            setEditingRecipeId(null);
          }}
        >
          <SelectTrigger className="w-[200px]">
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

      {lowCount > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="font-semibold">{lowCount}</span> material
          {lowCount === 1 ? "" : "s"} at or below low-stock for {SUPPLY_BRAND_LABELS[brand]}.
        </div>
      ) : null}

      <Tabs defaultValue="inventory" className="gap-4">
        <TabsList>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="recipes">Recipes</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4 outline-none">
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">Add material</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <Input
                className="lg:col-span-2"
                placeholder="Name (e.g. Left chest DTF)"
                value={matName}
                onChange={(e) => setMatName(e.target.value)}
              />
              <Select
                value={matCategory}
                onValueChange={(v) => setMatCategory(v as SupplyCategory)}
              >
                <SelectTrigger>
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
              <Input
                type="number"
                min={0}
                placeholder="On hand"
                value={matQty}
                onChange={(e) => setMatQty(e.target.value)}
              />
              <Input
                type="number"
                min={0}
                placeholder="Low at"
                value={matLow}
                onChange={(e) => setMatLow(e.target.value)}
              />
              <Select value={matUnit} onValueChange={(v) => setMatUnit(v as SupplyUnit)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ea">Each</SelectItem>
                  <SelectItem value="roll">Roll</SelectItem>
                  <SelectItem value="pack">Pack</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="mt-3 flex justify-end">
              <Button type="button" onClick={onAddMaterial}>
                Add material
              </Button>
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategoryFilter("all")}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                categoryFilter === "all"
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-700",
              )}
            >
              All
            </button>
            {SUPPLY_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoryFilter(c)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  categoryFilter === c
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-700",
                )}
              >
                {SUPPLY_CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>

          {materials.length ? (
            <ul className="space-y-2">
              {materials.map((m) => (
                <li
                  key={m.id}
                  className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-950">{m.name}</p>
                        <Badge variant="outline" className="text-xs">
                          {SUPPLY_CATEGORY_LABELS[m.category]}
                        </Badge>
                        {isLowStock(m) ? (
                          <Badge
                            variant="outline"
                            className="border-amber-300 bg-amber-50 text-xs text-amber-950"
                          >
                            Low stock
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        <span className="font-semibold tabular-nums text-gray-950">
                          {m.qtyOnHand}
                        </span>{" "}
                        {m.unit} on hand · low at {m.lowStockAt}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="tertiary"
                        className="gap-1"
                        onClick={() => {
                          setData(adjustMaterialQty(brand, m.id, 1, { type: "receive" }));
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Receive 1
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="tertiary"
                        className="gap-1"
                        onClick={() => {
                          const raw = window.prompt("Receive how many?", "10");
                          if (!raw) return;
                          const n = Number(raw);
                          if (!Number.isFinite(n) || n <= 0) {
                            toast.error("Enter a positive number");
                            return;
                          }
                          setData(adjustMaterialQty(brand, m.id, n, { type: "receive" }));
                        }}
                      >
                        Receive…
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="tertiary"
                        className="gap-1"
                        onClick={() => {
                          setData(adjustMaterialQty(brand, m.id, -1, { type: "adjust" }));
                        }}
                      >
                        <Minus className="h-3.5 w-3.5" />
                        Use 1
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="tertiary"
                        onClick={() => {
                          const raw = window.prompt("Set on-hand quantity", String(m.qtyOnHand));
                          if (raw == null) return;
                          const n = Number(raw);
                          if (!Number.isFinite(n) || n < 0) {
                            toast.error("Enter a valid quantity");
                            return;
                          }
                          setData(updateMaterial(brand, m.id, { qtyOnHand: n }));
                          toast.message("Quantity updated");
                        }}
                      >
                        Set qty
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="tertiary"
                        className="text-red-600"
                        onClick={() => {
                          if (!window.confirm(`Delete ${m.name}?`)) return;
                          setData(deleteMaterial(brand, m.id));
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
              No materials yet. Add tags, prints, bags, and shipping supplies above.
            </div>
          )}
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
