import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import {
  ArrowDownRight,
  ArrowUpRight,
  Loader2,
  Package,
  ShoppingBag,
  Wallet,
  Coins,
} from "lucide-react";
import {
  SHOPIFY_BRAND_LABELS,
  SHOPIFY_LIVE_BRAND_SLUGS,
  fetchShopifyBrandKpis,
  formatShopifyMoney,
  type ShopifyBrandKpis,
} from "../lib/shopify-dashboard";
import {
  getCostsForBrand,
  productionCostForUnits,
} from "../lib/brand-hub-product-costs";
import { cn } from "./ui/utils";

type BrandSlice = {
  slug: string;
  label: string;
  monthSales: number;
  dailySales: number;
  monthOrders: number;
  dailyOrders: number;
  monthFees: number;
  dailyFees: number;
  adsMonth: number;
  adsToday: number;
  productionMonth: number;
  productionToday: number;
  expensesMonth: number;
  expensesToday: number;
  profitMonth: number;
  profitToday: number;
  topProduct: string | null;
  error?: string;
};

type CombinedState = {
  loading: boolean;
  error: string | null;
  brands: BrandSlice[];
  currency: string;
};

function money(n: number, currency = "USD") {
  return formatShopifyMoney(n, currency);
}

function buildSlice(slug: string, data: ShopifyBrandKpis): BrandSlice {
  const costs = getCostsForBrand(slug);
  const productionMonth = productionCostForUnits(data.monthItems ?? [], costs).total;
  const productionToday = productionCostForUnits(data.dailyItems ?? [], costs).total;
  const monthFees = Number(data.monthFees) || 0;
  const dailyFees = Number(data.dailyFees) || 0;
  const adsMonth = Number(data.adsSpendMonth?.spend) || 0;
  const adsToday = Number(data.adsSpendToday?.spend) || 0;
  const monthSales = Number(data.monthSales) || 0;
  const dailySales = Number(data.dailySales) || 0;
  const expensesMonth = monthFees + adsMonth + productionMonth;
  const expensesToday = dailyFees + adsToday + productionToday;
  return {
    slug,
    label: SHOPIFY_BRAND_LABELS[slug] ?? slug,
    monthSales,
    dailySales,
    monthOrders: Number(data.monthOrderCount) || 0,
    dailyOrders: Number(data.dailyOrderCount) || 0,
    monthFees,
    dailyFees,
    adsMonth,
    adsToday,
    productionMonth,
    productionToday,
    expensesMonth,
    expensesToday,
    profitMonth: monthSales - expensesMonth,
    profitToday: dailySales - expensesToday,
    topProduct: data.topProduct?.name ?? null,
  };
}

function KpiCard({
  title,
  value,
  hint,
  icon,
  accent,
  trend,
}: {
  title: string;
  value: string;
  hint: string;
  icon: ReactNode;
  accent?: boolean;
  trend?: { up: boolean; label: string } | null;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-[132px] flex-col justify-between rounded-2xl p-4 shadow-sm sm:p-5",
        accent ? "bg-blue-600 text-white" : "bg-white text-gray-900",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-sm font-medium", accent ? "text-blue-100" : "text-gray-500")}>
          {title}
        </p>
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full border",
            accent
              ? "border-white/35 text-white"
              : "border-blue-100 bg-blue-50/80 text-blue-600",
          )}
        >
          {icon}
        </div>
      </div>
      <div>
        <p className={cn("text-2xl font-bold tracking-tight sm:text-3xl", accent && "text-white")}>
          {value}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {trend ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
                accent
                  ? "bg-white/15 text-white"
                  : trend.up
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700",
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
          <span className={cn("text-xs", accent ? "text-blue-100" : "text-gray-500")}>{hint}</span>
        </div>
      </div>
    </div>
  );
}

