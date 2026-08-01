import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  SHOPIFY_BRAND_LABELS,
  SHOPIFY_LIVE_BRAND_SLUGS,
  fetchShopifyPaymentsBalance,
  formatShopifyMoney,
  type ShopifyPaymentsBalance,
} from "../lib/shopify-dashboard";
import {
  computeCashSplit,
  formatPayoutSchedule,
  loadCashSplitTargets,
  saveCashSplitTargets,
  type CashSplitTargets,
} from "../lib/cash-split";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { DashboardSectionHeader } from "./dashboard/DashboardPrimitives";
import { cn } from "./ui/utils";

type BrandPayments = {
  slug: string;
  label: string;
  data: ShopifyPaymentsBalance | null;
  error: string | null;
};

function money(n: number) {
  return formatShopifyMoney(n, "USD");
}

function formatDateLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const day = iso.slice(0, 10);
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(`${day}T12:00:00`));
  } catch {
    return iso;
  }
}

function periodDayCount(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00`).getTime();
  const b = new Date(`${end}T12:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

/** Prefer live balanceUsd; fall back to USD balance rows (not latest payout). */
function balanceFromResponse(data: ShopifyPaymentsBalance | null): number {
  if (!data) return 0;
  if (typeof data.balanceUsd === "number" && data.balanceUsd > 0) return data.balanceUsd;
  const usd = data.balances?.find((row) => row.currency === "USD");
  // Old API stuffed latest payout into balances — only trust when balanceUsd is present
  // or when balances came with the new endpoint shape (balanceUsd === 0 is valid).
  if (typeof data.balanceUsd === "number") {
    return Number(usd?.amount) || data.balanceUsd || 0;
  }
  return 0;
}

function nextPayoutDateFromResponse(data: ShopifyPaymentsBalance | null): string | null {
  if (!data) return null;
  if (data.nextPayoutDate) return data.nextPayoutDate.slice(0, 10);
  if (data.nextPayout?.issuedAt) return String(data.nextPayout.issuedAt).slice(0, 10);

  const candidates: string[] = [];
  for (const p of data.accountPayouts ?? []) {
    if ((p.transactionType || "").toUpperCase() === "WITHDRAWAL") continue;
    if ((p.status || "").toUpperCase() !== "SCHEDULED") continue;
    if (p.issuedAt) candidates.push(String(p.issuedAt).slice(0, 10));
  }
  for (const acct of data.accounts ?? []) {
    for (const p of acct.payouts ?? []) {
      if ((p.transactionType || "").toUpperCase() === "WITHDRAWAL") continue;
      if ((p.status || "").toUpperCase() !== "SCHEDULED") continue;
      if (p.issuedAt) candidates.push(String(p.issuedAt).slice(0, 10));
    }
  }
  candidates.sort();
  return candidates[0] ?? null;
}

export function CeoCashSplitPanel({
  periodAds,
  periodFees,
  periodProduction,
  periodStart,
  periodEnd,
}: {
  periodAds: number;
  periodFees: number;
  periodProduction: number;
  periodStart: string;
  periodEnd: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brands, setBrands] = useState<BrandPayments[]>([]);
  const [targets, setTargets] = useState<CashSplitTargets>(loadCashSplitTargets);
  const [depositInput, setDepositInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    const slugs = [...SHOPIFY_LIVE_BRAND_SLUGS];
    const results = await Promise.all(
      slugs.map(async (slug) => {
        try {
          const data = await fetchShopifyPaymentsBalance(slug);
          return {
            slug,
            label: SHOPIFY_BRAND_LABELS[slug] ?? slug,
            data,
            error: data.error ?? null,
          } satisfies BrandPayments;
        } catch (err) {
          return {
            slug,
            label: SHOPIFY_BRAND_LABELS[slug] ?? slug,
            data: null,
            error: err instanceof Error ? err.message : "Failed to load",
          } satisfies BrandPayments;
        }
      }),
    );
    setBrands(results);
    const ok = results.filter((r) => r.data && !r.error);
    setError(ok.length === 0 ? "Could not load Shopify Payments balances." : null);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const shopifyBalance = useMemo(
    () => brands.reduce((sum, b) => sum + balanceFromResponse(b.data), 0),
    [brands],
  );

  const earliestNextPayout = useMemo(() => {
    const dates = brands
      .map((b) => nextPayoutDateFromResponse(b.data))
      .filter((d): d is string => Boolean(d))
      .sort();
    return dates[0] ?? null;
  }, [brands]);

  const depositOverride = depositInput.trim() === "" ? null : Number(depositInput);
  const split = useMemo(
    () =>
      computeCashSplit({
        shopifyBalance,
        periodAds,
        periodFees,
        periodProduction,
        periodDays: periodDayCount(periodStart, periodEnd),
        targets: {
          ...targets,
          inventoryTarget:
            targets.inventoryTarget > 0 ? targets.inventoryTarget : periodProduction,
        },
        depositOverride:
          depositOverride != null && Number.isFinite(depositOverride)
            ? depositOverride
            : null,
      }),
    [
      shopifyBalance,
      periodAds,
      periodFees,
      periodProduction,
      periodStart,
      periodEnd,
      targets,
      depositOverride,
    ],
  );

  const updateTarget = <K extends keyof CashSplitTargets>(key: K, value: number) => {
    const next = { ...targets, [key]: value };
    setTargets(next);
    saveCashSplitTargets(next);
  };

  const rows: Array<{ label: string; detail: string; amount: number; tone?: "ads" | "keep" }> = [
    {
      label: "Keep in Shopify Balance",
      detail: `Ads runway · ${targets.adsRunwayDays} days (~${money(split.dailyAds)}/day)`,
      amount: split.keepInShopify,
      tone: "ads",
    },
    {
      label: "→ Payroll",
      detail: "Bluevine Payroll",
      amount: split.payroll,
    },
    {
      label: "→ Inventory",
      detail: "Bluevine Inventory",
      amount: split.inventory,
    },
    {
      label: "→ Operating",
      detail: "Bluevine Operating · fees + buffer",
      amount: split.operating,
    },
    {
      label: "Keep in Checking",
      detail: "Bluevine Checking · profit / reserve",
      amount: split.keepInChecking,
      tone: "keep",
    },
  ];

  return (
    <section className="space-y-4">
      <DashboardSectionHeader
        title="Cash split"
        description="When funds are in Shopify Balance or land in Checking, here’s how to break them up."
        action={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowSettings((v) => !v)}
            >
              {showSettings ? "Hide targets" : "Edit targets"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs sm:p-5">
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
            <Loader2 className="size-4 animate-spin" />
            Loading Shopify balances…
          </div>
        ) : (
          <div className="space-y-5">
            {error ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {error}
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-3">
                <p className="text-xs font-medium text-gray-500">Shopify Balance</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-gray-950">
                  {money(shopifyBalance)}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">Across live stores</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-3">
                <p className="text-xs font-medium text-gray-500">Next payout</p>
                <p className="mt-1 text-xl font-semibold text-gray-950">
                  {formatDateLabel(earliestNextPayout)}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">Earliest across stores</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-3">
                <p className="text-xs font-medium text-gray-500">Ads runway target</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-gray-950">
                  {money(split.adsKeepTarget)}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Keep in Shopify for ads
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {brands.map((b) => {
                const bal = balanceFromResponse(b.data);
                const nextDate = nextPayoutDateFromResponse(b.data);
                const scheduleLabel = formatPayoutSchedule(b.data?.payoutSchedule ?? null);
                return (
                  <div
                    key={b.slug}
                    className="rounded-lg border border-gray-100 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-950">{b.label}</p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {scheduleLabel === "Unknown schedule"
                            ? nextDate
                              ? "Next deposit scheduled"
                              : "Payout schedule unavailable"
                            : scheduleLabel}
                        </p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums text-gray-950">
                        {money(bal)}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                      <span>Next {formatDateLabel(nextDate)}</span>
                      {b.data?.latestPayout ? (
                        <span>
                          Last {money(b.data.latestPayout.amount)} ·{" "}
                          {formatDateLabel(b.data.latestPayout.issuedAt)}
                        </span>
                      ) : null}
                    </div>
                    {b.error ? (
                      <p className="mt-2 text-xs text-amber-700">{b.error}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="cash-split-deposit" className="text-xs text-gray-500">
                  Amount landing in Checking (optional)
                </Label>
                <Input
                  id="cash-split-deposit"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  placeholder={String(split.recommendedPayout || "")}
                  value={depositInput}
                  onChange={(e) => setDepositInput(e.target.value)}
                  className="h-9"
                />
                <p className="text-xs text-gray-500">
                  Blank = use recommended payout after ads keep (
                  {money(split.recommendedPayout)})
                </p>
              </div>
              <p className="text-sm text-gray-600">
                Allocating{" "}
                <span className="font-semibold tabular-nums text-gray-950">
                  {money(split.deposit)}
                </span>{" "}
                across Bluevine
              </p>
            </div>

            <ul className="overflow-hidden rounded-xl border border-gray-200">
              {rows.map((row, index) => (
                <li
                  key={row.label}
                  className={cn(
                    "flex items-center justify-between gap-3 px-4 py-3",
                    index > 0 && "border-t border-gray-100",
                    row.tone === "ads" && "bg-brand/5",
                    row.tone === "keep" && "bg-gray-50/80",
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-950">{row.label}</p>
                    <p className="text-xs text-gray-500">{row.detail}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-gray-950">
                    {money(row.amount)}
                  </p>
                </li>
              ))}
            </ul>

            {showSettings ? (
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1.5">
                  <Label className="text-xs">Ads runway (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-9"
                    value={targets.adsRunwayDays}
                    onChange={(e) =>
                      updateTarget("adsRunwayDays", Math.max(1, Number(e.target.value) || 1))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Next payroll ($)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="h-9"
                    value={targets.nextPayrollAmount || ""}
                    onChange={(e) =>
                      updateTarget("nextPayrollAmount", Math.max(0, Number(e.target.value) || 0))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Inventory target ($)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="h-9"
                    placeholder={String(Math.round(periodProduction) || "")}
                    value={targets.inventoryTarget || ""}
                    onChange={(e) =>
                      updateTarget("inventoryTarget", Math.max(0, Number(e.target.value) || 0))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Operating buffer (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    className="h-9"
                    value={targets.operatingBufferPct}
                    onChange={(e) =>
                      updateTarget(
                        "operatingBufferPct",
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Min Checking reserve ($)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="h-9"
                    value={targets.minCheckingReserve || ""}
                    onChange={(e) =>
                      updateTarget(
                        "minCheckingReserve",
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
