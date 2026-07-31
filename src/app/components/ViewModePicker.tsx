import { LayoutDashboard, Package } from "lucide-react";
import { useAuth } from "../lib/use-auth";
import type { AppRole } from "../lib/auth-roles";
import { cn } from "./ui/utils";

const LOGO_SRC = "/fgg-logo.png?v=2";

const OPTIONS: {
  mode: AppRole;
  title: string;
  description: string;
  icon: typeof LayoutDashboard;
}[] = [
  {
    mode: "ceo",
    title: "CEO view",
    description: "Finance, Brand Hub, Studio, Training, and Mission.",
    icon: LayoutDashboard,
  },
  {
    mode: "ops",
    title: "Ops view",
    description: "Floor dashboard, Order Flow, and Knowledge Base for the shift.",
    icon: Package,
  },
];

/** Shown when a CEO has not chosen CEO vs Ops yet (remembered after first pick). */
export function ViewModePicker() {
  const { setViewMode, viewMode, user } = useAuth();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gray-50 px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-center">
        <img
          src={LOGO_SRC}
          alt="Future Garment Group, LLC"
          className="h-24 w-auto max-w-[240px] object-contain sm:h-28"
          decoding="async"
        />

        <div className="mt-8 w-full space-y-2 text-center">
          <h1 className="text-xl font-semibold text-gray-900">Choose your view</h1>
          <p className="text-sm text-gray-500">
            {user?.email
              ? `Signed in as ${user.email}. Choose CEO or Ops — we’ll remember this next time.`
              : "Choose CEO or Ops — we’ll remember this next time."}
          </p>
        </div>

        <div className="mt-6 grid w-full gap-3">
          {OPTIONS.map(({ mode, title, description, icon: Icon }) => {
            const selected = viewMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border bg-white px-4 py-4 text-left transition-colors",
                  selected
                    ? "border-brand ring-2 ring-brand/25"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                    selected ? "bg-brand text-white" : "bg-gray-100 text-gray-600",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-950">{title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
                    {description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-center text-[11px] text-gray-400">
          You can switch views anytime from the header.
        </p>
      </div>
    </div>
  );
}
