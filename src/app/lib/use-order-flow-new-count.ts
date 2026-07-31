import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { fetchOrderFlow } from "./order-flow";
import {
  loadSeenOrderKeys,
  orderFlowOrderKey,
  saveSeenOrderKeys,
} from "./order-flow-new-orders-storage";

const POLL_MS = 60_000;

function isOrderFlowPath(pathname: string): boolean {
  return pathname === "/order-flow" || pathname.startsWith("/order-flow/");
}

/**
 * Counts Shopify orders not yet "seen" in Order Flow.
 * Baselines on first run (no badge flood), clears while visiting Order Flow,
 * and polls so the ops sidebar can show +N until they open it.
 */
export function useOrderFlowNewCount(userKey: string | null | undefined) {
  const { pathname } = useLocation();
  const [count, setCount] = useState(0);
  const clearingRef = useRef(false);
  const onOrderFlow = isOrderFlowPath(pathname);

  const refresh = useCallback(async () => {
    if (!userKey) {
      setCount(0);
      return;
    }
    try {
      const data = await fetchOrderFlow({
        brand: "all",
        stage: "all",
        days: 90,
      });
      const openKeys = data.orders
        .filter((o) => o.stage !== "shipped")
        .map((o) => orderFlowOrderKey(o.brand, o.id));

      const seen = loadSeenOrderKeys(userKey);
      if (onOrderFlow || seen == null || clearingRef.current) {
        saveSeenOrderKeys(userKey, openKeys);
        clearingRef.current = false;
        setCount(0);
        return;
      }

      let unseen = 0;
      for (const key of openKeys) {
        if (!seen.has(key)) unseen += 1;
      }
      setCount(unseen);
    } catch {
      /* keep prior count if API briefly fails */
    }
  }, [userKey, onOrderFlow]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const clearBadge = useCallback(() => {
    clearingRef.current = true;
    setCount(0);
    void refresh();
  }, [refresh]);

  return { count, clearBadge, refresh };
}
