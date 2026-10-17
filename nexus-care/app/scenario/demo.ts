import type { Scenario } from "../lib/scenario";

/**
 * Demo world: seven clinics (A–G) strung between two hospitals on opposite
 * sides. To run a different world, write another file like this one and point
 * `lib/directory.ts` at it. Nothing else needs to change.
 *
 * Travel times are minutes along direct roads; longer trips are worked out.
 */
export const demoScenario: Scenario = {
  name: "Demo valley: fictional data",

  levels: [
    { level: 0, label: "Normal", tone: "ok" },
    { level: 1, label: "Low", tone: "warn" },
    { level: 2, label: "Critical", tone: "danger" },
    { level: 3, label: "Urgent", tone: "critical" },
  ],
  attentionLevel: 2,
  roles: { occupied: "patients", capacity: "capacity" },

  resources: [
    { id: "patients", label: "Current patients", unit: "patients" },
    { id: "capacity", label: "Bed capacity", unit: "beds" },
    {
      id: "occupancy",
      label: "Bed occupancy",
      short: "Beds",
      unit: "%",
      percentOf: { numerator: "patients", denominator: "capacity" },
      weight: 2,
      bands: [
        { min: 75, max: 99, level: 1 },
        { min: 100, max: 149, level: 2 },
        { min: 150, level: 3 },
      ],
    },
    {
      // Staff shortages matter, but less than a missing supply: low priority.
      id: "staff",
      label: "Staff available",
      short: "Staff",
      unit: "people",
      weight: 1,
      bands: [
        { max: 0, level: 2 },
        { min: 1, max: 2, level: 1 },
      ],
    },
    {
      id: "oxygen",
      label: "Oxygen cylinders",
      short: "O₂",
      unit: "cylinders",
      weight: 3,
      bands: [
        { max: 0, level: 3 },
        { min: 1, max: 2, level: 2 },
        { min: 3, max: 5, level: 1 },
      ],
    },
    {
      id: "fluids",
      label: "IV fluid bags",
      short: "IV",
      unit: "bags",
      weight: 2,
      bands: [
        { max: 0, level: 3 },
        { min: 1, max: 3, level: 2 },
        { min: 4, max: 8, level: 1 },
      ],
    },
    {
      id: "antivenom",
      label: "Antivenom vials",
      short: "Antivenom",
      unit: "vials",
      weight: 3,
      bands: [
        { max: 0, level: 3 },
        { min: 1, max: 2, level: 2 },
      ],
    },
  ],

  places: [
    { id: "H1", name: "Riverside General Hospital", region: "West end", kind: "hospital" },
    { id: "A", name: "Outpost A", region: "Western valley", kind: "clinic" },
    { id: "B", name: "Outpost B", region: "Western valley", kind: "clinic" },
    { id: "C", name: "Outpost C", region: "Central plains", kind: "clinic" },
    { id: "D", name: "Outpost D", region: "Central plains", kind: "clinic" },
    { id: "E", name: "Outpost E", region: "Eastern plains", kind: "clinic" },
    { id: "F", name: "Outpost F", region: "Eastern plains", kind: "clinic" },
    {
      id: "G",
      name: "Outpost G",
      region: "Far east ridge",
      kind: "clinic",
      // Remote: oxygen runs out of road before it runs out of cylinders.
      bandOverrides: {
        oxygen: [
          { max: 0, level: 3 },
          { min: 1, max: 3, level: 2 },
          { min: 4, max: 8, level: 1 },
        ],
      },
    },
    { id: "H2", name: "Highland Regional Hospital", region: "East end", kind: "hospital" },
  ],

  roads: [
    { a: "H1", b: "A", minutes: 120 },
    { a: "A", b: "B", minutes: 60 },
    { a: "B", b: "C", minutes: 90 },
    { a: "C", b: "D", minutes: 60 },
    { a: "D", b: "E", minutes: 90 },
    { a: "E", b: "F", minutes: 60 },
    { a: "F", b: "G", minutes: 90 },
    { a: "G", b: "H2", minutes: 120 },
    { a: "A", b: "C", minutes: 100 },
    { a: "B", b: "D", minutes: 120 },
    { a: "D", b: "F", minutes: 100 },
    { a: "E", b: "G", minutes: 110 },
  ],

  seed: {
    stock: {
      A: {
        minutesAgo: 40,
        online: false,
        notes: "Antivenom unavailable. Request stock confirmation.",
        quantities: { patients: 28, capacity: 24, staff: 3, oxygen: 2, fluids: 8, antivenom: 0 },
      },
      B: {
        minutesAgo: 20,
        online: true,
        quantities: { patients: 18, capacity: 30, staff: 5, oxygen: 12, fluids: 48, antivenom: 8 },
      },
      C: {
        minutesAgo: 25,
        online: true,
        quantities: { patients: 27, capacity: 30, staff: 4, oxygen: 4, fluids: 12, antivenom: 8 },
      },
      D: {
        minutesAgo: 15,
        online: true,
        quantities: { patients: 12, capacity: 20, staff: 3, oxygen: 8, fluids: 32, antivenom: 8 },
      },
      E: {
        minutesAgo: 10,
        online: true,
        quantities: { patients: 32, capacity: 40, staff: 7, oxygen: 14, fluids: 60, antivenom: 8 },
      },
      F: {
        minutesAgo: 55,
        online: true,
        quantities: { patients: 9, capacity: 16, staff: 2, oxygen: 6, fluids: 14, antivenom: 3 },
      },
      G: {
        minutesAgo: 420, // old on purpose: shows the "may be out of date" warning
        online: false,
        notes: "Radio link intermittent.",
        quantities: { patients: 14, capacity: 14, staff: 1, oxygen: 3, fluids: 5, antivenom: 4 },
      },
      H1: {
        minutesAgo: 12,
        online: true,
        quantities: { patients: 140, capacity: 200, staff: 60, oxygen: 80, fluids: 300, antivenom: 40 },
      },
      H2: {
        minutesAgo: 18,
        online: true,
        quantities: { patients: 90, capacity: 120, staff: 35, oxygen: 50, fluids: 200, antivenom: 25 },
      },
    },
    transfers: [{ from: "A", to: "B", reason: "Capacity check required", minutesAgo: 35 }],
  },
};
