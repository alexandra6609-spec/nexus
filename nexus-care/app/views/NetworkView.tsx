"use client";

import { useState } from "react";
import { BedDouble, Building2, Landmark, Wifi, WifiOff } from "lucide-react";
import { ResourceChip } from "../components/ResourceStatus";
import { LevelPill, secondaryButtonClass } from "../components/ui";
import {
  bedCapacity,
  formatTime,
  freeBeds,
  isStale,
  kindLabel,
  occupancy,
  occupied,
  statusOf,
  travelFrom,
} from "../lib/clinic-logic";
import { SCENARIO, WORLD } from "../lib/directory";
import type { Clinic } from "../lib/types";

type Props = {
  clinics: Clinic[];
  localClinicId: string;
  onEditLocal: () => void;
};

/** Clinic Network: what this device last heard about the places around it. */
export default function NetworkView({ clinics, localClinicId, onEditLocal }: Props) {
  const [scope, setScope] = useState<"network" | "all">("network");

  const byId = new Map(clinics.map((clinic) => [clinic.id, clinic]));
  const local = byId.get(localClinicId);
  const nearest = WORLD.nearestHospital(localClinicId);

  const visible: Clinic[] =
    scope === "all" || !local
      ? clinics
      : [
          local,
          ...WORLD.reachableFrom(localClinicId)
            .map((reach) => byId.get(reach.id))
            .filter((clinic): clinic is Clinic => Boolean(clinic)),
        ];

  return (
    <section id="clinic-network">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-[#101B35]">
            {scope === "network" ? "My Network" : "All Places"}
          </h2>
          <p className="text-xs text-slate-500">
            {scope === "network"
              ? `Places closer than ${
                  nearest ? `the nearest hospital (${nearest.id})` : "any hospital"
                }, plus that hospital. Other places show the last report this device received.`
              : "Every place in the scenario. Other places show the last report this device received."}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={secondaryButtonClass}
            aria-pressed={scope === "network"}
            onClick={() => setScope("network")}
          >
            My network
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            aria-pressed={scope === "all"}
            onClick={() => setScope("all")}
          >
            All places
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {visible.map((clinic) => {
          const isLocal = clinic.id === localClinicId;
          const hasBeds = bedCapacity(clinic) > 0;
          const percent = occupancy(clinic);
          const isOver = hasBeds && occupied(clinic) > bedCapacity(clinic);
          const stale = !isLocal && isStale(clinic.updatedAt);
          const status = statusOf(clinic);
          const Icon = clinic.kind === "hospital" ? Landmark : Building2;

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
                    <Icon size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#101B35]">{clinic.name}</h3>
                    <p className="text-xs text-slate-500">
                      {kindLabel(clinic)} {clinic.id} · {clinic.region}
                      {isLocal ? " · This device" : ` · ${travelFrom(localClinicId, clinic.id)} away`}
                    </p>
                  </div>
                </div>
                {clinic.updatedAt === null ? (
                  <LevelPill label="No report" tone="info" />
                ) : (
                  <LevelPill label={status.levelDef.label} tone={status.levelDef.tone} />
                )}
              </div>

              {status.driver && (
                <p className="mt-2 text-xs text-slate-500">
                  Driven by {status.driver.resource.label.toLowerCase()}
                </p>
              )}

              {hasBeds && (
                <>
                  <div className="mt-4 flex items-end justify-between gap-2">
                    <div>
                      <p className="text-xs text-slate-500">Bed occupancy</p>
                      <p className="text-xl font-bold text-[#101B35]">
                        {occupied(clinic)}
                        <span className="text-sm font-normal text-slate-500">
                          {" "}/ {bedCapacity(clinic)}
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
                      {occupied(clinic) - bedCapacity(clinic)} over capacity
                    </p>
                  )}

                  <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-sm">
                    <BedDouble size={16} className="text-slate-500" />
                    <span>
                      <strong>{freeBeds(clinic)}</strong>{" "}
                      <span className="text-slate-500">free beds</span>
                    </span>
                  </div>
                </>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                {status.resources
                  .filter((r) => r.alertable)
                  .map((r) => (
                    <ResourceChip key={r.resource.id} status={r} />
                  ))}
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

      {scope === "network" && visible.length <= 1 && (
        <p className="mt-3 text-sm text-slate-600">
          No other places are within reach of {SCENARIO.name}&apos;s {localClinicId}.
        </p>
      )}
    </section>
  );
}
