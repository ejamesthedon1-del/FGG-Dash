import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router";
import { Button } from "./ui/button";
import { useSidebar } from "./ui/sidebar";
import { useAuth } from "../lib/use-auth";
import {
  isSpotlightTourComplete,
  markSpotlightTourComplete,
  type SpotlightTourId,
} from "../lib/spotlight-tour-storage";
import { ORDERS_SPOTLIGHT_TOUR } from "../lib/spotlight-tour-steps";
import type { SpotlightStep } from "../lib/spotlight-tour-steps";

const PAD = 8;
const START_DELAY_MS = 900;
const TARGET_RETRY_MS = 120;
const TARGET_RETRY_MAX = 40;

type Rect = { top: number; left: number; width: number; height: number };

function readTargetRect(selector: string): Rect | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${selector}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function SpotlightChrome({
  steps,
  stepIndex,
  rect,
  onNext,
  onBack,
  onSkip,
}: {
  steps: SpotlightStep[];
  stepIndex: number;
  rect: Rect;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const step = steps[stepIndex];
  const isLast = stepIndex >= steps.length - 1;
  const hole = {
    top: Math.max(0, rect.top - PAD),
    left: Math.max(0, rect.left - PAD),
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  };

  const tooltipWidth = 320;
  const placeBelow = hole.top + hole.height + 12 + 180 < window.innerHeight;
  const tooltipTop = placeBelow
    ? hole.top + hole.height + 12
    : Math.max(12, hole.top - 12 - 160);
  const tooltipLeft = clamp(
    hole.left + hole.width / 2 - tooltipWidth / 2,
    12,
    window.innerWidth - tooltipWidth - 12,
  );

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <div
        className="pointer-events-none absolute rounded-xl ring-2 ring-brand/80 transition-[top,left,width,height] duration-200"
        style={{
          top: hole.top,
          left: hole.left,
          width: hole.width,
          height: hole.height,
          boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)",
        }}
      />
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-default bg-transparent"
        aria-label="Dismiss tour"
        onClick={onSkip}
      />
      <div
        className="absolute z-10 rounded-xl border border-border bg-background p-4 shadow-lg"
        style={{ top: tooltipTop, left: tooltipLeft, width: tooltipWidth }}
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Step {stepIndex + 1} of {steps.length}
        </p>
        <h3 className="mt-1 text-[length:var(--text-body)] font-semibold tracking-[var(--tracking-body)] text-foreground">
          {step.title}
        </h3>
        <p className="mt-1.5 text-[length:var(--text-utility)] font-normal leading-[var(--leading-utility)] tracking-[var(--tracking-utility)] text-muted-foreground">
          {step.body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button type="button" variant="tertiary" size="sm" onClick={onSkip}>
            Skip
          </Button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={onBack}>
                Back
              </Button>
            ) : null}
            <Button type="button" size="sm" onClick={onNext}>
              {isLast ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function useOrdersSpotlightTour() {
  const { user, isSignedIn, loading } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const userId = user?.id;
  const tourId: SpotlightTourId = "orders";
  const steps = ORDERS_SPOTLIGHT_TOUR;

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const finish = useCallback(() => {
    markSpotlightTourComplete(userId, tourId);
    setActive(false);
    setRect(null);
    if (isMobile) setOpenMobile(false);
  }, [userId, tourId, isMobile, setOpenMobile]);

  useEffect(() => {
    if (loading || !isSignedIn || !userId) return;
    if (isSpotlightTourComplete(userId, tourId)) return;
    const id = window.setTimeout(() => {
      setStepIndex(0);
      setActive(true);
    }, START_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [loading, isSignedIn, userId, tourId]);

  useLayoutEffect(() => {
    if (!active) return;
    const step = steps[stepIndex];
    if (!step) {
      finish();
      return;
    }

    let cancelled = false;
    let tries = 0;
    let retryId = 0;

    if (step.target === "nav-orders" && isMobile) {
      setOpenMobile(true);
    } else if (isMobile && step.target !== "nav-orders") {
      setOpenMobile(false);
    }

    if (
      step.target === "orders-stages" ||
      step.target === "orders-tabs" ||
      step.target === "orders-table"
    ) {
      window.dispatchEvent(new Event("fgg-spotlight-orders"));
    }

    const measure = () => {
      if (cancelled) return;
      const next = readTargetRect(step.target);
      if (next) {
        setRect(next);
        document
          .querySelector(`[data-tour="${step.target}"]`)
          ?.scrollIntoView({ block: "nearest", inline: "nearest" });
        return;
      }
      setRect(null);
      if (tries++ < TARGET_RETRY_MAX) {
        retryId = window.setTimeout(measure, TARGET_RETRY_MS);
      }
    };

    if (step.route && !pathname.startsWith(step.route)) {
      navigate(step.route);
      retryId = window.setTimeout(measure, 280);
    } else {
      retryId = window.setTimeout(measure, step.target === "nav-orders" && isMobile ? 280 : 0);
    }

    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);

    return () => {
      cancelled = true;
      window.clearTimeout(retryId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [
    active,
    stepIndex,
    steps,
    pathname,
    navigate,
    finish,
    isMobile,
    setOpenMobile,
  ]);

  return {
    active,
    steps,
    stepIndex,
    rect,
    onNext: () => {
      if (stepIndex >= steps.length - 1) {
        finish();
        return;
      }
      setStepIndex((i) => i + 1);
    },
    onBack: () => setStepIndex((i) => Math.max(0, i - 1)),
    onSkip: finish,
  };
}

/** Mount inside the signed-in dashboard shell. */
export function OrdersSpotlightTour() {
  const { active, steps, stepIndex, rect, onNext, onBack, onSkip } =
    useOrdersSpotlightTour();

  if (!active || !rect) return null;

  return createPortal(
    <SpotlightChrome
      steps={steps}
      stepIndex={stepIndex}
      rect={rect}
      onNext={onNext}
      onBack={onBack}
      onSkip={onSkip}
    />,
    document.body,
  );
}
