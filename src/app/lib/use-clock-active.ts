import { useEffect, useState } from "react";
import { getActiveSession } from "./time-clock-storage";

/** True when the signed-in user has an open clock session. */
export function useClockActive(userId: string | null | undefined): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setActive(Boolean(userId && getActiveSession(userId)));
    };
    refresh();
    window.addEventListener("fgg-time-clock-changed", refresh);
    window.addEventListener("fgg-storage-sync", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("fgg-time-clock-changed", refresh);
      window.removeEventListener("fgg-storage-sync", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [userId]);

  return active;
}
