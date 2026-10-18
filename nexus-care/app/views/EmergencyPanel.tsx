"use client";

import { useState } from "react";
import { Siren, Users } from "lucide-react";
import { inputClass } from "../components/ui";
import { formatMinutes, planCasualties, type CasualtyPlan } from "../lib/clinic-logic";
import { INPUT_RESOURCES, SCENARIO } from "../lib/directory";
import { sendEmergency } from "../lib/store";
import { sendUrgent } from "../lib/sync";
import type { AlertData, Clinic } from "../lib/types";

type Props = {
  local: Clinic;
  clinics: Clinic[];
};

const dangerButton =
  "inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50";

const RESOURCES = INPUT_RESOURCES.filter(
  (r) => r.id !== SCENARIO.roles?.occupied && r.id !== SCENARIO.roles?.capacity
);

export default function EmergencyPanel({ local, clinics }: Props) {
  const [resource, setResource] = useState(RESOURCES[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [casualties, setCasualties] = useState("10");
  const [notice, setNotice] = useState("");
  const [plan, setPlan] = useState<CasualtyPlan | null>(null);
  const [busy, setBusy] = useState(false);

  async function raise(data: AlertData) {
    setBusy(true);
    const entry = await sendEmergency(data);
    const delivered = await sendUrgent(entry);
    setNotice(
      delivered
        ? "Alert delivered over the emergency channel."
        : "Alert saved on this device. It goes out the moment any link allows."
    );
    setBusy(false);
  }

  function declareMassCasualty() {
    const count = Math.max(1, Math.min(500, Math.floor(Number(casualties)) || 0));
    setPlan(planCasualties(count, local.id, clinics));
    void raise({ alert: "mass-casualty", resource: null, casualties: count, note: "" });
  }

  return (
    <section id="emergency" className="mb-5 rounded-lg border-2 border-red-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Siren size={19} className="text-red-600" />
        <div>
          <h2 className="font-bold text-[#101B35]">Emergency</h2>
          <p className="text-xs text-slate-500">
            For a patient crashing right now, or a disaster. Sends a few bytes over the emergency
            channel, ahead of any stock update.
          </p>
        </div>
      </div>

      {notice && (
        <p role="status" className="mb-3 text-xs font-medium text-emerald-700">
          {notice}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-800">Active patient crisis</h3>
          <label className="block text-xs text-slate-500">
            Needed now, and we have none
            <select
              className={`${inputClass} mt-1`}
              value={resource}
              onChange={(event) => setResource(event.target.value)}
            >
              {RESOURCES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <input
            className={inputClass}
            placeholder="Short note (optional)"
            maxLength={120}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            aria-label="Note"
          />
          <button
            type="button"
            className={dangerButton}
            disabled={busy || !resource}
            onClick={() =>
              void raise({ alert: "crisis", resource, casualties: null, note: note.trim() })
            }
          >
            <Siren size={16} />
            Send EMERGENCY alert
          </button>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-800">Mass-casualty event</h3>
          <label className="block text-xs text-slate-500">
            Casualties incoming
            <input
              className={`${inputClass} mt-1`}
              type="number"
              min={1}
              max={500}
              value={casualties}
              onChange={(event) => setCasualties(event.target.value)}
            />
          </label>
          <button type="button" className={dangerButton} disabled={busy} onClick={declareMassCasualty}>
            <Users size={16} />
            Declare mass casualty
          </button>
        </div>
      </div>

      {plan && (
        <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm">
          <p className="mb-1 font-bold text-slate-800">Suggested split (last known free beds)</p>
          <ul className="list-inside list-disc text-slate-700">
            {plan.plan.map((row) => (
              <li key={row.clinic.id}>
                {row.clinic.name}: {row.count} ({row.minutes === 0 ? "on site" : formatMinutes(row.minutes)})
              </li>
            ))}
            {plan.unplaced > 0 && <li>{plan.unplaced} with no free bed in the region</li>}
          </ul>
        </div>
      )}
    </section>
  );
}