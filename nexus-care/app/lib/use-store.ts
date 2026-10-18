"use client";

import { useEffect, useSyncExternalStore } from "react";
import { SYNC_INTERVAL_SECONDS } from "./directory";
import { defaultTransport, syncNow } from "./sync";
import { ensureInit, getServerState, getState, subscribe } from "./store";

/** Subscribe a component to the local store. Starts the on-device database once. */
export function useStore() {
  useEffect(() => {
    void ensureInit();
  }, []);
  return useSyncExternalStore(subscribe, getState, getServerState);
}

/**
 * Sync when something happens:
 *   - the device comes back online, or the app is brought back on screen
 *   - new local changes exist (one attempt after a short pause, so a burst of
 *     edits becomes a single radio wake-up)
 * A failed attempt waits for the next event instead of retrying in a loop.
 * A timer runs only if NEXT_PUBLIC_SYNC_INTERVAL_SECONDS is set.
 */
export function useAutoSync(autoPendingCount: number) {
  useEffect(() => {
    const transport = defaultTransport();
    if (!transport) return;
    const run = () => {
      if (navigator.onLine) void syncNow(transport);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    const timer =
      SYNC_INTERVAL_SECONDS > 0 ? setInterval(run, SYNC_INTERVAL_SECONDS * 1000) : undefined;
    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const transport = defaultTransport();
    if (!transport || autoPendingCount === 0 || !navigator.onLine) return;
    const timer = setTimeout(() => void syncNow(transport), 3000);
    return () => clearTimeout(timer);
  }, [autoPendingCount]);
}
