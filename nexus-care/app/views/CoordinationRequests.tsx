import { useState } from "react";
import { ArrowRight, PackageCheck } from "lucide-react";
import { buttonClass, inputClass, StatusPill } from "../components/ui";
import { TRANSFER_RESOURCES } from "../lib/directory";
import type { Clinic, Transfer } from "../lib/types";

type Props = {
  transfers: Transfer[];
  clinics: Clinic[];
  local: Clinic;
  onFulfill: (to: string, resource: string, requestId: string) => Promise<void>;
};

export default function CoordinationRequests({ transfers, clinics, local, onFulfill }: Props) {
  const [selectedResources, setSelectedResources] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const nameOf = (id: string) => clinics.find((c) => c.id === id)?.name ?? `Clinic ${id}`;

  async function fulfill(transfer: Transfer, resource: string) {
    setBusyId(transfer.id);
    setMessages((current) => ({ ...current, [transfer.id]: "" }));
    try {
      await onFulfill(transfer.from, resource, transfer.id);
      setMessages((current) => ({ ...current, [transfer.id]: "1 unit transfer queued to requester." }));
    } catch (error) {
      setMessages((current) => ({
        ...current,
        [transfer.id]: error instanceof Error ? error.message : "Could not send supply.",
      }));
    } finally {
      setBusyId(null);
    }
  }

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
                <th className="border-b border-slate-200 px-3 py-2">Supply</th>
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
                  <td className="border-b border-slate-100 px-3 py-3">
                    {transfer.status === "Pending confirmation" &&
                    transfer.from !== local.id ? (
                      <div className="flex min-w-48 items-center gap-2">
                        <select
                          className={inputClass}
                          aria-label={`Supply to ${nameOf(transfer.from)}`}
                          value={selectedResources[transfer.id] ?? ""}
                          onChange={(event) =>
                            setSelectedResources((current) => ({
                              ...current,
                              [transfer.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Choose available supply</option>
                          {TRANSFER_RESOURCES.filter(
                            (resource) => (local.quantities[resource.id] ?? 0) > 0
                          ).map((resource) => (
                            <option key={resource.id} value={resource.id}>
                              {resource.label} ({local.quantities[resource.id]} available)
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className={buttonClass}
                          disabled={!selectedResources[transfer.id] || busyId === transfer.id}
                          onClick={() =>
                            void fulfill(transfer, selectedResources[transfer.id])
                          }
                        >
                          <PackageCheck size={15} />
                          Send 1
                        </button>
                      </div>
                    ) : (
                      "—"
                    )}
                    {messages[transfer.id] && (
                      <p role="status" className="mt-1 text-xs text-slate-600">
                        {messages[transfer.id]}
                      </p>
                    )}
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
