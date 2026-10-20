"use client";

import { useState, type FormEvent } from "react";
import { Ambulance, CheckCircle2, Search, Ticket } from "lucide-react";
import { AmbulanceBadge, SmsInputs } from "../components/SmsInputs";
import { buttonClass, inputClass } from "../components/ui";
import { formatTime, isExpired } from "../lib/clinic-logic";
import type { Clinic, TriageToken } from "../lib/types";

type Props = {
  local: Clinic;
  clinics: Clinic[];
  tokens: TriageToken[];
  onArrived: (token: TriageToken) => Promise<void>;
};

const levelStyle: Record<TriageToken["level"], string> = {
  RED: "bg-red-600 text-white",
  YELLOW: "bg-amber-100 text-amber-900",
};

const levelLabel: Record<TriageToken["level"], string> = {
  RED: "Urgent",
  YELLOW: "Today",
};

const normalize = (code: string) => code.replace(/\s+/g, "").toUpperCase();

type RowProps = {
  token: TriageToken;
  localId: string;
  nameOf: (id: string | null) => string;
  onArrived: (token: TriageToken) => Promise<void>;
};

function TokenRow({ token, localId, nameOf, onArrived }: RowProps) {
  const expired = isExpired(token.expiresAt);
  const elsewhere = token.clinic !== null && token.clinic !== localId;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 py-3 last:border-0">
      <span className={`rounded px-2 py-1 font-mono text-sm font-bold ${levelStyle[token.level]}`}>
        {token.code}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-slate-800">
          {levelLabel[token.level]} · {token.summary}
        </p>
        <p className="text-xs text-slate-500">
          {token.area ?? "Area not given"} · sent {formatTime(token.issuedAt)}
          {elsewhere && ` · told to go to ${nameOf(token.clinic)}`}
        </p>
        <div className="mt-1">
          <AmbulanceBadge ambulance={token.ambulance} />
        </div>
        <details className="mt-1">
          <summary className="cursor-pointer text-xs font-semibold text-teal-700">
            SMS answers
          </summary>
          <div className="mt-1 rounded bg-slate-50 p-2">
            <SmsInputs token={token} />
          </div>
        </details>
      </div>
      {token.arrived ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
          <CheckCircle2 size={14} />
          Arrived at {nameOf(token.arrived.clinicId)}, {formatTime(token.arrived.at)}
        </span>
      ) : expired ? (
        <span className="text-xs font-semibold text-slate-500">Expired</span>
      ) : (
        <button type="button" className={buttonClass} onClick={() => onArrived(token)}>
          Mark arrived
        </button>
      )}
    </div>
  );
}

/**
 * Patients who texted the SMS bot and were told to come here. Tokens arrive
 * through the normal ledger sync, so lookup works with no connection.
 */
export default function SmsArrivals({ local, clinics, tokens, onArrived }: Props) {
  const [query, setQuery] = useState("");
  const [looked, setLooked] = useState<string | null>(null);

  const nameOf = (id: string | null) =>
    id === null ? "Any clinic" : clinics.find((c) => c.id === id)?.name ?? id;

  const expecting = tokens.filter(
    (t) => (t.clinic === local.id || t.clinic === null) && !t.arrived && !isExpired(t.expiresAt)
  );
  const found = looked === null ? null : tokens.find((t) => t.code === looked) ?? null;
  const ambulances = expecting.filter((t) => t.ambulance === true).length;

  const rowProps = { localId: local.id, nameOf, onArrived };

  function lookup(event: FormEvent) {
    event.preventDefault();
    setLooked(normalize(query));
  }

  return (
    <section id="sms-arrivals" className="mb-5 rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Ticket size={19} className="text-teal-700" />
        <div>
          <h2 className="font-bold text-[#101B35]">SMS Arrivals</h2>
          <p className="text-xs text-slate-500">
            Patients the SMS triage bot sent to {local.name}. Codes are a
            demo protocol: always triage again at the desk.
          </p>
        </div>
      </div>

      {ambulances > 0 && (
        <p
          role="alert"
          className="mb-3 flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-bold text-white"
        >
          <Ambulance size={16} />
          {ambulances === 1
            ? "1 patient asked for an ambulance"
            : `${ambulances} patients asked for an ambulance`}
        </p>
      )}

      <form onSubmit={lookup} className="mb-3 flex gap-2">
        <input
          className={`${inputClass} font-mono uppercase`}
          placeholder="Code shown by patient, e.g. RED-772K"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Token code"
        />
        <button type="submit" className={buttonClass} disabled={!query.trim()}>
          <Search size={15} />
          Look up
        </button>
      </form>

      {looked !== null && (
        <div className="mb-3 rounded-md bg-slate-50 px-3">
          {found ? (
            <TokenRow token={found} {...rowProps} />
          ) : (
            <p className="py-3 text-sm text-slate-600">
              No code {looked} on this device. It may not have synced yet, or
              it was typed wrong. Triage the patient normally.
            </p>
          )}
        </div>
      )}

      {expecting.length === 0 ? (
        <p className="text-sm text-slate-600">No patients expected from SMS right now.</p>
      ) : (
        <div>
          {expecting.map((token) => (
            <TokenRow key={token.id} token={token} {...rowProps} />
          ))}
        </div>
      )}
    </section>
  );
}