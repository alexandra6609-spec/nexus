import { BedDouble, Building2, Users, Wifi, WifiOff } from "lucide-react";
import { StatusPill } from "../components/ui";
import {
  clinicStatus,
  formatTime,
  freeBeds,
  isStale,
  occupancy,
  supplyColor,
  supplyStatus,
} from "../lib/clinic-logic";
import { LOW_STOCK } from "../lib/directory";
import type { Clinic } from "../lib/types";

type Props = {
  clinics: Clinic[];
  localClinicId: string;
  onEditLocal: () => void;
};

/** Clinic Network: the latest known state of all five clinics. */
export default function NetworkView({ clinics, localClinicId, onEditLocal }: Props) {
  return (
    <section id="clinic-network">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-[#101B35]">Five-Clinic Network</h2>
        <span className="text-xs text-slate-500">
          Other clinics show the last report this device received
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {clinics.map((clinic) => {
          const isLocal = clinic.id === localClinicId;
          const percent = occupancy(clinic);
          const status = clinicStatus(clinic);
          const isOver = clinic.capacity > 0 && clinic.patients > clinic.capacity;
          const stale = !isLocal && isStale(clinic.updatedAt);

          return (
            <div
              key={clinic.id}
              className={`rounded-lg border bg-white p-4 text-left shadow-sm ${
                isLocal ? "border-teal-600 ring-1 ring-teal-600" : "border-slate-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-slate-100 p-2 text-slate-700">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#101B35]">{clinic.name}</h3>
                    <p className="text-xs text-slate-500">
                      Clinic {clinic.id} · {clinic.region}
                      {isLocal && " · This device"}
                    </p>
                  </div>
                </div>
                <StatusPill status={status} />
              </div>

              <div className="mt-4 flex items-end justify-between gap-2">
                <div>
                  <p className="text-xs text-slate-500">Patient occupancy</p>
                  <p className="text-xl font-bold text-[#101B35]">
                    {clinic.patients}
                    <span className="text-sm font-normal text-slate-500">
                      {" "}/ {clinic.capacity}
                    </span>
                  </p>
                </div>
                <p
                  className={`text-sm font-bold ${
                    isOver ? "text-red-700" : "text-slate-600"
                  }`}
                >
                  {percent}%
                </p>
              </div>

              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${
                    isOver ? "bg-red-600" : percent >= 75 ? "bg-amber-500" : "bg-teal-600"
                  }`}
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>

              {isOver && (
                <p className="mt-2 text-xs font-semibold text-red-700">
                  {clinic.patients - clinic.capacity} patients over capacity
                </p>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2 text-sm">
                  <BedDouble size={16} className="text-slate-500" />
                  <span>
                    <strong>{freeBeds(clinic)}</strong>{" "}
                    <span className="text-slate-500">free beds</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Users size={16} className="text-slate-500" />
                  <span>
                    <strong>{clinic.staff}</strong>{" "}
                    <span className="text-slate-500">staff</span>
                  </span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {(
                  [
                    ["O₂", clinic.oxygen, LOW_STOCK.oxygen],
                    ["IV", clinic.fluids, LOW_STOCK.fluids],
                    ["Antivenom", clinic.antivenom, LOW_STOCK.antivenom],
                  ] as const
                ).map(([label, quantity, low]) => {
                  const level = supplyStatus(quantity, low);
                  return (
                    <span
                      key={label}
                      className={`rounded px-2 py-1 text-xs ${supplyColor(level)}`}
                    >
                      {label}: {quantity} · {level}
                    </span>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs">
                <span
                  className={`flex items-center gap-1 ${
                    clinic.online ? "text-emerald-700" : "text-amber-800"
                  }`}
                >
                  {clinic.online ? <Wifi size={14} /> : <WifiOff size={14} />}
                  {clinic.online ? "Reported connected" : "Last reported offline"}
                </span>
                {isLocal ? (
                  <button
                    type="button"
                    onClick={onEditLocal}
                    className="font-semibold text-teal-700 hover:underline"
                  >
                    Edit report
                  </button>
                ) : (
                  <span className={stale ? "font-semibold text-amber-800" : "text-slate-500"}>
                    {stale ? "May be out of date · " : ""}
                    {formatTime(clinic.updatedAt)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
