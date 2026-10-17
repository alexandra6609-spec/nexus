export type ClinicId = string;

/** Static facts about a clinic. Shipped with the app, never edited at runtime. */
export type ClinicProfile = {
  id: ClinicId;
  name: string;
  region: string;
};

/** What a clinic declares about itself. This is the only thing clinics edit. */
export type StockReport = {
  patients: number;
  capacity: number;
  staff: number;
  oxygen: number;
  fluids: number;
  antivenom: number;
  online: boolean;
  notes: string;
};

/** Profile + latest known report. `updatedAt` is null until a report exists. */
export type Clinic = ClinicProfile &
  StockReport & {
    updatedAt: number | null;
  };

export type TransferStatus = "Pending confirmation" | "Confirmed" | "Declined";

export type Transfer = {
  id: string;
  from: ClinicId;
  to: ClinicId;
  reason: string;
  status: TransferStatus;
  createdAt: number;
};

/**
 * Ledger entries are immutable and globally unique by `id`, so merging two
 * ledgers is a set union. Duplicates (same id) are ignored, which makes every
 * transport (HTTP, LoRa, sneakernet file) safe to retry or repeat.
 */
type EntryBase = {
  id: string; // `${device}-${time}-${rand}`
  clinicId: ClinicId; // who authored it
  device: string; // which tablet authored it
  lc: number; // Lamport clock: orders conflicting edits without trusting wall clocks
  ts: number; // wall clock ms, display only
};

export type LedgerEntry =
  | (EntryBase & { kind: "stock.declared"; data: StockReport })
  | (EntryBase & {
      kind: "transfer.requested";
      data: { from: ClinicId; to: ClinicId; reason: string };
    })
  | (EntryBase & {
      kind: "transfer.status";
      data: { transferId: string; status: TransferStatus };
    });

/** What is stored locally: the entry plus whether the hub has acknowledged it. */
export type StoredEntry = LedgerEntry & { synced: 0 | 1 };

export type SyncState = {
  syncing: boolean;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  error: string | null;
};

export type StoreState = {
  ready: boolean; // false only until the on-device database has been read
  storageOk: boolean; // false if the browser refused to persist (e.g. private mode)
  deviceId: string;
  clinics: Clinic[];
  transfers: Transfer[];
  pendingCount: number;
  sync: SyncState;
};
