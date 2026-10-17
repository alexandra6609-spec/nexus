import {
  AlertTriangle,
  BedDouble,
  Building2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { LevelPill } from "../components/ui";
import { bedCapacity, freeBeds, needsAttention, occupied, statusOf } from "../lib/clinic-logic";
import { INPUT_RESOURCES, SCENARIO } from "../lib/directory";
import { levelDef } from "../lib/levels";
import type { Clinic } from "../lib/types";

function Stat({
  label,
  value,
  note,
  icon: Icon,
  iconClass = "text-teal-700",
}: {
  label: string;
  value: number;
  note: string;
  icon: LucideIcon;
  iconClass?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <Icon size={18} className={iconClass} />
      </div>
      <p className="mt-1 text-2xl font-bold text-[#101B35]">{value}</p>
      <p className="text-xs text-slate-500">{note}</p>
    </div>
  );
}

/** Overview: network totals, calculated from the latest report each place sent. */
export default function OverviewView({ clinics }: { clinics: Clinic[] }) {
  const statuses = clinics.map((clinic) => statusOf(clinic));
  const attention = clinics.filter(needsAttention).length;
  const attentionLabel = levelDef(SCENARIO, SCENARIO.attentionLevel).label;

  return (
    <section id="overview" className="space-y-5">
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-[#101B35]">Network Overview</h2>
          <span className="text-xs text-slate-500">
            Calculated from the latest report each place sent
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {SCENARIO.roles && (
            <>
              <Stat
                label="Total patients"
                value={clinics.reduce((sum, c) => sum + occupied(c), 0)}
                note={`Across ${clinics.length} places`}
                icon={Users}
              />
              <Stat
                label="Available beds"
                value={clinics.reduce((sum, c) => sum + freeBeds(c), 0)}
                note="At places below capacity"
                icon={BedDouble}
              />
              <Stat
                label="Network capacity"
                value={clinics.reduce((sum, c) => sum + bedCapacity(c), 0)}
                note="Total reported beds"
                icon={Building2}
              />
            </>
          )}
          <Stat
            label={`At ${attentionLabel.toLowerCase()} or worse`}
            value={attention}
            note="Places needing attention now"
            icon={AlertTriangle}
            iconClass="text-red-600"
          />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-[#101B35]">Resources across the network</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="border-b border-slate-200 px-3 py-2">Resource</th>
                <th className="border-b border-slate-200 px-3 py-2">Total reported</th>
                <th className="border-b border-slate-200 px-3 py-2">Places flagged</th>
                <th className="border-b border-slate-200 px-3 py-2">Worst level</th>
              </tr>
            </thead>
            <tbody>
              {SCENARIO.resources.map((resource) => {
                const input = INPUT_RESOURCES.some((r) => r.id === resource.id);
                const total = input
                  ? clinics.reduce((sum, c) => sum + (c.quantities[resource.id] ?? 0), 0)
                  : null;
                const levels = statuses.map(
                  (s) => s.resources.find((r) => r.resource.id === resource.id)?.level ?? 0
                );
                const alertable = statuses.some((s) =>
                  s.resources.some((r) => r.resource.id === resource.id && r.alertable)
                );
                const worst = Math.max(0, ...levels);
                const def = levelDef(SCENARIO, worst);
                return (
                  <tr key={resource.id}>
                    <td className="border-b border-slate-100 px-3 py-2.5 font-medium">
                      {resource.label}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      {total === null ? "—" : `${total}${resource.unit ? ` ${resource.unit}` : ""}`}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      {alertable ? levels.filter((l) => l > 0).length : "—"}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      {alertable ? <LevelPill label={def.label} tone={def.tone} /> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
