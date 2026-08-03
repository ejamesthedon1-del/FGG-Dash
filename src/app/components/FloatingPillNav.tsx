"use client";

import { motion } from "motion/react";
import { cn } from "./ui/utils";

export type FloatingPillItem = {
  id: string;
  label: string;
  /** Optional count shown after the label */
  count?: number;
  /** Optional badge (e.g. risk queue) — shown when > 0 */
  badge?: number;
};

type Props = {
  items: FloatingPillItem[];
  value: string;
  onChange: (id: string) => void;
  /** Unique layoutId when multiple pills exist on one page */
  layoutId?: string;
  className?: string;
  "data-tour"?: string;
};

/**
 * Framer-style floating pill navigation:
 * light track + sliding dark active pill (layout animation).
 */
export function FloatingPillNav({
  items,
  value,
  onChange,
  layoutId = "floating-pill-active",
  className,
  "data-tour": dataTour,
}: Props) {
  return (
    <nav
      data-tour={dataTour}
      className={cn(
        "inline-flex w-fit max-w-full flex-wrap items-center rounded-full bg-[#E8E8ED] p-1.5",
        className,
      )}
      role="tablist"
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "relative z-0 px-4 py-1.5 text-[13px] font-medium leading-5 tracking-[-0.02em] transition-colors duration-300",
              active ? "text-white" : "text-black hover:text-black/70",
            )}
          >
            {active ? (
              <motion.div
                layoutId={layoutId}
                className="absolute inset-0 -z-10 rounded-full bg-[#1D1D1F]"
                transition={{
                  type: "spring",
                  stiffness: 800,
                  damping: 60,
                  mass: 1,
                }}
              />
            ) : null}
            <span className="relative z-10 inline-flex items-center gap-1.5 whitespace-nowrap">
              {item.label}
              {typeof item.count === "number" ? (
                <span
                  className={cn(
                    "tabular-nums",
                    active ? "text-white/70" : "text-black/45",
                  )}
                >
                  {item.count}
                </span>
              ) : null}
              {typeof item.badge === "number" && item.badge > 0 ? (
                <span
                  className={cn(
                    "inline-flex size-4 items-center justify-center rounded-full text-[9px] font-semibold tabular-nums",
                    active
                      ? "bg-white/20 text-white"
                      : "bg-amber-500 text-white",
                  )}
                >
                  {item.badge > 99 ? "99" : item.badge}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
