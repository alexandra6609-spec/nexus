import type { ClinicProfile, StockReport } from "./types";

/** The clinic this tablet belongs to. Set per device in .env.local. */
export const LOCAL_CLINIC_ID = process.env.NEXT_PUBLIC_CLINIC_ID ?? "A";

/** Optional hub URL (FastAPI). Leave unset to run fully offline. */
export const SYNC_URL = process.env.NEXT_PUBLIC_SYNC_URL ?? "";

/** Load fictional demo data on first run. Set to "false" for real deployments. */
export const SEED_DEMO = process.env.NEXT_PUBLIC_SEED_DEMO !== "false";

export const CLINIC_DIRECTORY: ClinicProfile[] = [
  { id: "A", name: "North Outpost", region: "Northern District" },
  { id: "B", name: "East Outpost", region: "Eastern District" },
  { id: "C", name: "South Outpost", region: "Southern District" },
  { id: "D", name: "West Outpost", region: "Western District" },
  { id: "E", name: "Central Outpost", region: "Central District" },
];

export const EMPTY_REPORT: StockReport = {
  patients: 0,
  capacity: 0,
  staff: 0,
  oxygen: 0,
  fluids: 0,
  antivenom: 0,
  online: false,
  notes: "",
};

/** "Low" thresholds per supply. One place to change them. */
export const LOW_STOCK = { oxygen: 2, fluids: 8, antivenom: 2 } as const;
