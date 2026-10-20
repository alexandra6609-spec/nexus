import { Ambulance } from "lucide-react";
import type { TriageToken } from "../lib/types";

/** Whether the patient asked for an ambulance. Urgent when yes, quiet otherwise. */
export function AmbulanceBadge({ ambulance }: { ambulance: TriageToken["ambulance"] }) {
  if (ambulance === true) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-1 text-xs font-bold text-red-800">
        <Ambulance size={14} />
        Ambulance needed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
      <Ambulance size={14} />
      {ambulance === false ? "No ambulance needed" : "Ambulance: no answer"}
    </span>
  );
}

/** Every question the SMS bot asked and what the patient answered. */
export function SmsInputs({ token }: { token: TriageToken }) {
  if (token.inputs.length === 0) {
    return <p className="text-xs text-slate-500">No answers recorded for this code.</p>;
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      {token.inputs.map((row) => (
        <div key={row.question} className="contents">
          <dt className="text-slate-500">{row.question}</dt>
          <dd className="font-medium text-slate-800">{row.answer}</dd>
        </div>
      ))}
    </dl>
  );
}