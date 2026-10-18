import { LOCAL_CLINIC_ID, SEED_DEMO, TRANSFER_RESOURCES } from "./directory";
import { deriveState, isLedgerEntry, isPriorityStockEntry } from "./ledger";
import * as db from "./local-db";
import { demoEntries } from "./seed";
import type {
  AlertData,
  ClinicId,
  LedgerEntry,
  StockReport,
  StoreState,
  StoredEntry,
  SyncState,
  TransferStatus,
  TriageToken,
} from "./types";

/**
 * Local-first store.
 *
 * The screen reads from memory. Every write updates memory and notifies the
 * UI in the same tick; saving to disk and talking to a hub happen afterwards
 * and can fail without the screen ever noticing. Nothing here waits on a
 * server, and nothing here polls.
 */

const entries = new Map<string, StoredEntry>();
const listeners = new Set<() => void>();

let lamport = 0;
let deviceId = "";
let cursor = 0;

const idleSync: SyncState = {
  syncing: false,
  lastAttemptAt: null,
  lastSuccessAt: null,
  error: null,
};

/** Rendered on the server and for the first client paint: no data yet. */
const initialState: StoreState = {
  ready: false,
  storageOk: true,
  deviceId: "",
  ...deriveState([]),
  pendingCount: 0,
  autoPendingCount: 0,
  sync: idleSync,
};

let state: StoreState = initialState;

export const getState = () => state;
export const getServerState = () => initialState;

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(patch: Partial<StoreState> = {}) {
  let pendingCount = 0;
  let autoPendingCount = 0;
  for (const entry of entries.values()) {
    if (entry.synced !== 0) continue;
    pendingCount++;
    if (entry.kind !== "stock.declared" || isPriorityStockEntry(entry)) {
      autoPendingCount++;
    }
  }
  state = {
    ...state,
    ...patch,
    ...deriveState(entries.values()),
    deviceId,
    pendingCount,
    autoPendingCount,
  };
  listeners.forEach((listener) => listener());
}

function randomId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return (uuid ?? Math.random().toString(36).slice(2)).replace(/-/g, "").slice(0, 8);
}

function loadDeviceId() {
  try {
    const saved = localStorage.getItem("nexus.device");
    if (saved) return saved;
    const fresh = randomId();
    localStorage.setItem("nexus.device", fresh);
    return fresh;
  } catch {
    return randomId();
  }
}

/** Fire and forget: disk problems flip a flag, they never block the screen. */
function persist(list: StoredEntry[]) {
  db.putEntries(list)
    .then(() => {
      if (!state.storageOk) publish({ storageOk: true });
    })
    .catch(() => publish({ storageOk: false }));
}

// ---------------------------------------------------------------- startup

let initPromise: Promise<void> | null = null;

export function ensureInit() {
  if (!initPromise) initPromise = init();
  return initPromise;
}

async function init() {
  deviceId = loadDeviceId();
  let storageOk = true;
  let lastSuccessAt: number | null = null;

  try {
    const stored = await db.loadAllEntries();
    if (stored.length === 0 && SEED_DEMO) {
      const seed = demoEntries();
      await db.putEntries(seed);
      stored.push(...seed);
    }
    for (const entry of stored) entries.set(entry.id, entry);
    cursor = (await db.getMeta<number>("cursor")) ?? 0;
    lastSuccessAt = (await db.getMeta<number>("lastSuccessAt")) ?? null;
  } catch {
    // No usable storage: run from memory so the clinic can still work today.
    storageOk = false;
    if (SEED_DEMO) for (const entry of demoEntries()) entries.set(entry.id, entry);
  }

  for (const entry of entries.values()) lamport = Math.max(lamport, entry.lc);
  publish({
    ready: true,
    storageOk,
    sync: { ...idleSync, lastSuccessAt },
  });
}

// ----------------------------------------------------------------- writes

function author<K extends LedgerEntry["kind"]>(
  kind: K,
  data: Extract<LedgerEntry, { kind: K }>["data"]
): StoredEntry {
  lamport += 1;
  const now = Date.now();
  return {
    id: `${deviceId}-${now.toString(36)}-${randomId().slice(0, 4)}`,
    clinicId: LOCAL_CLINIC_ID,
    device: deviceId,
    lc: lamport,
    ts: now,
    kind,
    data,
    synced: 0,
  } as StoredEntry;
}

function commit(entry: StoredEntry) {
  entries.set(entry.id, entry);
  publish(); // the screen updates now
  persist([entry]); // the disk catches up
}

