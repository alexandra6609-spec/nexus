import type { Clinic } from "./types";

export function occupancy(clinic: Clinic) {
  if (clinic.capacity <= 0) return 0;
  return Math.round((clinic.patients / clinic.capacity) * 100);
}

export function freeBeds(clinic: Clinic) {
  return Math.max(0, clinic.capacity - clinic.patients);
}

export function clinicStatus(clinic: Clinic) {
  if (clinic.capacity > 0 && clinic.patients >= clinic.capacity) {
    return "At Capacity";
  }
  if (occupancy(clinic) >= 75) return "Busy";
  return "Available";
}

export function supplyStatus(quantity: number, lowThreshold: number) {
  if (quantity <= 0) return "Out";
  if (quantity <= lowThreshold) return "Low";
  return "Stocked";
}

export function supplyColor(status: string) {
  if (status === "Out") return "text-red-700 bg-red-50";
  if (status === "Low") return "text-amber-800 bg-amber-50";
  return "text-emerald-700 bg-emerald-50";
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
