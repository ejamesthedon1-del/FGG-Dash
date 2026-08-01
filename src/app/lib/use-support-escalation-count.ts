import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router";
import { apiUrl } from "./api-base";

const POLL_MS = 30_000;

function isSupportPath(pathname: string): boolean {
  return pathname === "/support" || pathname.startsWith("/support/");
}

export type SupportEscalationCountResponse = {
  count: number;
  connected?: boolean;
};

export async function fetchSupportEscalationCount(): Promise<SupportEscalationCountResponse> {
  const res = await fetch(apiUrl("/api/support/gmail/escalations/count"));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Escalation count failed (${res.status})`);
  }
  return (await res.json()) as SupportEscalationCountResponse;
}

/**
 * Ops/CEO sidebar badge for Support threads that need human attention.
 * Includes +1 while the first-time example escalation is still showing.
 */
export function useSupportEscalationCount(enabled: boolean) {
  const { pathname } = useLocation();
  const [count, setCount] = useState(0);
  const onSupport = isSupportPath(pathname);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let exampleExtra = 0;
    try {
      if (window.localStorage.getItem("fgg.support.exampleEscalation.dismissed") !== "1") {
        exampleExtra = 1;
      }
    } catch {
      exampleExtra = 1;
    }
    try {
      const data = await fetchSupportEscalationCount();
      setCount(Math.max(0, Number(data.count) || 0) + exampleExtra);
    } catch {
      setCount(exampleExtra);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh, onSupport]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("fgg-support-escalation-changed", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("fgg-support-escalation-changed", onFocus);
    };
  }, [enabled, refresh]);

  return { count, refresh };
}
