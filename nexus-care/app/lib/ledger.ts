import { EMPTY_REPORT, INPUT_RESOURCES, PLACES } from "./directory";
import type {
  Clinic,
  ClinicProfile,
  LedgerEntry,
  StockReport,
  Transfer,
} from "./types";

/**
 * Total order for conflicting edits: Lamport clock first, device id as a
 * deterministic tiebreak. Every tablet that sees the same entries computes
 * the same winner, with no server involved.
 */
export function compareEntries(a: LedgerEntry, b: LedgerEntry) {
  if (a.lc !== b.lc) return a.lc - b.lc;
  if (a.device !== b.device) return a.device < b.device ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

type StockEntry = Extract<LedgerEntry, { kind: "stock.declared" }>;

/**
 * Entries come from other tablets, files and older versions of this app, so
 * never trust their shape. Keeps only resources this scenario knows about and
 * fills gaps with zero. Also reads the old flat format (oxygen: 3, ...).
 */
export function normalizeReport(data: unknown): StockReport {
  const raw = (typeof data === "object" && data !== null ? data : {}) as Record<
    string,
    unknown
  >;
  const source =
    typeof raw.quantities === "object" && raw.quantities !== null
      ? (raw.quantities as Record<string, unknown>)
      : raw;
  const quantities: Record<string, number> = {};
  for (const resource of INPUT_RESOURCES) {
    const value = source[resource.id];
    quantities[resource.id] =
      typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  }
  return {
    quantities,
    online: raw.online === true,
    notes: typeof raw.notes === "string" ? raw.notes : "",
  };
}

/** Fold the ledger into what the screens show. Pure, so it is easy to test. */
export function deriveState(
  entries: Iterable<LedgerEntry>,
  directory: ClinicProfile[] = PLACES
): { clinics: Clinic[]; transfers: Transfer[] } {
  const latestStock = new Map<string, StockEntry>();
  const transfers = new Map<string, Transfer>();
  const statusUpdates: Extract<LedgerEntry, { kind: "transfer.status" }>[] = [];

  for (const entry of entries) {
    if (entry.kind === "stock.declared") {
      const current = latestStock.get(entry.clinicId);
      if (!current || compareEntries(entry, current) > 0) {
        latestStock.set(entry.clinicId, entry);
      }
    } else if (entry.kind === "transfer.requested") {
      transfers.set(entry.id, {
        id: entry.id,
        from: entry.data.from,
        to: entry.data.to,
        reason: entry.data.reason,
        status: "Pending confirmation",
        createdAt: entry.ts,
      });
    } else if (entry.kind === "transfer.status") {
      statusUpdates.push(entry);
    }
  }

  statusUpdates.sort(compareEntries);
  for (const update of statusUpdates) {
    const transfer = transfers.get(update.data.transferId);
    if (transfer) transfer.status = update.data.status;
  }

  const clinics: Clinic[] = directory.map((profile) => {
    const entry = latestStock.get(profile.id);
    const report: StockReport = entry ? normalizeReport(entry.data) : EMPTY_REPORT;
    return { ...profile, ...report, updatedAt: entry ? entry.ts : null };
  });

  return {
    clinics,
    transfers: [...transfers.values()].sort(
      (a, b) => b.createdAt - a.createdAt
    ),
  };
}

const KINDS = ["stock.declared", "transfer.requested", "transfer.status"];

/** Shape check for entries arriving from outside (hub, radio, USB file). */
export function isLedgerEntry(value: unknown): value is LedgerEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    e.id.length > 0 &&
    e.id.length <= 64 &&
    typeof e.clinicId === "string" &&
    typeof e.device === "string" &&
    Number.isFinite(e.lc) &&
    Number.isFinite(e.ts) &&
    typeof e.kind === "string" &&
    KINDS.includes(e.kind) &&
    typeof e.data === "object" &&
    e.data !== null
  );
}
