"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import AlternativeClinics from "./AlternativeClinics";
import CoordinationRequests from "./CoordinationRequests";
import SmsArrivals from "./SmsArrivals";
import type { Clinic, Transfer, TriageToken } from "../lib/types";

type Props = {
  local: Clinic;
  clinics: Clinic[];
  transfers: Transfer[];
  tokens: TriageToken[];
  onRequest: (clinic: Clinic) => Promise<void>;
  onArrived: (token: TriageToken) => Promise<void>;
};

/** Triage: SMS patients on their way, where to send overflow, and requests raised. */
export default function TriageView({
  local,
  clinics,
  transfers,
  tokens,
  onRequest,
  onArrived,
}: Props) {
  const [notice, setNotice] = useState("");

  return (
    <>
      {notice && (
        <p role="status" className="mb-3 text-xs font-medium text-emerald-700">
          <CheckCircle2 size={14} className="mr-1 inline" />
          {notice}
        </p>
      )}
      <SmsArrivals local={local} clinics={clinics} tokens={tokens} onArrived={onArrived} />
      <AlternativeClinics
        local={local}
        clinics={clinics}
        onRequest={async (clinic) => {
          await onRequest(clinic);
          setNotice(
            `Request to ${clinic.name} saved on this device. It sends when a link is available.`
          );
        }}
      />
      <CoordinationRequests transfers={transfers} clinics={clinics} />
    </>
  );
}
