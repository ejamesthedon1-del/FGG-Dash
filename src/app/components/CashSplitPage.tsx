import { useEffect, useMemo, useState } from "react";
import { Calendar } from "lucide-react";
import {
  applyRecipeGarmentCosts,
  fetchProductCostsForBrand,
  productionCostForUnits,
} from "../lib/brand-hub-product-costs";
import { loadBrandSupplies, resolveSupplyBrand } from "../lib/shop-supplies-storage";
import {
  SHOPIFY_LIVE_BRAND_SLUGS,
  fetchShopifyBrandKpis,
} from "../lib/shopify-dashboard";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { CeoCashSplitPanel } from "./CeoCashSplitPanel";

type PeriodPreset = "today" | "yesterday" | "month" | "custom";

function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + delta);
  return toLocalIso(dt);
}

function monthStartIso(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

const PRESETS: Array<{ id: PeriodPreset; label: string }> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Custom" },
];

export function CashSplitPage() {
  const todayIso = toLocalIso(new Date());
  const [preset, setPreset] = useState<PeriodPreset>("today");
  const [customStart, setCustomStart] = useState(monthStartIso(todayIso));
  const [customEnd, setCustomEnd] = useState(todayIso);
  const [appliedCustom, setAppliedCustom] = useState<{ start: string; end: string } | null>(
    null,
  );
  const [totals, setTotals] = useState({
    ads: 0,
    fees: 0,
    production: 0,
  });

  const range = useMemo(() => {
    if (preset === "today") return { start: todayIso, end: todayIso };
    if (preset === "yesterday") {
      const y = addDaysIso(todayIso, -1);
      return { start: y, end: y };
    }
    if (preset === "month") {
      return { start: monthStartIso(todayIso), end: todayIso };
    }
    return appliedCustom ?? { start: customStart, end: customEnd };
  }, [preset, todayIso, appliedCustom, customStart, customEnd]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const slugs = [...SHOPIFY_LIVE_BRAND_SLUGS];
      const results = await Promise.all(
        slugs.map(async (slug) => {
          try {
            const data = await fetchShopifyBrandKpis(slug, {
              start: range.start,
              end: range.end,
            });
            const costs = await fetchProductCostsForBrand(slug);
            const supplyBrand = resolveSupplyBrand(slug);
            const supplies = supplyBrand ? loadBrandSupplies(supplyBrand) : null;
            const resolvedCosts = supplies
              ? applyRecipeGarmentCosts(costs, supplies)
              : costs;
            const periodItems = data.periodItems ?? data.monthItems ?? [];
            const production = productionCostForUnits(periodItems, resolvedCosts).total;
            return {
              ads:
                Number(data.adsSpendPeriod?.spend ?? data.adsSpendMonth?.spend) || 0,
              fees: Number(data.periodFees ?? data.monthFees) || 0,
              production,
            };
          } catch {
            return { ads: 0, fees: 0, production: 0 };
          }
        }),
      );
      if (cancelled) return;
      setTotals({
        ads: results.reduce((s, r) => s + r.ads, 0),
        fees: results.reduce((s, r) => s + r.fees, 0),
        production: results.reduce((s, r) => s + r.production, 0),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [range]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">
            Cash
          </h1>
        </div>
        <Select
          value={preset}
          onValueChange={(value) => setPreset(value as PeriodPreset)}
        >
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      {preset === "custom" ? (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-xs">
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">Start</p>
            <Input
              type="date"
              className="h-9 w-auto"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">End</p>
            <Input
              type="date"
              className="h-9 w-auto"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="gap-1"
            onClick={() => {
              if (!customStart || !customEnd) return;
              if (customEnd < customStart) {
                setAppliedCustom({ start: customEnd, end: customStart });
                setCustomStart(customEnd);
                setCustomEnd(customStart);
                return;
              }
              setAppliedCustom({ start: customStart, end: customEnd });
            }}
          >
            <Calendar className="size-3.5" />
            Apply
          </Button>
        </div>
      ) : null}

      <CeoCashSplitPanel
        periodAds={totals.ads}
        periodFees={totals.fees}
        periodProduction={totals.production}
        periodStart={range.start}
        periodEnd={range.end}
      />
    </div>
  );
}
