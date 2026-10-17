import { SCENARIO } from "./directory";
import type { StoredEntry } from "./types";

const MINUTE = 60_000;

/**
 * Fictional first-run data, read from the scenario and entered through the
 * same ledger shape as real reports. Marked synced so it never goes out as real.
 */
export function demoEntries(): StoredEntry[] {
  const seed = SCENARIO.seed;
  if (!seed) return [];
  const now = Date.now();
  const ids = Object.keys(seed.stock);

  const stock: StoredEntry[] = ids.map((id, index) => {
    const report = seed.stock[id];
    return {
      id: `seed-${id}`,
      clinicId: id,
      device: "seed",
      lc: index + 1,
      ts: now - report.minutesAgo * MINUTE,
      kind: "stock.declared",
      data: {
        quantities: { ...report.quantities },
        online: report.online,
        notes: report.notes ?? "",
      },
      synced: 1,
    };
  });

  const transfers: StoredEntry[] = (seed.transfers ?? []).map((t, index) => ({
    id: `seed-transfer-${index + 1}`,
    clinicId: t.from,
    device: "seed",
    lc: ids.length + index + 1,
    ts: now - t.minutesAgo * MINUTE,
    kind: "transfer.requested",
    data: { from: t.from, to: t.to, reason: t.reason },
    synced: 1,
  }));

  return [...stock, ...transfers];
}
