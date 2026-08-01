import { writeLocalAndSync } from "@/lib/synced-storage";

export const CASH_SPLIT_TARGETS_KEY = "fgg.cash-split-targets.v1";

export type CashSplitTargets = {
  /** Days of ad spend to keep in Shopify Balance. */
  adsRunwayDays: number;
  /** Next payroll amount to fund in Bluevine Payroll. */
  nextPayrollAmount: number;
  /** Target transfer into Bluevine Inventory when allocating a deposit. */
  inventoryTarget: number;
  /** Extra % on Shopify fees for Bluevine Operating. */
  operatingBufferPct: number;
  /** Minimum to leave in Bluevine Checking after splits. */
  minCheckingReserve: number;
};

export const DEFAULT_CASH_SPLIT_TARGETS: CashSplitTargets = {
  adsRunwayDays: 10,
  nextPayrollAmount: 0,
  inventoryTarget: 0,
  operatingBufferPct: 10,
  minCheckingReserve: 0,
};

export type CashSplitInput = {
  /** Live Shopify Balance available across stores (USD). */
  shopifyBalance: number;
  /** Period ads spend used to size Shopify runway. */
  periodAds: number;
  /** Period length in days (for daily ads estimate). */
  periodDays: number;
  /** Period Shopify fees (operating, paid outside ad card). */
  periodFees: number;
  /** Period production cost hint for inventory. */
  periodProduction: number;
  targets: CashSplitTargets;
  /**
   * Optional override: amount that just landed / is about to land in
   * Bluevine Checking. When omitted, uses recommended payout from Shopify.
   */
  depositOverride?: number | null;
};

export type CashSplitResult = {
  dailyAds: number;
  adsKeepTarget: number;
  keepInShopify: number;
  recommendedPayout: number;
  deposit: number;
  payroll: number;
  inventory: number;
  operating: number;
  keepInChecking: number;
};

function clampMoney(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

export function loadCashSplitTargets(): CashSplitTargets {
  if (typeof window === "undefined") return DEFAULT_CASH_SPLIT_TARGETS;
  try {
    const raw = window.localStorage.getItem(CASH_SPLIT_TARGETS_KEY);
    if (!raw) return DEFAULT_CASH_SPLIT_TARGETS;
    const parsed = JSON.parse(raw) as Partial<CashSplitTargets>;
    return {
      adsRunwayDays: Math.max(
        1,
        Number(parsed.adsRunwayDays) || DEFAULT_CASH_SPLIT_TARGETS.adsRunwayDays,
      ),
      nextPayrollAmount: clampMoney(Number(parsed.nextPayrollAmount) || 0),
      inventoryTarget: clampMoney(
        Number(parsed.inventoryTarget) || DEFAULT_CASH_SPLIT_TARGETS.inventoryTarget,
      ),
      operatingBufferPct: Math.max(
        0,
        Number(parsed.operatingBufferPct) || DEFAULT_CASH_SPLIT_TARGETS.operatingBufferPct,
      ),
      minCheckingReserve: clampMoney(Number(parsed.minCheckingReserve) || 0),
    };
  } catch {
    return DEFAULT_CASH_SPLIT_TARGETS;
  }
}

export function saveCashSplitTargets(targets: CashSplitTargets): void {
  writeLocalAndSync(CASH_SPLIT_TARGETS_KEY, JSON.stringify(targets));
}

export function computeCashSplit(input: CashSplitInput): CashSplitResult {
  const days = Math.max(1, input.periodDays || 1);
  const dailyAds = clampMoney(input.periodAds / days);
  const adsKeepTarget = clampMoney(dailyAds * input.targets.adsRunwayDays);

  const shopifyBalance = clampMoney(input.shopifyBalance);
  const keepInShopify = Math.min(shopifyBalance, adsKeepTarget);
  const recommendedPayout = clampMoney(shopifyBalance - keepInShopify);

  const deposit = clampMoney(
    input.depositOverride != null && input.depositOverride !== undefined
      ? Number(input.depositOverride)
      : recommendedPayout,
  );

  let remaining = deposit;

  const payroll = Math.min(input.targets.nextPayrollAmount, remaining);
  remaining = clampMoney(remaining - payroll);

  const inventoryNeed =
    input.targets.inventoryTarget > 0
      ? input.targets.inventoryTarget
      : clampMoney(input.periodProduction);
  const inventory = Math.min(inventoryNeed, remaining);
  remaining = clampMoney(remaining - inventory);

  const operatingNeed = clampMoney(
    input.periodFees * (1 + input.targets.operatingBufferPct / 100),
  );
  const operating = Math.min(operatingNeed, remaining);
  remaining = clampMoney(remaining - operating);

  const reserve = Math.min(input.targets.minCheckingReserve, remaining);
  const keepInChecking = clampMoney(remaining);

  // reserve is informational floor — keepInChecking already includes it when funded
  void reserve;

  return {
    dailyAds,
    adsKeepTarget,
    keepInShopify,
    recommendedPayout,
    deposit,
    payroll,
    inventory,
    operating,
    keepInChecking,
  };
}

export function formatPayoutSchedule(schedule: {
  interval?: string | null;
  weeklyAnchor?: string | null;
  monthlyAnchor?: number | null;
} | null): string {
  if (!schedule?.interval) return "Unknown schedule";
  const interval = String(schedule.interval).toUpperCase();
  if (interval === "DAILY") return "Daily";
  if (interval === "WEEKLY") {
    const day = schedule.weeklyAnchor
      ? String(schedule.weeklyAnchor).charAt(0) +
        String(schedule.weeklyAnchor).slice(1).toLowerCase()
      : "weekday";
    return `Weekly · ${day}`;
  }
  if (interval === "MONTHLY") {
    const d = schedule.monthlyAnchor;
    return d ? `Monthly · day ${d}` : "Monthly";
  }
  return interval.charAt(0) + interval.slice(1).toLowerCase();
}
