"use client";

import { useCallback, useEffect, useRef } from "react";

export function usePollingRefresh(
  refresh: () => void | Promise<void>,
  intervalMs = 60_000,
): { markRan: () => void } {
  const refreshRef = useRef(refresh);
  const lastRun = useRef(0);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    lastRun.current = Date.now();
    const run = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRun.current < intervalMs / 2) return;
      lastRun.current = now;
      void refreshRef.current();
    };
    const id = setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
    };
  }, [intervalMs]);

  const markRan = useCallback(() => {
    lastRun.current = Date.now();
  }, []);
  return { markRan };
}
