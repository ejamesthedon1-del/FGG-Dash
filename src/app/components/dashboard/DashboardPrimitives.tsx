import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { cn } from "../ui/utils";

export function DashboardMetricCard({
  label,
  value,
  hint,
  trend,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  trend?: { up: boolean; label: string } | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 bg-white p-4 shadow-xs sm:p-5",
        className,
      )}
    >
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 tabular-nums sm:text-3xl">
        {value}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {trend ? (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
              trend.up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
            )}
          >
            {trend.label}
          </span>
        ) : null}
        {hint ? <span className="text-xs text-gray-500">{hint}</span> : null}
      </div>
    </div>
  );
}

export function DashboardSectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-lg font-semibold tracking-tight text-gray-950">{title}</h3>
        {description ? <p className="mt-0.5 text-sm text-gray-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function DashboardListRow({
  title,
  meta,
  trailing,
  to,
  icon,
  tone,
}: {
  title: string;
  meta?: string;
  trailing?: ReactNode;
  to?: string;
  icon?: ReactNode;
  tone?: "critical" | "action" | "steady";
}) {
  const body = (
    <>
      {icon ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
          {icon}
        </span>
      ) : (
        <span
          className={cn(
            "mt-1 h-8 w-0.5 shrink-0 rounded-full",
            tone === "critical"
              ? "bg-red-500"
              : tone === "action"
                ? "bg-brand"
                : "bg-gray-300",
          )}
          aria-hidden
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-950">{title}</p>
        {meta ? <p className="mt-0.5 text-sm text-gray-500">{meta}</p> : null}
      </div>
      {trailing != null ? (
        <div className="shrink-0 text-sm font-semibold tabular-nums text-gray-950">{trailing}</div>
      ) : null}
      {to ? <ArrowRight className="h-4 w-4 shrink-0 text-gray-300" /> : null}
    </>
  );

  const className =
    "flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-gray-50/80";

  if (to) {
    return (
      <Link to={to} className={className}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}

export function DashboardCtaCard({
  title,
  description,
  to,
}: {
  title: string;
  description: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-xs transition-colors hover:border-gray-300 hover:bg-gray-50/60"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-base font-semibold text-gray-950">{title}</p>
        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
      </div>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </Link>
  );
}
