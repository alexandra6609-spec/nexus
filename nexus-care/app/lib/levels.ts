import type { Band, LevelDef, Place, ResourceDef, Scenario } from "./scenario";

/** The bands that apply to this resource at this place (its override, else the default). */
export function bandsFor(place: Place, resource: ResourceDef): Band[] {
  return place.bandOverrides?.[resource.id] ?? resource.bands ?? [];
}

/** The number a resource is judged on. Null when it cannot be worked out. */
export function resourceValue(
  resource: ResourceDef,
  quantities: Record<string, number>
): number | null {
  if (resource.percentOf) {
    const top = quantities[resource.percentOf.numerator] ?? 0;
    const bottom = quantities[resource.percentOf.denominator] ?? 0;
    return bottom > 0 ? Math.round((top / bottom) * 100) : null;
  }
  return quantities[resource.id] ?? 0;
}

/** Highest level whose band contains the value; 0 when no band does. */
export function levelOf(bands: Band[], value: number): number {
  let level = 0;
  for (const band of bands) {
    const above = band.min === undefined || value >= band.min;
    const below = band.max === undefined || value <= band.max;
    if (above && below && band.level > level) level = band.level;
  }
  return level;
}

export function levelDef(scenario: Scenario, level: number): LevelDef {
  return (
    scenario.levels.find((l) => l.level === level) ?? {
      level,
      label: `Level ${level}`,
      tone: "info",
    }
  );
}

export type ResourceStatus = {
  resource: ResourceDef;
  value: number | null;
  level: number;
  /** False when this place has no bands for the resource: shown, never flagged. */
  alertable: boolean;
};

export type PlaceStatus = {
  level: number;
  levelDef: LevelDef;
  /** The resource that set the overall level (null when everything is fine). */
  driver: ResourceStatus | null;
  resources: ResourceStatus[];
};

/**
 * Judge one place. A place that has never reported is level 0, because zeros
 * we invented ourselves must not look like an emergency.
 */
export function evaluatePlace(
  scenario: Scenario,
  place: Place,
  quantities: Record<string, number>,
  reported = true
): PlaceStatus {
  const resources: ResourceStatus[] = scenario.resources.map((resource) => {
    const bands = bandsFor(place, resource);
    const value = resourceValue(resource, quantities);
    const level = reported && value !== null ? levelOf(bands, value) : 0;
    return { resource, value, level, alertable: bands.length > 0 };
  });

  let driver: ResourceStatus | null = null;
  for (const status of resources) {
    if (status.level === 0) continue;
    const better =
      !driver ||
      status.level > driver.level ||
      (status.level === driver.level &&
        (status.resource.weight ?? 1) > (driver.resource.weight ?? 1));
    if (better) driver = status;
  }

  const level = driver?.level ?? 0;
  return { level, levelDef: levelDef(scenario, level), driver, resources };
}
