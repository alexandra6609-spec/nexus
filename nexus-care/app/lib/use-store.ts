"use client";

import { useEffect, useSyncExternalStore } from "react";
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
 * Sync only when something happens, never on a timer:
 *   - the device comes back online
 *   - new local changes exist (one attempt after a short pause, so a burst of
 *     edits becomes a single radio wake-up)
 * A failed attempt waits for the next event instead of retrying in a loop.
 */
export function useAutoSync(pendingCount: number) {
  useEffect(() => {
    const transport = defaultTransport();
    if (!transport) return;
    const run = () => {
      if (navigator.onLine) void syncNow(transport);
    };
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, []);

  useEffect(() => {
    const transport = defaultTransport();
    if (!transport || pendingCount === 0 || !navigator.onLine) return;
    const timer = setTimeout(() => void syncNow(transport), 3000);
    return () => clearTimeout(timer);
  }, [pendingCount]);
}
