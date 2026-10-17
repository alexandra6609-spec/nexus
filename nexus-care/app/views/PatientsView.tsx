import { CheckCircle2, MessageSquare, Users } from "lucide-react";
import { AmbulanceBadge, SmsInputs } from "../components/SmsInputs";
import { formatTime, isExpired } from "../lib/clinic-logic";
import type { Clinic, TriageToken } from "../lib/types";

type Props = {
  local: Clinic;
  clinics: Clinic[];
  tokens: TriageToken[];
};

const levelStyle: Record<TriageToken["level"], string> = {
  RED: "bg-red-600 text-white",
  YELLOW: "bg-amber-100 text-amber-900",
};

/** Patients who texted the triage bot and were sent here (or anywhere), with every answer. */
function SmsPatients({ local, clinics, tokens }: Props) {
  const nameOf = (id: string | null) =>
    id === null ? "Any clinic" : clinics.find((c) => c.id === id)?.name ?? id;
  const mine = tokens.filter((t) => t.clinic === local.id || t.clinic === null);

  return (
    <section id="sms-patients" className="mb-5 rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <MessageSquare size={19} className="text-teal-700" />
        <div>
          <h2 className="font-bold text-[#101B35]">Texted in by SMS</h2>
          <p className="text-xs text-slate-500">
            Each patient&apos;s answers to the SMS triage questions, kept on this device. Demo
            protocol: always triage again at the desk.
          </p>
        </div>
      </div>

      {mine.length === 0 ? (
        <p className="text-sm text-slate-600">No patients have texted in for {local.name} yet.</p>
      ) : (
        <div className="space-y-3">
          {mine.map((token) => (
            <article key={token.id} className="rounded-md border border-slate-100 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <span className={`rounded px-2 py-1 font-mono text-sm font-bold ${levelStyle[token.level]}`}>
                  {token.code}
                </span>
                <AmbulanceBadge ambulance={token.ambulance} />
                <span className="text-xs text-slate-500">sent {formatTime(token.issuedAt)}</span>
                <span className="ml-auto text-xs font-semibold">
                  {token.arrived ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 size={14} />
                      Arrived at {nameOf(token.arrived.clinicId)}
                    </span>
                  ) : isExpired(token.expiresAt) ? (
                    <span className="text-slate-500">Expired</span>
                  ) : (
                    <span className="text-amber-700">On the way</span>
                  )}
                </span>
              </div>
              <SmsInputs token={token} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function PatientsView(props: Props) {
  return (
    <>
      <SmsPatients {...props} />
      <section id="patients" className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <Users size={19} className="mt-0.5 text-teal-700" />
          <div>
            <h2 className="font-bold text-[#101B35]">Patient records</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Full patient records are not built yet. For now, the current patient count is
              entered under Inventory and shared with the network as part of the stock report.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}