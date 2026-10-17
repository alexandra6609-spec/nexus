import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Droplets,
  Package,
  ShieldAlert,
} from "lucide-react";
import { StatusPill, buttonClass } from "../components/ui";
import { formatTime, freeBeds, isStale, supplyStatus } from "../lib/clinic-logic";
import { LOW_STOCK } from "../lib/directory";
import type { Clinic } from "../lib/types";

type Props = {
  local: Clinic;
  clinics: Clinic[];
  onRequest: (clinic: Clinic) => void;
};

/** Other clinics with free beds, best first, based on the last reports received. */
export function rankAlternatives(local: Clinic, clinics: Clinic[]) {
  return clinics
    .filter((clinic) => clinic.id !== local.id && freeBeds(clinic) > 0)
    .sort((a, b) => {
      if (freeBeds(b) !== freeBeds(a)) return freeBeds(b) - freeBeds(a);
      return Number(b.online) - Number(a.online);
    });
}

export default function AlternativeClinics({ local, clinics, onRequest }: Props) {
  const alternatives = rankAlternatives(local, clinics);
  const full = local.capacity > 0 && local.patients >= local.capacity;

  return (
    <section id="alternatives" className="mb-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="rounded-md bg-red-50 p-2 text-red-700">
          <ShieldAlert size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[#101B35]">
            Alternative Clinic Suggestions
          </h2>
          <p className="text-xs text-slate-500">
            For {local.name} when its reported patient load reaches capacity.
          </p>
        </div>
      </div>

      {full ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">{local.name} is at or over capacity.</p>
            <p className="mt-1 text-xs">
              Reported load: {local.patients} patients for {local.capacity} beds.
              Confirm current availability, clinical suitability, staffing,
              supplies, and transport directly with the receiving clinic before
              arranging a transfer.
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
          {local.name} is currently below its reported bed capacity.
          Alternatives are still listed for coordination.
        </div>
      )}

      {alternatives.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          No other clinics currently report free beds. Contact the network
          coordinator to confirm options.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {alternatives.map((clinic, index) => {
            const stale = isStale(clinic.updatedAt);
            return (
              <div
                key={clinic.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-800">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-bold text-[#101B35]">{clinic.name}</h3>
                      <p className="text-xs text-slate-500">{clinic.region}</p>
                    </div>
                  </div>
                  <span className="rounded-md bg-emerald-50 px-2 py-1 text-sm font-bold text-emerald-800">
                    {freeBeds(clinic)} free beds
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded bg-slate-100 px-2 py-1">
                    Patients: {clinic.patients}/{clinic.capacity}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-1">
                    Staff: {clinic.staff}
                  </span>
                  <span
                    className={`rounded px-2 py-1 ${
                      clinic.online
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-800"
                    }`}
                  >
                    {clinic.online ? "Reported connected" : "Offline — verify by contact"}
                  </span>
                  <span
                    className={`rounded px-2 py-1 ${
                      stale ? "bg-amber-50 text-amber-800" : "bg-slate-100"
                    }`}
                  >
                    {stale ? "May be out of date · " : "As of "}
                    {formatTime(clinic.updatedAt)}
                  </span>
                </div>

                <div className="mt-3 space-y-1 text-sm">
                  {(
                    [
                      ["Oxygen", Activity, clinic.oxygen, LOW_STOCK.oxygen],
                      ["IV fluids", Droplets, clinic.fluids, LOW_STOCK.fluids],
                      ["Antivenom", Package, clinic.antivenom, LOW_STOCK.antivenom],
                    ] as const
                  ).map(([label, Icon, quantity, low]) => (
                    <p key={label} className="flex items-center gap-2">
                      <Icon size={15} className="text-slate-500" />
                      {label}: <StatusPill status={supplyStatus(quantity, low)} />
                      <span className="text-slate-500">({quantity} reported)</span>
                    </p>
                  ))}
                </div>

                <button
                  type="button"
                  className={`${buttonClass} mt-4 w-full`}
                  onClick={() => onRequest(clinic)}
                >
                  Request availability confirmation
                  <ArrowRight size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-2 text-xs leading-5 text-slate-500">
        Suggestions use the last reported capacity and stock only. They are not
        verified in real time and do not determine patient-specific clinical
        suitability.
      </p>
    </section>
  );
}
