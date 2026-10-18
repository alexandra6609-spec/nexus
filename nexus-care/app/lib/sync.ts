import { ALERT_URL, LOCAL_CLINIC_ID, SYNC_URL } from "./directory";
import {
  getAllEntries,
  getCursor,
  getDeviceId,
  getPending,
  markSynced,
  mergeRemote,
  setCursor,
  setSync,
} from "./store";
import type { LedgerEntry } from "./types";

/**
 * A transport moves ledger entries somewhere. HTTP to the clinic hub is the
 * first one. A LoRa/serial bridge only has to implement the same two methods.
 * The ledger is idempotent, so a transport may retry or repeat freely.
 */
export type Transport = {
  /** Send entries; resolve with the ids the receiver now has. */
  push(entries: LedgerEntry[]): Promise<string[]>;
  /** Fetch entries after `cursor`. */
  pull(
    cursor: number,
    excludeDevice: string
  ): Promise<{ entries: unknown[]; cursor: number; more: boolean }>;
};

const TIMEOUT_MS = 8000;
const PUSH_CHUNK = 100; // small packets: friendly to slow links
const MAX_PULL_ROUNDS = 20;

export function httpTransport(baseUrl: string): Transport {
  const base = baseUrl.replace(/\/$/, "");

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(base + path, {
        ...init,
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error(`Hub answered ${response.status}`);
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async push(entries) {
      const result = await call<{ ids: string[] }>("/v1/ledger", {
        method: "POST",
        body: JSON.stringify({ entries }),
      });
      return result.ids;
    },
    pull(cursor, excludeDevice) {
      const query = new URLSearchParams({
        after: String(cursor),
        limit: "200",
        exclude_device: excludeDevice,
      });
      return call(`/v1/ledger?${query}`);
    },
  };
}

/** null when no hub is configured: the app simply stays fully offline. */
export function defaultTransport(): Transport | null {
  return SYNC_URL ? httpTransport(SYNC_URL) : null;
}

export async function sendUrgent(entry: LedgerEntry): Promise<boolean> {
  if (!ALERT_URL) return false;
  const transport = httpTransport(ALERT_URL);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const accepted = await transport.push([entry]);
      markSynced(accepted.filter((id) => id === entry.id));
      return accepted.includes(entry.id);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  return false;
}

export async function pullAlerts(): Promise<void> {
  if (!ALERT_URL) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${ALERT_URL.replace(/\/$/, "")}/v1/alerts?minutes=30`, {
      signal: controller.signal,
    });
    if (!response.ok) return;
    const body = (await response.json()) as { entries?: unknown };
    if (Array.isArray(body.entries)) mergeRemote(body.entries);
  } catch {
    // The normal sync will catch up when a link allows.
  } finally {
    clearTimeout(timer);
  }
}

let running = false;

/** One push-then-pull round. Never throws; the outcome lands in store state. */
export async function syncNow(
  transport: Transport,
  options: { includeRoutineStock?: boolean } = {}
) {
  if (running) return;
  running = true;
  setSync({ syncing: true, lastAttemptAt: Date.now(), error: null });

  try {
    const pending = getPending(options.includeRoutineStock);
    for (let i = 0; i < pending.length; i += PUSH_CHUNK) {
      const chunk = pending.slice(i, i + PUSH_CHUNK);
      const sent = new Set(chunk.map((entry) => entry.id));
      const accepted = await transport.push(chunk);
      markSynced(accepted.filter((id) => sent.has(id)));
    }

    let more = true;
    for (let round = 0; more && round < MAX_PULL_ROUNDS; round++) {
      const result = await transport.pull(getCursor(), getDeviceId());
      mergeRemote(result.entries);
      setCursor(result.cursor);
      more = result.more;
    }

    setSync({ syncing: false, lastSuccessAt: Date.now(), error: null });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "The hub did not answer in time."
        : "Could not reach the hub. Changes are safe on this device.";
    setSync({ syncing: false, error: message });
  } finally {
    running = false;
  }
}

// ------------------------------------------------- sneakernet / file bundles

const MAX_BUNDLE_CHARS = 5_000_000;

/** Everything on this device as one JSON file, for a supply truck or USB stick. */
export function exportBundle(): string {
  return JSON.stringify({
    v: 1,
    from: LOCAL_CLINIC_ID,
    exportedAt: Date.now(),
    entries: getAllEntries(),
  });
}

export function importBundle(text: string): { added: number; ignored: number } {
  if (text.length > MAX_BUNDLE_CHARS) throw new Error("That file is too large.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is not a Nexus Care bundle.");
  }
  const bundle = parsed as { v?: unknown; entries?: unknown };
  if (bundle.v !== 1 || !Array.isArray(bundle.entries)) {
    throw new Error("That file is not a Nexus Care bundle.");
  }
  const added = mergeRemote(bundle.entries);
  return { added, ignored: bundle.entries.length - added };
}
