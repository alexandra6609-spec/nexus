import { CLINIC_DIRECTORY } from "./directory";
import type { StockReport, StoredEntry } from "./types";

const at = (hour: number, minute: number) =>
  new Date(2026, 9, 17, hour, minute).getTime();

const demo: Record<string, { report: StockReport; ts: number }> = {
  A: {
    ts: at(8, 30),
    report: {
      patients: 28, capacity: 24, staff: 3, oxygen: 2, fluids: 8,
      antivenom: 0, online: false,
      notes: "Antivenom unavailable. Request stock confirmation.",
    },
  },
  B: {
    ts: at(9, 10),
    report: {
      patients: 18, capacity: 30, staff: 5, oxygen: 12, fluids: 48,
      antivenom: 8, online: true, notes: "",
    },
  },
  C: {
    ts: at(9, 5),
    report: {
      patients: 27, capacity: 30, staff: 4, oxygen: 4, fluids: 12,
      antivenom: 8, online: true, notes: "",
    },
  },
  D: {
    ts: at(9, 15),
    report: {
      patients: 12, capacity: 20, staff: 3, oxygen: 8, fluids: 32,
      antivenom: 8, online: true, notes: "",
    },
  },
  E: {
    ts: at(9, 20),
    report: {
      patients: 32, capacity: 40, staff: 7, oxygen: 14, fluids: 60,
      antivenom: 8, online: true, notes: "",
    },
  },
};

/** Fictional first-run data. Marked synced so it never goes out as real. */
export function demoEntries(): StoredEntry[] {
  const stock: StoredEntry[] = CLINIC_DIRECTORY.map((clinic, index) => ({
    id: `seed-${clinic.id}`,
    clinicId: clinic.id,
    device: "seed",
    lc: index + 1,
    ts: demo[clinic.id].ts,
    kind: "stock.declared",
    data: demo[clinic.id].report,
    synced: 1,
  }));

  const transfer: StoredEntry = {
    id: "seed-transfer-1",
    clinicId: "A",
    device: "seed",
    lc: 10,
    ts: at(8, 35),
    kind: "transfer.requested",
    data: { from: "A", to: "B", reason: "Capacity check required" },
    synced: 1,
  };

  return [...stock, transfer];
}
