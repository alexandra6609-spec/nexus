import {
  EMPTY_REPORT,
  INPUT_RESOURCES,
  PLACES,
  SCENARIO,
  TRANSFER_RESOURCES,
} from "./directory";
import { evaluatePlace } from "./levels";
import type {
  Clinic,
  ClinicProfile,
  EmergencyAlert,
  LedgerEntry,
  SmsMessage,
  SmsMessageData,
  StockReport,
  Transfer,
  TriageInput,
  TriageToken,
  TriageTokenData,
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

/** Stock reports at Low, Critical, or Urgent priority are eligible for auto-sync. */
export function isPriorityStockEntry(entry: LedgerEntry): boolean {
  if (entry.kind !== "stock.declared") return false;
  const place = PLACES.find((candidate) => candidate.id === entry.clinicId);
  if (!place) return false;
  const report = normalizeReport(entry.data);
  return evaluatePlace(SCENARIO, place, report.quantities, true).level > 0;
}

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

/** SMS answers as question/answer text. Skips anything that is not a pair of strings. */
function readInputs(value: unknown): TriageInput[] {
  if (!Array.isArray(value)) return [];
  const rows: TriageInput[] = [];
  for (const item of value.slice(0, 20)) {
    const row = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    if (typeof row.question === "string" && typeof row.answer === "string") {
      rows.push({ question: row.question.slice(0, 80), answer: row.answer.slice(0, 200) });
    }
  }
  return rows;
}

/** Token data comes from the hub over the air: check it like any outside input. */
function readAlert(data: unknown): Omit<EmergencyAlert, "id" | "from" | "ts"> | null {
  const d = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  if (d.alert !== "crisis" && d.alert !== "mass-casualty") return null;
  return {
    alert: d.alert,
    resource: typeof d.resource === "string" ? d.resource.slice(0, 32) : null,
    casualties:
      typeof d.casualties === "number" && Number.isFinite(d.casualties) && d.casualties > 0
        ? Math.min(Math.floor(d.casualties), 500)
        : null,
    note: typeof d.note === "string" ? d.note.slice(0, 120) : "",
  };
}
function readToken(data: unknown): TriageTokenData | null {
  const d = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  if (typeof d.code !== "string" || (d.level !== "RED" && d.level !== "YELLOW")) return null;
  return {
    code: d.code,
    level: d.level,
    clinic: typeof d.clinic === "string" ? d.clinic : null,
    area: typeof d.area === "string" ? d.area : null,
    summary: typeof d.summary === "string" ? d.summary : "",
    ambulance: typeof d.ambulance === "boolean" ? d.ambulance : null,
    inputs: readInputs(d.inputs),
    expiresAt: typeof d.expiresAt === "number" ? d.expiresAt : 0,
  };
}

function readSmsMessage(data: unknown): SmsMessageData | null {
  const d = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  if (
    typeof d.conversationId !== "string" ||
    typeof d.messageId !== "string" ||
    typeof d.phoneHash !== "string" ||
    (d.direction !== "inbound" && d.direction !== "outbound") ||
    typeof d.body !== "string" ||
    !Number.isInteger(d.part)
  ) {
    return null;
  }
  return {
    conversationId: d.conversationId.slice(0, 128),
    messageId: d.messageId.slice(0, 128),
    replyTo: typeof d.replyTo === "string" ? d.replyTo.slice(0, 128) : null,
    phoneHash: d.phoneHash.slice(0, 64),
    direction: d.direction,
    part: Math.max(0, Math.floor(d.part as number)),
    body: d.body.slice(0, 1600),
  };
}

/** Fold the ledger into what the screens show. Pure, so it is easy to test. */
export function deriveState(
  entries: Iterable<LedgerEntry>,
  directory: ClinicProfile[] = PLACES
): {
  clinics: Clinic[];
  transfers: Transfer[];
  tokens: TriageToken[];
  smsMessages: SmsMessage[];
  alerts: EmergencyAlert[];
} {
  const latestStock = new Map<string, StockEntry>();
  const transfers = new Map<string, Transfer>();
  const statusUpdates: Extract<LedgerEntry, { kind: "transfer.status" }>[] = [];
  const supplyTransfers: Extract<LedgerEntry, { kind: "supply.transferred" }>[] = [];
  const fulfilledRequestIds = new Set<string>();
  const fulfilledAlertIds = new Set<string>();
  const tokens = new Map<string, TriageToken>();
  const smsMessages: SmsMessage[] = [];
  const arrivals: Extract<LedgerEntry, { kind: "triage.arrived" }>[] = [];
  const alerts: EmergencyAlert[] = [];

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
    } else if (entry.kind === "supply.transferred") {
      supplyTransfers.push(entry);
      if (entry.data.requestId) fulfilledRequestIds.add(entry.data.requestId);
      if (entry.data.alertId) fulfilledAlertIds.add(entry.data.alertId);
    } else if (entry.kind === "triage.token") {
      const data = readToken(entry.data);
      if (data) tokens.set(entry.id, { ...data, id: entry.id, issuedAt: entry.ts, arrived: null });
    } else if (entry.kind === "sms.message") {
      const data = readSmsMessage(entry.data);
      if (data) {
        smsMessages.push({
          ...data,
          id: entry.id,
          clinicId: entry.clinicId,
          ts: entry.ts,
          sequence: entry.lc,
        });
      }
    } else if (entry.kind === "triage.arrived") {
      arrivals.push(entry);
    } else if (entry.kind === "alert.emergency") {
      const data = readAlert(entry.data);
      if (data) alerts.push({ ...data, id: entry.id, from: entry.clinicId, ts: entry.ts });
    }
  }

  // First recorded arrival wins, so two desks marking the same patient agree.
  arrivals.sort(compareEntries);
  for (const arrival of arrivals) {
    const token = tokens.get(arrival.data.tokenId);
    if (token && !token.arrived) token.arrived = { clinicId: arrival.clinicId, at: arrival.ts };
  }

  statusUpdates.sort(compareEntries);
  for (const update of statusUpdates) {
    const transfer = transfers.get(update.data.transferId);
    if (transfer) transfer.status = update.data.status;
  }

  for (const requestId of fulfilledRequestIds) {
    const transfer = transfers.get(requestId);
    if (transfer) transfer.status = "Confirmed";
  }

  const clinics: Clinic[] = directory.map((profile) => {
    const entry = latestStock.get(profile.id);
    const report: StockReport = entry
      ? normalizeReport(entry.data)
      : { ...EMPTY_REPORT, quantities: { ...EMPTY_REPORT.quantities } };
    return { ...profile, ...report, updatedAt: entry ? entry.ts : null };
  });

  const clinicsById = new Map(clinics.map((clinic) => [clinic.id, clinic]));
  supplyTransfers.sort(compareEntries);
  for (const transfer of supplyTransfers) {
    const { from, to, resource, quantity } = transfer.data;
    const sender = clinicsById.get(from);
    const receiver = clinicsById.get(to);
    const senderReport = latestStock.get(from);
    const receiverReport = latestStock.get(to);
    const afterSenderReport = !senderReport || compareEntries(transfer, senderReport) > 0;
    const afterReceiverReport = !receiverReport || compareEntries(transfer, receiverReport) > 0;

    if (sender && afterSenderReport) {
      sender.quantities[resource] = Math.max(0, (sender.quantities[resource] ?? 0) - quantity);
      sender.updatedAt = Math.max(sender.updatedAt ?? 0, transfer.ts);
    }
    if (receiver && afterReceiverReport) {
      receiver.quantities[resource] = (receiver.quantities[resource] ?? 0) + quantity;
      receiver.updatedAt = Math.max(receiver.updatedAt ?? 0, transfer.ts);
    }
  }

  return {
    clinics,
    transfers: [...transfers.values()].sort(
      (a, b) => b.createdAt - a.createdAt
    ),
    tokens: [...tokens.values()].sort(
      (a, b) =>
        Number(b.level === "RED") - Number(a.level === "RED") ||
        Number(b.ambulance === true) - Number(a.ambulance === true) ||
        b.issuedAt - a.issuedAt
    ),
    smsMessages: smsMessages.sort(
      (a, b) => a.ts - b.ts || a.sequence - b.sequence || a.id.localeCompare(b.id)
    ),
    alerts: alerts
      .map((alert) => ({ ...alert, fulfilled: fulfilledAlertIds.has(alert.id) }))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 20),
  };
}

const KINDS = [
  "stock.declared",
  "transfer.requested",
  "transfer.status",
  "supply.transferred",
  "triage.token",
  "sms.message",
  "triage.arrived",
  "alert.emergency",
];

/** Shape check for entries arriving from outside (hub, radio, USB file). */
export function isLedgerEntry(value: unknown): value is LedgerEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  const validBase =
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
    e.data !== null;
  if (!validBase) return false;
  if (e.kind === "sms.message") {
    const data = readSmsMessage(e.data);
    return data !== null;
  }
  if (e.kind !== "supply.transferred") return true;
  const data = e.data as Record<string, unknown>;
  return (
    typeof data.from === "string" &&
    typeof data.to === "string" &&
    TRANSFER_RESOURCES.some((resource) => resource.id === data.resource) &&
    Number.isInteger(data.quantity) &&
    (data.quantity as number) > 0 &&
    (data.requestId === undefined || typeof data.requestId === "string") &&
    (data.alertId === undefined || typeof data.alertId === "string")
  );
}