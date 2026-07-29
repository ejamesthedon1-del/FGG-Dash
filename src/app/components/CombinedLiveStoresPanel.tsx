import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Calendar, Loader2 } from "lucide-react";
import {
  SHOPIFY_BRAND_LABELS,
  SHOPIFY_LIVE_BRAND_SLUGS,
  fetchShopifyBrandKpis,
  formatShopifyMoney,
  type ShopifyBrandKpis,
} from "../lib/shopify-dashboard";
import {
  fetchProductCostsForBrand,
  productionCostForUnits,
} from "../lib/brand-hub-product-costs";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "./ui/utils";
import {
  DashboardCtaCard,
  DashboardSectionHeader,
} from "./dashboard/DashboardPrimitives";

type PeriodPreset = "today" | "yesterday" | "month" | "custom";

type BrandSlice = {
  slug: string;
  label: string;
  sales: number;
  orders: number;
  fees: number;
  ads: number;
  production: number;
  expenses: number;
  profit: number;
  topProduct: string | null;
  error?: string;
};

type CombinedState = {
  loading: boolean;
  error: string | null;
  brands: BrandSlice[];
  currency: string;
  periodStart: string;
  periodEnd: string;
};

function money(n: number, currency = "USD") {
  return formatShopifyMoney(n, currency);
}

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

function formatPeriodLabel(start: string, end: string): string {
  const fmt = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(`${iso}T12:00:00`));
    } catch {
      return iso;
    }
  };
  if (start === end) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

async function buildSlice(slug: string, data: ShopifyBrandKpis): Promise<BrandSlice> {
  const costs = await fetchProductCostsForBrand(slug);
  const periodItems = data.periodItems ?? data.monthItems ?? [];
  const production = productionCostForUnits(periodItems, costs).total;
  const sales = Number(data.periodSales ?? data.monthSales) || 0;
  const fees = Number(data.periodFees ?? data.monthFees) || 0;
  const ads =
    Number(data.adsSpendPeriod?.spend ?? data.adsSpendMonth?.spend) || 0;
  const expenses = fees + ads + production;
  return {
    slug,
    label: SHOPIFY_BRAND_LABELS[slug] ?? slug,
    sales,
    orders: Number(data.periodOrderCount ?? data.monthOrderCount) || 0,
    fees,
    ads,
    production,
    expenses,
    profit: sales - expenses,
    topProduct: data.topProduct?.name ?? null,
  };
}

function emptySlice(slug: string, error: string): BrandSlice {
  return {
    slug,
    label: SHOPIFY_BRAND_LABELS[slug] ?? slug,
    sales: 0,
    orders: 0,
    fees: 0,
    ads: 0,
    production: 0,
    expenses: 0,
    profit: 0,
    topProduct: null,
    error,
  };
}

const PRESETS: Array<{ id: PeriodPreset; label: string }> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Custom" },
];

