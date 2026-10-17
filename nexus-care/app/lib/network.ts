import type { Scenario } from "./scenario";

export type Reach = { id: string; minutes: number };

/** Shortest travel time between every pair of places (Floyd–Warshall). */
export function travelTimes(scenario: Scenario): Record<string, Record<string, number>> {
  const ids = scenario.places.map((p) => p.id);
  const d: Record<string, Record<string, number>> = {};
  for (const a of ids) {
    d[a] = {};
    for (const b of ids) d[a][b] = a === b ? 0 : Infinity;
  }
  for (const road of scenario.roads) {
    d[road.a][road.b] = Math.min(d[road.a][road.b], road.minutes);
    if (!road.oneWay) d[road.b][road.a] = Math.min(d[road.b][road.a], road.minutes);
  }
  for (const k of ids) {
    for (const i of ids) {
      for (const j of ids) {
        if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
      }
    }
  }
  return d;
}

/**
 * Map rules, computed from the scenario and nothing else.
 *
 *   clinic network   every other clinic closer than the clinic's nearest
 *                    hospital (or its own `networkRadius`). Not symmetric: A can
 *                    be in B's network without B being in A's.
 *   hospital network the clinics for which it is the nearest hospital.
 */
export function createWorld(scenario: Scenario) {
  const time = travelTimes(scenario);
  const place = new Map(scenario.places.map((p) => [p.id, p]));

  const minutes = (from: string, to: string) => time[from]?.[to] ?? Infinity;

  function nearestHospital(id: string): Reach | null {
    let best: Reach | null = null;
    for (const other of scenario.places) {
      if (other.kind !== "hospital" || other.id === id) continue;
      const m = minutes(id, other.id);
      if (Number.isFinite(m) && (!best || m < best.minutes)) best = { id: other.id, minutes: m };
    }
    return best;
  }

  function networkOf(id: string): Reach[] {
    const self = place.get(id);
    if (!self) return [];
    const reach: Reach[] = [];

    if (self.kind === "hospital") {
      for (const other of scenario.places) {
        if (other.kind === "clinic" && nearestHospital(other.id)?.id === id) {
          reach.push({ id: other.id, minutes: minutes(id, other.id) });
        }
      }
    } else {
      const radius = self.networkRadius ?? nearestHospital(id)?.minutes ?? Infinity;
      for (const other of scenario.places) {
        if (other.kind !== "clinic" || other.id === id) continue;
        const m = minutes(id, other.id);
        if (Number.isFinite(m) && m < radius) reach.push({ id: other.id, minutes: m });
      }
    }
    return reach.sort((a, b) => a.minutes - b.minutes);
  }

  /** The network plus the nearest hospital: everywhere a request can sensibly go. */
  function reachableFrom(id: string): Reach[] {
    const list = networkOf(id);
    const hospital = nearestHospital(id);
    if (hospital && !list.some((r) => r.id === hospital.id)) list.push(hospital);
    return list.sort((a, b) => a.minutes - b.minutes);
  }

  return { minutes, nearestHospital, networkOf, reachableFrom };
}

export type World = ReturnType<typeof createWorld>;
