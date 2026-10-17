/**
 * The scenario is the ONLY place that knows what the world looks like:
 * which places exist, how far apart they are, which resources are tracked and
 * what counts as low or urgent. Every screen and rule reads from it, so a new
 * clinic, supply, or threshold is a data edit, never a code edit.
 */

/** Visual weight of a priority level. Screens map this to colours. */
export type Tone = "ok" | "info" | "warn" | "danger" | "critical";

/** A named priority level. Higher number = more urgent. Level 0 means "fine". */
export type LevelDef = { level: number; label: string; tone: Tone };

/**
 * A value range that triggers a level. Both ends are inclusive and optional:
 * leave `min` off for "anything up to max", leave `max` off for "min or more".
 * A value that falls in no band is level 0 (no alert).
 */
export type Band = { min?: number; max?: number; level: number };

export type ResourceDef = {
  id: string;
  label: string;
  /** Short label for chips. Defaults to `label`. */
  short?: string;
  unit?: string;
  /**
   * Makes this a calculated resource: numerator / denominator as a whole
   * percent (e.g. bed occupancy). Calculated resources are never typed in.
   */
  percentOf?: { numerator: string; denominator: string };
  /** Default bands. Absent or empty: tracked, but never raises an alert. */
  bands?: Band[];
  /** Breaks ties when two resources hit the same level. Default 1. */
  weight?: number;
};

export type PlaceKind = "clinic" | "hospital";

export type Place = {
  id: string;
  name: string;
  region: string;
  kind: PlaceKind;
  /**
   * Network radius in minutes. By default a clinic's network is every other
   * clinic closer than its nearest hospital; set this to override.
   */
  networkRadius?: number;
  /** This place's own bands for a resource, replacing the defaults. */
  bandOverrides?: Record<string, Band[]>;
};

/** A direct road. Travel time between any two places is the shortest route. */
export type Road = { a: string; b: string; minutes: number; oneWay?: boolean };

export type SeedReport = {
  minutesAgo: number;
  quantities: Record<string, number>;
  online: boolean;
  notes?: string;
};

export type Scenario = {
  name: string;
  levels: LevelDef[];
  /** A place at or above this level is counted as needing attention. */
  attentionLevel: number;
  /** Which resources mean "people in beds" and "beds", for free-bed maths. */
  roles?: { occupied: string; capacity: string };
  resources: ResourceDef[];
  places: Place[];
  roads: Road[];
  /** Fictional first-run data. It enters through the normal ledger path. */
  seed?: {
    stock: Record<string, SeedReport>;
    transfers?: { from: string; to: string; reason: string; minutesAgo: number }[];
  };
};

const isInput = (r: ResourceDef) => !r.percentOf;

function checkBands(
  where: string,
  bands: Band[] | undefined,
  levels: Set<number>,
  errors: string[]
) {
  if (!bands) return;
  for (const band of bands) {
    if (!levels.has(band.level)) {
      errors.push(`${where}: band uses level ${band.level}, which is not defined in "levels".`);
    }
    if (band.min !== undefined && band.max !== undefined && band.min > band.max) {
      errors.push(`${where}: band min ${band.min} is above its max ${band.max}.`);
    }
  }
  const sorted = [...bands].sort(
    (a, b) => (a.min ?? -Infinity) - (b.min ?? -Infinity)
  );
  for (let i = 1; i < sorted.length; i++) {
    const previousEnd = sorted[i - 1].max ?? Infinity;
    if ((sorted[i].min ?? -Infinity) <= previousEnd) {
      errors.push(`${where}: bands overlap around ${sorted[i].min ?? "the start"}.`);
    }
  }
}

/** Every problem found, in plain words. Empty list = the scenario is usable. */
export function validateScenario(s: Scenario): string[] {
  const errors: string[] = [];

  const seen = (ids: string[], what: string) => {
    const found = new Set<string>();
    for (const id of ids) {
      if (!id) errors.push(`A ${what} has an empty id.`);
      else if (found.has(id)) errors.push(`Duplicate ${what} id "${id}".`);
      found.add(id);
    }
    return found;
  };

  seen(s.levels.map((l) => String(l.level)), "level");
  const levels = new Set(s.levels.map((l) => l.level));
  if (!levels.has(0)) errors.push('"levels" must include level 0 (the "fine" state).');
  if (!levels.has(s.attentionLevel)) {
    errors.push(`attentionLevel ${s.attentionLevel} is not a defined level.`);
  }

  const resourceIds = seen(s.resources.map((r) => r.id), "resource");
  const placeIds = seen(s.places.map((p) => p.id), "place");

  for (const place of s.places) {
    if (place.id.length > 16) errors.push(`Place id "${place.id}" is longer than 16 characters.`);
  }
  if (!s.places.some((p) => p.kind === "clinic")) {
    errors.push("The scenario needs at least one clinic.");
  }

  const byId = new Map(s.resources.map((r) => [r.id, r]));
  for (const resource of s.resources) {
    checkBands(`Resource "${resource.id}"`, resource.bands, levels, errors);
    if (resource.percentOf) {
      const { numerator, denominator } = resource.percentOf;
      for (const ref of [numerator, denominator]) {
        const target = byId.get(ref);
        if (!target) errors.push(`Resource "${resource.id}" refers to unknown resource "${ref}".`);
        else if (!isInput(target)) {
          errors.push(`Resource "${resource.id}" cannot be calculated from another calculated resource.`);
        }
      }
    }
  }

  for (const place of s.places) {
    for (const [resourceId, bands] of Object.entries(place.bandOverrides ?? {})) {
      if (!resourceIds.has(resourceId)) {
        errors.push(`Place "${place.id}" overrides unknown resource "${resourceId}".`);
      }
      checkBands(`Place "${place.id}" override for "${resourceId}"`, bands, levels, errors);
    }
  }

  if (s.roles) {
    for (const ref of [s.roles.occupied, s.roles.capacity]) {
      const target = byId.get(ref);
      if (!target) errors.push(`roles refers to unknown resource "${ref}".`);
      else if (!isInput(target)) errors.push(`roles resource "${ref}" must be a typed-in resource.`);
    }
  }

  for (const road of s.roads) {
    for (const end of [road.a, road.b]) {
      if (!placeIds.has(end)) errors.push(`A road refers to unknown place "${end}".`);
    }
    if (!(road.minutes > 0)) errors.push(`Road ${road.a}-${road.b} needs a travel time above zero.`);
  }

  for (const [placeId, report] of Object.entries(s.seed?.stock ?? {})) {
    if (!placeIds.has(placeId)) errors.push(`Seed data refers to unknown place "${placeId}".`);
    for (const key of Object.keys(report.quantities)) {
      const target = byId.get(key);
      if (!target || !isInput(target)) {
        errors.push(`Seed data for "${placeId}" uses "${key}", which is not a typed-in resource.`);
      }
    }
  }
  for (const t of s.seed?.transfers ?? []) {
    for (const end of [t.from, t.to]) {
      if (!placeIds.has(end)) errors.push(`A seed transfer refers to unknown place "${end}".`);
    }
  }

  return errors;
}

export function assertScenario(s: Scenario): Scenario {
  const errors = validateScenario(s);
  if (errors.length > 0) {
    throw new Error(`Invalid scenario "${s.name}":\n- ${errors.join("\n- ")}`);
  }
  return s;
}
