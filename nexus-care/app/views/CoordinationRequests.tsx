import { ArrowRight } from "lucide-react";
import { StatusPill } from "../components/ui";
import type { Clinic, Transfer } from "../lib/types";

type Props = { transfers: Transfer[]; clinics: Clinic[] };

export default function CoordinationRequests({ transfers, clinics }: Props) {
  const nameOf = (id: string) => clinics.find((c) => c.id === id)?.name ?? `Clinic ${id}`;

  return (
    <section
      id="transfer-requests"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <ArrowRight size={19} className="text-teal-700" />
        <div>
          <h2 className="font-bold text-[#101B35]">Clinic Coordination Requests</h2>
          <p className="text-xs text-slate-500">
            Requests created by selecting an alternative clinic.
          </p>
        </div>
      </div>

      {transfers.length === 0 ? (
        <p className="text-sm text-slate-600">No requests yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="border-b border-slate-200 px-3 py-2">From</th>
                <th className="border-b border-slate-200 px-3 py-2">To</th>
                <th className="border-b border-slate-200 px-3 py-2">Request</th>
                <th className="border-b border-slate-200 px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((transfer) => (
                <tr key={transfer.id}>
                  <td className="border-b border-slate-100 px-3 py-3">
                    {nameOf(transfer.from)}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3 font-medium">
                    {nameOf(transfer.to)}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3 text-slate-600">
                    {transfer.reason}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3">
                    <StatusPill status={transfer.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