export function CombinedLiveStoresPanel() {
  const todayIso = toLocalIso(new Date());
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [customStart, setCustomStart] = useState(monthStartIso(todayIso));
  const [customEnd, setCustomEnd] = useState(todayIso);
  const [appliedCustom, setAppliedCustom] = useState<{ start: string; end: string } | null>(
    null,
  );

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

  const [state, setState] = useState<CombinedState>({
    loading: true,
    error: null,
    brands: [],
    currency: "USD",
    periodStart: range.start,
    periodEnd: range.end,
  });

  useEffect(() => {
    let cancelled = false;
    const slugs = [...SHOPIFY_LIVE_BRAND_SLUGS];
    const { start, end } = range;

    (async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      const results = await Promise.all(
        slugs.map(async (slug) => {
          try {
            const data = await fetchShopifyBrandKpis(slug, { start, end });
            return await buildSlice(slug, data);
          } catch (err) {
            return emptySlice(
              slug,
              err instanceof Error ? err.message : "Failed to load",
            );
          }
        }),
      );
      if (cancelled) return;
      const ok = results.filter((r) => !r.error);
      setState({
        loading: false,
        error: ok.length === 0 ? "Could not load live store data." : null,
        brands: results,
        currency: "USD",
        periodStart: start,
        periodEnd: end,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [range]);

  const totals = useMemo(() => {
    const sum = (key: keyof BrandSlice) =>
      state.brands.reduce(
        (acc, b) => acc + (typeof b[key] === "number" ? (b[key] as number) : 0),
        0,
      );
    return {
      sales: sum("sales"),
      expenses: sum("expenses"),
      profit: sum("profit"),
      orders: sum("orders"),
      ads: sum("ads"),
      production: sum("production"),
      fees: sum("fees"),
    };
  }, [state.brands]);

  const barData = useMemo(
    () =>
      state.brands.map((b) => ({
        name: b.label.split(" ")[0] ?? b.label,
        Profit: Math.max(0, b.profit),
        Expenses: b.expenses,
      })),
    [state.brands],
  );

  const lineData = useMemo(
    () =>
      state.brands.map((b) => ({
        label: b.label.split(" ")[0] ?? b.label,
        Revenue: b.sales,
        Expenses: b.expenses,
      })),
    [state.brands],
  );

  const periodHint = formatPeriodLabel(state.periodStart, state.periodEnd);

  const profitTrend =
    totals.sales > 0
      ? {
          up: totals.profit >= 0,
          label: `${Math.abs(Math.round((totals.profit / totals.sales) * 100))}% margin`,
        }
      : null;

  const expenseShare =
    totals.sales > 0
      ? {
          up: false,
          label: `${Math.round((totals.expenses / totals.sales) * 100)}% of rev`,
        }
      : null;

  const applyCustom = () => {
    if (!customStart || !customEnd) return;
    if (customEnd < customStart) {
      setAppliedCustom({ start: customEnd, end: customStart });
      setCustomStart(customEnd);
      setCustomEnd(customStart);
      return;
    }
    setAppliedCustom({ start: customStart, end: customEnd });
  };

  const SecondaryStat = ({
    label,
    value,
    trend,
  }: {
    label: string;
    value: string;
    trend?: { up: boolean; label: string } | null;
  }) => (
    <div className="min-w-0">
      <p className="text-sm text-gray-500">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <p className="text-xl font-semibold tracking-tight text-gray-950 tabular-nums sm:text-2xl">
          {value}
        </p>
        {trend ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-sm font-semibold",
              trend.up ? "text-emerald-600" : "text-rose-600",
            )}
          >
            {trend.up ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {trend.label}
          </span>
        ) : null}
      </div>
    </div>
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex flex-wrap rounded-lg border border-gray-100 bg-gray-50/80 p-0.5">
          {PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setPreset(item.id);
                if (item.id === "custom") {
                  setAppliedCustom({ start: customStart, end: customEnd });
                } else {
                  setAppliedCustom(null);
                }
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                preset === item.id
                  ? "bg-white text-gray-950 shadow-xs ring-1 ring-gray-100"
                  : "text-gray-500 hover:text-gray-800",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm text-gray-600">
          <Calendar className="h-4 w-4 text-gray-400" />
          <span>{periodHint}</span>
        </div>
      </div>

      {preset === "custom" ? (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label
              htmlFor="ceo-kpi-start"
              className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400"
            >
              From
            </label>
            <Input
              id="ceo-kpi-start"
              type="date"
              className="h-9 w-auto text-sm"
              max={todayIso}
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor="ceo-kpi-end"
              className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400"
            >
              To
            </label>
            <Input
              id="ceo-kpi-end"
              type="date"
              className="h-9 w-auto text-sm"
              max={todayIso}
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={applyCustom}>
            Apply
          </Button>
        </div>
      ) : null}

      {state.loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-5 py-10 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-brand" />
          Loading {periodHint}…
        </div>
      ) : null}

      {!state.loading && state.error && state.brands.every((b) => b.error) ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          {state.error} Make sure the Shopify backend is running.
        </div>
      ) : null}

      {!state.loading && !(state.error && state.brands.every((b) => b.error)) ? (
        <>
          <div className="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 xl:items-center">
              <div className="min-w-0 xl:col-span-3">
                <p className="text-sm text-gray-500">Total Revenue</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-gray-950 tabular-nums sm:text-4xl">
                  {money(totals.sales)}
                </p>
                {totals.orders > 0 ? (
                  <p className="mt-2 inline-flex items-center gap-0.5 text-sm font-semibold text-emerald-600">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    {totals.orders} orders
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-gray-500">{periodHint}</p>
                )}
              </div>

              <div className="h-40 w-full min-w-0 xl:col-span-5 sm:h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={lineData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="heroRevFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563EB" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#F3F4F6" />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#9CA3AF", fontSize: 12 }}
                    />
                    <YAxis hide />
                    <Tooltip
                      formatter={(value: number) => [money(value), "Revenue"]}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #F3F4F6",
                        boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="Revenue"
                      stroke="#2563EB"
                      strokeWidth={2.5}
                      fill="url(#heroRevFill)"
                      dot={{ r: 4, fill: "#2563EB", strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="flex flex-col gap-5 border-t border-gray-100 pt-4 xl:col-span-4 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                <SecondaryStat
                  label="Total Expenses"
                  value={money(totals.expenses)}
                  trend={expenseShare}
                />
                <SecondaryStat
                  label="Net Profit"
                  value={money(totals.profit)}
                  trend={profitTrend}
                />
                <SecondaryStat
                  label="Orders"
                  value={String(totals.orders)}
                  trend={
                    totals.ads > 0
                      ? { up: false, label: `${money(totals.ads)} ads` }
                      : null
                  }
                />
              </div>
            </div>
          </div>

          <div>
            <DashboardSectionHeader title="Jump into work" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <DashboardCtaCard
                title="Brand Hub"
                description="Store KPIs, product costs, and live Shopify pulse."
                to="/brand-hub"
              />
              <DashboardCtaCard
                title="Order Flow"
                description="Track blanks, production, and ship status."
                to="/order-flow"
              />
              <DashboardCtaCard
                title="Mockups"
                description="Generate photoreal garment mockups for ads."
                to="/mockups"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-xs sm:p-5 xl:col-span-7">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-gray-900">Profit and Loss</h4>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" /> Profit
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-sky-300" /> Expenses
                  </span>
                </div>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} barGap={6} barCategoryGap="28%">
                    <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#9CA3AF", fontSize: 12 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#9CA3AF", fontSize: 12 }}
                      tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
                    />
                    <Tooltip
                      formatter={(value: number) => money(value)}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #E5E7EB",
                        boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
                      }}
                    />
                    <Bar dataKey="Profit" fill="#2563EB" radius={[8, 8, 8, 8]} maxBarSize={36} />
                    <Bar dataKey="Expenses" fill="#7DD3FC" radius={[8, 8, 8, 8]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-xs sm:p-5 xl:col-span-5">
              <DashboardSectionHeader title="Store pulse" />
              <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100">
                {state.brands.map((b) => (
                  <li key={b.slug}>
                    <Link
                      to={`/brand-hub/${b.slug}`}
                      className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-gray-50/80"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700">
                        {b.label
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .slice(0, 2)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-gray-900">
                            {b.label}
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                            {money(b.sales)}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-sm text-gray-500">
                          {b.error
                            ? b.error
                            : `${b.orders} orders · profit ${money(b.profit)}`}
                        </span>
                        {b.topProduct ? (
                          <span className="mt-1 block truncate text-xs text-gray-400">
                            Top: {b.topProduct}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-xs sm:p-5 xl:col-span-12">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-gray-900">Revenue and Expenses</h4>
                <span className="rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600">
                  By store · {periodHint}
                </span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={lineData}>
                    <defs>
                      <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563EB" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="expFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#38BDF8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#9CA3AF", fontSize: 12 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#9CA3AF", fontSize: 12 }}
                      tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [money(value), name]}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #E5E7EB",
                        boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="Revenue"
                      stroke="#2563EB"
                      strokeWidth={3}
                      fill="url(#revFill)"
                      dot={{ r: 4, fill: "#2563EB", strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="Expenses"
                      stroke="#38BDF8"
                      strokeWidth={3}
                      fill="url(#expFill)"
                      dot={{ r: 4, fill: "#38BDF8", strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
