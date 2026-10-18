import { demoScenario } from "../scenario/demo";
import { createWorld } from "./network";
import { assertScenario, type Place, type ResourceDef } from "./scenario";
import type { StockReport } from "./types";

/**
 * The one place the app is pointed at a world. To use another scenario,
 * change this import. Validation runs once at startup and fails loudly.
 */
export const SCENARIO = assertScenario(demoScenario);

/** Travel times and network rules for the scenario above. */
export const WORLD = createWorld(SCENARIO);

export const PLACES: Place[] = SCENARIO.places;

/** Resources people type in (calculated ones, like occupancy, are excluded). */
export const INPUT_RESOURCES: ResourceDef[] = SCENARIO.resources.filter((r) => !r.percentOf);

/** Resources that can be moved between places (not occupancy or capacity). */
export const TRANSFER_RESOURCES = INPUT_RESOURCES.filter(
  (resource) =>
    resource.id !== SCENARIO.roles?.occupied &&
    resource.id !== SCENARIO.roles?.capacity
);

/** The place this tablet belongs to. Set per device in .env.local. */
const requested = process.env.NEXT_PUBLIC_CLINIC_ID;
export const LOCAL_CLINIC_ID: string =
  PLACES.find((p) => p.id === requested)?.id ??
  PLACES.find((p) => p.kind === "clinic")?.id ??
  PLACES[0].id;

/** Optional hub URL (FastAPI). Leave unset to run fully offline. */
export const SYNC_URL = process.env.NEXT_PUBLIC_SYNC_URL ?? "";

/**
 * Optional: also pull from the hub every N seconds while online. Off (0) by
 * default to save power and airtime; turn on where new reports must show up
 * unprompted, e.g. a front desk expecting SMS patients.
 */
export const SYNC_INTERVAL_SECONDS = Math.max(
  0,
  Number(process.env.NEXT_PUBLIC_SYNC_INTERVAL_SECONDS) || 0
);

export const ALERT_URL = process.env.NEXT_PUBLIC_ALERT_URL ?? SYNC_URL;

export const ALERT_POLL_SECONDS = Math.max(
  3,
  Number(process.env.NEXT_PUBLIC_ALERT_POLL_SECONDS) || 10
);

/** Load fictional demo data on first run. Set to "false" for real deployments. */
export const SEED_DEMO = process.env.NEXT_PUBLIC_SEED_DEMO !== "false";

export const EMPTY_REPORT: StockReport = {
  quantities: Object.fromEntries(INPUT_RESOURCES.map((r) => [r.id, 0])),
  online: false,
  notes: "",
};
