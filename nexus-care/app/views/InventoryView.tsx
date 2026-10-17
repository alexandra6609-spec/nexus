"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { buttonClass, inputClass } from "../components/ui";
import { formatTime } from "../lib/clinic-logic";
import type { Clinic, StockReport } from "../lib/types";

type Props = {
  local: Clinic;
  pendingCount: number;
  onSave: (report: StockReport) => Promise<void>;
};

const FIELDS = [
  ["Current patients", "patients"],
  ["Bed capacity", "capacity"],
  ["Staff available", "staff"],
  ["Oxygen cylinders", "oxygen"],
  ["IV fluid bags", "fluids"],
  ["Antivenom vials", "antivenom"],
] as const;

function toReport(clinic: Clinic): StockReport {
  return {
    patients: clinic.patients,
    capacity: clinic.capacity,
    staff: clinic.staff,
    oxygen: clinic.oxygen,
    fluids: clinic.fluids,
    antivenom: clinic.antivenom,
    online: clinic.online,
    notes: clinic.notes,
  };
}

/** Inventory: this clinic declares its own stock. Saves locally, instantly. */
export default function InventoryView({ local, pendingCount, onSave }: Props) {
  const [savedMessage, setSavedMessage] = useState("");

  return (
    <section
      id="declare-stock"
      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-teal-50 p-2 text-teal-700">
            <ClipboardList size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#101B35]">
              Declare Clinic Stock
            </h2>
            <p className="text-xs text-slate-500">
              Saved on this device immediately. Other clinics receive it when
              a link is available.
            </p>
          </div>
        </div>
        <span className="text-xs text-slate-500">
          Last saved: {formatTime(local.updatedAt)}
        </span>
      </div>

      {/* Re-mounts with fresh values whenever this clinic's record changes. */}
      <StockForm
        key={local.updatedAt ?? "new"}
        local={local}
        pendingCount={pendingCount}
        savedMessage={savedMessage}
        onSave={async (report) => {
          await onSave(report);
          setSavedMessage(`Stock report saved for ${local.name}.`);
        }}
        onEdit={() => setSavedMessage("")}
      />
    </section>
  );
}

function StockForm({
  local,
  pendingCount,
  savedMessage,
  onSave,
  onEdit,
}: Props & { savedMessage: string; onEdit: () => void }) {
  const [draft, setDraft] = useState<StockReport>(toReport(local));
  const [errorMessage, setErrorMessage] = useState("");

  function update<K extends keyof StockReport>(key: K, value: StockReport[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setErrorMessage("");
    onEdit();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const numbers = [
      draft.patients,
      draft.capacity,
      draft.staff,
      draft.oxygen,
      draft.fluids,
      draft.antivenom,
    ];
    if (numbers.some((value) => !Number.isFinite(value) || value < 0)) {
      setErrorMessage("Enter valid numbers of zero or greater.");
      return;
    }
    if (draft.capacity < 1) {
      setErrorMessage("Bed capacity must be at least 1.");
      return;
    }

    setErrorMessage("");
    await onSave(draft);
  }

  return (
    <form onSubmit={submit}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[440px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-[#101B35] text-white">
              <th className="w-[42%] border border-[#101B35] px-3 py-2 font-semibold">
                Field
              </th>
              <th className="border border-[#101B35] px-3 py-2 font-semibold">
                Enter value
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-slate-50">
              <td className="border border-slate-200 px-3 py-2.5 font-medium">
                Clinic
              </td>
              <td className="border border-slate-200 px-3 py-2.5">
                Clinic {local.id} — {local.name}{" "}
                <span className="text-xs text-slate-500">(this device)</span>
              </td>
            </tr>

            {FIELDS.map(([label, key], index) => (
              <tr key={key} className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                <td className="border border-slate-200 px-3 py-1.5 font-medium">
                  <label htmlFor={`field-${key}`}>{label}</label>
                </td>
                <td className="border border-slate-200 px-3 py-1.5">
                  <input
                    id={`field-${key}`}
                    className={inputClass}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    required
                    value={draft[key]}
                    onChange={(event) => update(key, Number(event.target.value))}
                  />
                </td>
              </tr>
            ))}

            <tr className="bg-white">
              <td className="border border-slate-200 px-3 py-1.5 font-medium">
                <label htmlFor="field-notes">Other supplies / notes</label>
              </td>
              <td className="border border-slate-200 px-3 py-1.5">
                <input
                  id="field-notes"
                  className={inputClass}
                  type="text"
                  placeholder="Supply name, quantity, or notes"
                  value={draft.notes}
                  onChange={(event) => update("notes", event.target.value)}
                />
              </td>
            </tr>

            <tr className="bg-slate-50">
              <td className="border border-slate-200 px-3 py-1.5 font-medium">
                <label htmlFor="field-online">Clinic connection status</label>
              </td>
              <td className="border border-slate-200 px-3 py-1.5">
                <select
                  id="field-online"
                  className={inputClass}
                  value={draft.online ? "online" : "offline"}
                  onChange={(event) =>
                    update("online", event.target.value === "online")
                  }
                >
                  <option value="online">Connected</option>
                  <option value="offline">Offline</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-xs">
          {errorMessage && (
            <p role="alert" className="font-medium text-red-700">
              {errorMessage}
            </p>
          )}
          {savedMessage && (
            <p role="status" className="font-medium text-emerald-700">
              <CheckCircle2 size={14} className="mr-1 inline" />
              {savedMessage}
              {pendingCount > 0 && (
                <span className="ml-1 font-normal text-slate-500">
                  {pendingCount} waiting to send.
                </span>
              )}
            </p>
          )}
        </div>

        <button type="submit" className={buttonClass}>
          <ClipboardList size={16} />
          Save stock report
        </button>
      </div>
    </form>
  );
}
