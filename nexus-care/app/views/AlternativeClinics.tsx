import { AlertTriangle, ArrowRight, ShieldAlert } from "lucide-react";
import { ResourceLine } from "../components/ResourceStatus";
import { buttonClass } from "../components/ui";
import {
  bedCapacity,
  formatMinutes,
  formatTime,
  freeBeds,
  isStale,
  kindLabel,
  occupied,
  statusOf,
} from "../lib/clinic-logic";
import { WORLD } from "../lib/directory";
import type { Clinic } from "../lib/types";

type Props = {
  local: Clinic;
  clinics: Clinic[];
  onRequest: (clinic: Clinic) => void;
};

export type Alternative = { clinic: Clinic; minutes: number };

/**
 * Places this one can send overflow to, best first: inside its network (plus
 * its nearest hospital), with a free bed, based on the last reports received.
 */
export function rankAlternatives(local: Clinic, clinics: Clinic[]): Alternative[] {
  const reach = new Map(WORLD.reachableFrom(local.id).map((r) => [r.id, r.minutes]));
  return clinics
    .filter((clinic) => reach.has(clinic.id) && freeBeds(clinic) > 0)
    .map((clinic) => ({ clinic, minutes: reach.get(clinic.id) as number }))
    .sort((a, b) => {
      const beds = freeBeds(b.clinic) - freeBeds(a.clinic);
      if (beds !== 0) return beds;
      if (a.minutes !== b.minutes) return a.minutes - b.minutes;
      return Number(b.clinic.online) - Number(a.clinic.online);
    });
}

export default function AlternativeClinics({ local, clinics, onRequest }: Props) {
  const alternatives = rankAlternatives(local, clinics);
  const full = bedCapacity(local) > 0 && occupied(local) >= bedCapacity(local);
  const hospital = WORLD.nearestHospital(local.id);

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
            For {local.name}: places inside its network
            {hospital ? " and its nearest hospital" : ""}, nearest-first among
            equals.
          </p>
        </div>
      </div>

      {full ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">{local.name} is at or over capacity.</p>
            <p className="mt-1 text-xs">
              Reported load: {occupied(local)} for {bedCapacity(local)} beds.
              Confirm current availability, clinical suitability, staffing,
              supplies, and transport directly with the receiving place before
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
          No place in reach currently reports free beds. Contact the network
          coordinator to confirm options.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {alternatives.map(({ clinic, minutes }, index) => {
            const stale = isStale(clinic.updatedAt);
            const status = statusOf(clinic);
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
                      <p className="text-xs text-slate-500">
                        {kindLabel(clinic)} {clinic.id} · {clinic.region} ·{" "}
                        {formatMinutes(minutes)} away
                      </p>
                    </div>
                  </div>
                  <span className="rounded-md bg-emerald-50 px-2 py-1 text-sm font-bold text-emerald-800">
                    {freeBeds(clinic)} free beds
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded bg-slate-100 px-2 py-1">
                    Beds: {occupied(clinic)}/{bedCapacity(clinic)}
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
                  {status.resources
                    .filter((r) => r.alertable)
                    .map((r) => (
                      <ResourceLine key={r.resource.id} status={r} />
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
