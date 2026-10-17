import {
  AlertTriangle,
  BedDouble,
  Building2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { freeBeds } from "../lib/clinic-logic";
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

/** Overview: network totals, calculated from the latest report each clinic sent. */
export default function OverviewView({ clinics }: { clinics: Clinic[] }) {
  const totalPatients = clinics.reduce((sum, c) => sum + c.patients, 0);
  const totalCapacity = clinics.reduce((sum, c) => sum + c.capacity, 0);
  const totalFreeBeds = clinics.reduce((sum, c) => sum + freeBeds(c), 0);
  const atCapacity = clinics.filter(
    (c) => c.capacity > 0 && c.patients >= c.capacity
  ).length;

  return (
    <section id="overview">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-[#101B35]">Network Overview</h2>
        <span className="text-xs text-slate-500">
          Calculated from the latest report each clinic sent
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="Total patients"
          value={totalPatients}
          note={`Across ${clinics.length} clinics`}
          icon={Users}
        />
        <Stat
          label="Available beds"
          value={totalFreeBeds}
          note="At clinics below capacity"
          icon={BedDouble}
        />
        <Stat
          label="Network capacity"
          value={totalCapacity}
          note="Total reported beds"
          icon={Building2}
        />
        <Stat
          label="Clinics at capacity"
          value={atCapacity}
          note="Includes over-capacity clinics"
          icon={AlertTriangle}
          iconClass="text-red-600"
        />
      </div>
    </section>
  );
}
