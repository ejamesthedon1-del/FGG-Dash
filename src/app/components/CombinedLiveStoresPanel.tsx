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
  fetchProductCostsForBrand,
  productionCostForUnits,
} from "../lib/brand-hub-product-costs";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { cn } from "./ui/utils";

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

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-lg font-semibold text-gray-900">Live store overview</h3>
            <Select
              value={preset}
              onValueChange={(value) => {
                const next = value as PeriodPreset;
                setPreset(next);
                if (next === "custom") {
                  setAppliedCustom({ start: customStart, end: customEnd });
                } else {
                  setAppliedCustom(null);
                }
              }}
            >
              <SelectTrigger
                aria-label="Date range"
                className="h-8 w-auto min-w-[8.5rem] border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {PRESETS.map((item) => (
                  <SelectItem key={item.id} value={item.id} className="text-sm">
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Combined results from{" "}
            {state.brands.map((b) => b.label).join(" + ") || "Brand Hub stores"} · {periodHint}
          </p>
        </div>
        <Link to="/brand-hub" className="text-sm font-medium text-blue-600 hover:underline">
          Open Brand Hub
        </Link>
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
              className="h-8 w-auto text-sm"
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
              className="h-8 w-auto text-sm"
              max={todayIso}
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
          <Button type="button" size="sm" className="h-8" onClick={applyCustom}>
            Apply
          </Button>
        </div>
      ) : null}

      {state.loading ? (
        <div className="flex items-center gap-2 rounded-2xl bg-white px-5 py-8 text-sm text-gray-500 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          Loading {periodHint}…
        </div>
      ) : null}

      {!state.loading && state.error && state.brands.every((b) => b.error) ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          {state.error} Make sure the Shopify backend is running.
        </div>
      ) : null}

      {!state.loading && !(state.error && state.brands.every((b) => b.error)) ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:col-span-5">
            <KpiCard
              title="Total Revenue"
              value={money(totals.sales)}
              hint={periodHint}
              accent
              icon={<Wallet className="h-4 w-4" />}
              trend={
                totals.orders > 0
                  ? { up: true, label: `${totals.orders} orders` }
                  : null
              }
            />
            <KpiCard
              title="Total Expenses"
              value={money(totals.expenses)}
              hint={periodHint}
              icon={<ShoppingBag className="h-4 w-4" />}
              trend={expenseShare}
            />
            <KpiCard
              title="Net Profit"
              value={money(totals.profit)}
              hint={periodHint}
              icon={<Coins className="h-4 w-4" />}
              trend={profitTrend}
            />
            <KpiCard
              title="Orders"
              value={String(totals.orders)}
              hint={periodHint}
              icon={<Package className="h-4 w-4" />}
              trend={
                totals.ads > 0
                  ? { up: false, label: `${money(totals.ads)} ads` }
                  : null
              }
            />
          </div>

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

          <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5 xl:col-span-8">
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
                        <span className="truncate text-sm font-semibold text-gray-900">
                          {b.label}
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-gray-900">
                          {money(b.sales)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500">
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
            <div className="mt-4 rounded-xl bg-gray-50 px-3 py-3 text-xs text-gray-600">
              Period total:{" "}
              <span className="font-semibold text-gray-900">{money(totals.sales)}</span> ·{" "}
              {totals.orders} orders
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