export function CombinedLiveStoresPanel() {
  const [state, setState] = useState<CombinedState>({
    loading: true,
    error: null,
    brands: [],
    currency: "USD",
  });

  useEffect(() => {
    let cancelled = false;
    const slugs = [...SHOPIFY_LIVE_BRAND_SLUGS];

    (async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      const results = await Promise.all(
        slugs.map(async (slug) => {
          try {
            const data = await fetchShopifyBrandKpis(slug);
            return buildSlice(slug, data);
          } catch (err) {
            return {
              slug,
              label: SHOPIFY_BRAND_LABELS[slug] ?? slug,
              monthSales: 0,
              dailySales: 0,
              monthOrders: 0,
              dailyOrders: 0,
              monthFees: 0,
              dailyFees: 0,
              adsMonth: 0,
              adsToday: 0,
              productionMonth: 0,
              productionToday: 0,
              expensesMonth: 0,
              expensesToday: 0,
              profitMonth: 0,
              profitToday: 0,
              topProduct: null,
              error: err instanceof Error ? err.message : "Failed to load",
            } satisfies BrandSlice;
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
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    const sum = (key: keyof BrandSlice) =>
      state.brands.reduce((acc, b) => acc + (typeof b[key] === "number" ? (b[key] as number) : 0), 0);
    return {
      monthSales: sum("monthSales"),
      dailySales: sum("dailySales"),
      expensesMonth: sum("expensesMonth"),
      expensesToday: sum("expensesToday"),
      profitMonth: sum("profitMonth"),
      profitToday: sum("profitToday"),
      monthOrders: sum("monthOrders"),
      dailyOrders: sum("dailyOrders"),
    };
  }, [state.brands]);

  const barData = useMemo(
    () =>
      state.brands.map((b) => ({
        name: b.label.split(" ")[0] ?? b.label,
        Profit: Math.max(0, b.profitMonth),
        Expenses: b.expensesMonth,
      })),
    [state.brands],
  );

  const lineData = useMemo(
    () => [
      { label: "Today", Revenue: totals.dailySales, Expenses: totals.expensesToday },
      { label: "This month", Revenue: totals.monthSales, Expenses: totals.expensesMonth },
    ],
    [totals],
  );

  const profitTrend =
    totals.monthSales > 0
      ? {
          up: totals.profitMonth >= 0,
          label: `${Math.abs(Math.round((totals.profitMonth / totals.monthSales) * 100))}% margin`,
        }
      : null;

  const expenseShare =
    totals.monthSales > 0
      ? {
          up: false,
          label: `${Math.round((totals.expensesMonth / totals.monthSales) * 100)}% of rev`,
        }
      : null;

  if (state.loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-white px-5 py-8 text-sm text-gray-500 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
        Loading combined live store data…
      </div>
    );
  }

  if (state.error && state.brands.every((b) => b.error)) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        {state.error} Make sure the Shopify backend is running.
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Live store overview</h3>
          <p className="text-sm text-gray-500">
            Combined month-to-date from{" "}
            {state.brands.map((b) => b.label).join(" + ") || "Brand Hub stores"}
          </p>
        </div>
        <Link to="/brand-hub" className="text-sm font-medium text-blue-600 hover:underline">
          Open Brand Hub
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* KPI 2×2 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:col-span-5">
          <KpiCard
            title="Total Revenue"
            value={money(totals.monthSales)}
            hint="This month"
            accent
            icon={<Wallet className="h-4 w-4" />}
            trend={
              totals.dailySales > 0
                ? { up: true, label: money(totals.dailySales).replace(/\.00$/, "") + " today" }
                : null
            }
          />
          <KpiCard
            title="Total Expenses"
            value={money(totals.expensesMonth)}
            hint="This month"
            icon={<ShoppingBag className="h-4 w-4" />}
            trend={expenseShare}
          />
          <KpiCard
            title="Net Profit"
            value={money(totals.profitMonth)}
            hint="This month"
            icon={<Coins className="h-4 w-4" />}
            trend={profitTrend}
          />
          <KpiCard
            title="Orders"
            value={String(totals.monthOrders)}
            hint="This month"
            icon={<Package className="h-4 w-4" />}
            trend={
              totals.dailyOrders > 0
                ? { up: true, label: `${totals.dailyOrders} today` }
                : null
            }
          />
        </div>

        {/* Profit & Loss bars */}
        <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5 xl:col-span-7">
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
                    border: "none",
                    boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
                  }}
                />
                <Bar dataKey="Profit" fill="#2563EB" radius={[8, 8, 8, 8]} maxBarSize={36} />
                <Bar dataKey="Expenses" fill="#7DD3FC" radius={[8, 8, 8, 8]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue & Expenses over time */}
        <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5 xl:col-span-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-gray-900">Revenue and Expenses</h4>
            <span className="rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600">
              Today vs month
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
                    border: "none",
                    background: "#2563EB",
                    color: "#fff",
                    boxShadow: "0 8px 24px rgba(37,99,235,0.35)",
                  }}
                  itemStyle={{ color: "#fff" }}
                  labelStyle={{ color: "#DBEAFE" }}
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

        {/* Store pulse list */}
        <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5 xl:col-span-4">
          <h4 className="mb-4 text-sm font-semibold text-gray-900">Store pulse</h4>
          <ul className="space-y-4">
            {state.brands.map((b) => (
              <li key={b.slug}>
                <Link
                  to={`/brand-hub/${b.slug}`}
                  className="flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-gray-50"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                    {b.label
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-gray-900">{b.label}</span>
                      <span className="shrink-0 text-sm font-semibold text-gray-900">
                        {money(b.monthSales)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {b.error
                        ? b.error
                        : `${b.monthOrders} orders · profit ${money(b.profitMonth)}`}
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
          <div className="mt-4 rounded-xl bg-gray-50 px-3 py-3 text-xs text-gray-600">
            Today across stores:{" "}
            <span className="font-semibold text-gray-900">{money(totals.dailySales)}</span> ·{" "}
            {totals.dailyOrders} orders
          </div>
        </div>
      </div>
    </section>
  );
}
