import { formatValue } from "../lib/clinic-logic";
import { SCENARIO } from "../lib/directory";
import { levelDef, type ResourceStatus } from "../lib/levels";
import { LevelPill, toneClasses } from "./ui";

function readable(status: ResourceStatus) {
  const percent = Boolean(status.resource.percentOf);
  const value = formatValue(status.value, percent);
  const unit = !percent && status.resource.unit ? ` ${status.resource.unit}` : "";
  return `${value}${unit}`;
}

/** One line per resource: "IV fluid bags: Low (6 bags reported)". */
export function ResourceLine({ status }: { status: ResourceStatus }) {
  const def = levelDef(SCENARIO, status.level);
  return (
    <p className="flex flex-wrap items-center gap-2">
      {status.resource.label}: <LevelPill label={def.label} tone={def.tone} />
      <span className="text-slate-500">({readable(status)} reported)</span>
    </p>
  );
}

/** Compact chip: "O₂: 2 cylinders · Critical". */
export function ResourceChip({ status }: { status: ResourceStatus }) {
  const def = levelDef(SCENARIO, status.level);
  return (
    <span className={`rounded px-2 py-1 text-xs ${toneClasses[def.tone]}`}>
      {status.resource.short ?? status.resource.label}: {readable(status)} · {def.label}
    </span>
  );
}