/** This clinic declares its own stock. Peers' records are never edited here. */
export async function declareStock(report: StockReport) {
  await ensureInit(); // resolves instantly after startup
  commit(author("stock.declared", { ...report }));
}

export async function requestTransfer(to: ClinicId, reason: string) {
  await ensureInit();
  commit(author("transfer.requested", { from: LOCAL_CLINIC_ID, to, reason }));
}

export async function setTransferStatus(
  transferId: string,
  status: TransferStatus
) {
  await ensureInit();
  commit(author("transfer.status", { transferId, status }));
}

export async function transferSupply(
  to: ClinicId,
  resource: string,
  quantity = 1,
  links: { requestId?: string; alertId?: string } = {}
): Promise<LedgerEntry> {
  await ensureInit();
  if (to === LOCAL_CLINIC_ID) throw new Error("Choose a different clinic to receive the supply.");
  if (!TRANSFER_RESOURCES.some((item) => item.id === resource)) {
    throw new Error("That resource cannot be transferred.");
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Transfer quantity must be a positive whole number.");
  }
  const sender = state.clinics.find((clinic) => clinic.id === LOCAL_CLINIC_ID);
  const available = sender?.quantities[resource] ?? 0;
  if (available < quantity) throw new Error("Not enough reported stock to fulfill this transfer.");

  const entry = author("supply.transferred", {
    from: LOCAL_CLINIC_ID,
    to,
    resource,
    quantity,
    ...links,
  });
  commit(entry);
  return strip(entry);
}

export async function sendEmergency(data: AlertData): Promise<LedgerEntry> {
  await ensureInit();
  const entry = author("alert.emergency", data);
  commit(entry);
  return strip(entry);
}

/** A patient with an SMS token has arrived at this clinic's desk. */
export async function markArrived(token: TriageToken) {
  await ensureInit();
  commit(author("triage.arrived", { tokenId: token.id, code: token.code }));
}

// ------------------------------------------------------------ sync support

const strip = ({ synced: _synced, ...entry }: StoredEntry): LedgerEntry =>
  entry as LedgerEntry;

/** Own entries the hub has not acknowledged yet. */
export function getPending(includeRoutineStock = false): LedgerEntry[] {
  return [...entries.values()]
    .filter(
      (entry) =>
        entry.synced === 0 &&
        (includeRoutineStock ||
          entry.kind !== "stock.declared" ||
          isPriorityStockEntry(entry))
    )
    .map(strip);
}

/** Everything on this device. A relay (truck, radio) can carry other clinics' data too. */
export function getAllEntries(): LedgerEntry[] {
  return [...entries.values()].map(strip);
}

export function markSynced(ids: string[]) {
  const done: string[] = [];
  for (const id of ids) {
    const entry = entries.get(id);
    if (entry && entry.synced === 0) {
      entries.set(id, { ...entry, synced: 1 });
      done.push(id);
    }
  }
  if (done.length === 0) return;
  publish();
  db.markEntriesSynced(done).catch(() => publish({ storageOk: false }));
}

/**
 * Merge entries from anywhere (hub, radio packet, USB bundle). Idempotent:
 * known ids and malformed entries are skipped. Returns how many were new.
 */
export function mergeRemote(incoming: unknown[]): number {
  const fresh: StoredEntry[] = [];
  for (const raw of incoming) {
    if (!isLedgerEntry(raw) || entries.has(raw.id)) continue;
    const entry = {
      id: raw.id,
      clinicId: raw.clinicId,
      device: raw.device,
      lc: raw.lc,
      ts: raw.ts,
      kind: raw.kind,
      data: raw.data,
      synced: 1,
    } as StoredEntry;
    entries.set(entry.id, entry);
    lamport = Math.max(lamport, entry.lc); // Lamport rule: never fall behind what we have seen
    fresh.push(entry);
  }
  if (fresh.length > 0) {
    publish();
    persist(fresh);
  }
  return fresh.length;
}

export const getCursor = () => cursor;
export const getDeviceId = () => deviceId;

export function setCursor(value: number) {
  cursor = value;
  db.setMeta("cursor", value).catch(() => undefined);
}

export function setSync(patch: Partial<SyncState>) {
  publish({ sync: { ...state.sync, ...patch } });
  if (patch.lastSuccessAt) {
    db.setMeta("lastSuccessAt", patch.lastSuccessAt).catch(() => undefined);
  }
}
