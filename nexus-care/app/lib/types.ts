import type { Place } from "./scenario";

export type ClinicId = string;

/** Static facts about a place (clinic or hospital). Comes from the scenario. */
export type ClinicProfile = Place;

/**
 * What a place declares about itself: a quantity for every typed-in resource
 * in the scenario (beds, staff, supplies...), plus a few fixed fields.
 */
export type StockReport = {
  quantities: Record<string, number>;
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

/** SMS triage: RED = go now, YELLOW = see a clinic today. Issued by the hub. */
export type TriageLevel = "RED" | "YELLOW";

export type AlertKind = "crisis" | "mass-casualty";

export type AlertData = {
  alert: AlertKind;
  resource: string | null;
  casualties: number | null;
  note: string;
};

export type EmergencyAlert = AlertData & { id: string; from: ClinicId; ts: number };

/** One SMS question and the patient's answer, in words. Built by the hub. */
export type TriageInput = { question: string; answer: string };

export type TriageTokenData = {
  code: string;
  level: TriageLevel;
  clinic: ClinicId | null; // null: patient's area not listed, any clinic may receive them
  area: string | null;
  summary: string;
  ambulance: boolean | null; // null: not asked, or the patient did not answer
  inputs: TriageInput[]; // every answer the patient gave by SMS
  expiresAt: number;
};

export type TriageToken = TriageTokenData & {
  id: string;
  issuedAt: number;
  arrived: { clinicId: ClinicId; at: number } | null;
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
    })
  | (EntryBase & { kind: "triage.token"; data: TriageTokenData })
   | (EntryBase & { kind: "alert.emergency"; data: AlertData })
  | (EntryBase & {
      kind: "triage.arrived";
      data: { tokenId: string; code: string };
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
  tokens: TriageToken[];
  alerts: EmergencyAlert[];
  pendingCount: number;
  sync: SyncState;
};