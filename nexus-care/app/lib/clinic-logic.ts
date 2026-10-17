import { SCENARIO, WORLD } from "./directory";
import { evaluatePlace, type PlaceStatus } from "./levels";
import type { Clinic } from "./types";

// Beds. Which resources mean "occupied" and "capacity" is set in the scenario.

export function occupied(clinic: Clinic) {
  return SCENARIO.roles ? clinic.quantities[SCENARIO.roles.occupied] ?? 0 : 0;
}

export function bedCapacity(clinic: Clinic) {
  return SCENARIO.roles ? clinic.quantities[SCENARIO.roles.capacity] ?? 0 : 0;
}

export function occupancy(clinic: Clinic) {
  const capacity = bedCapacity(clinic);
  if (capacity <= 0) return 0;
  return Math.round((occupied(clinic) / capacity) * 100);
}

export function freeBeds(clinic: Clinic) {
  return Math.max(0, bedCapacity(clinic) - occupied(clinic));
}

/** Priority of a place, judged by the scenario's bands for each resource. */
export function statusOf(clinic: Clinic): PlaceStatus {
  return evaluatePlace(SCENARIO, clinic, clinic.quantities, clinic.updatedAt !== null);
}

export function needsAttention(clinic: Clinic) {
  return statusOf(clinic).level >= SCENARIO.attentionLevel;
}

export function kindLabel(clinic: { kind: string }) {
  return clinic.kind === "hospital" ? "Hospital" : "Clinic";
}

export function formatValue(value: number | null, percent: boolean) {
  if (value === null) return "n/a";
  return percent ? `${value}%` : String(value);
}

export function formatMinutes(minutes: number) {
  if (!Number.isFinite(minutes)) return "no route";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Travel time from this device's place to another, as text. */
export function travelFrom(fromId: string, toId: string) {
  return formatMinutes(WORLD.minutes(fromId, toId));
}

export function formatTime(timestamp: number | null) {
  if (timestamp === null) return "No report yet";
  return new Date(timestamp).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

/** Offline data ages. Flag peer reports older than six hours. */
export function isStale(updatedAt: number | null) {
  return updatedAt === null || Date.now() - updatedAt > STALE_AFTER_MS;
}
