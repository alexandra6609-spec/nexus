"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { LevelPill, buttonClass, inputClass } from "../components/ui";
import { formatTime, formatValue, kindLabel } from "../lib/clinic-logic";
import { INPUT_RESOURCES, SCENARIO } from "../lib/directory";
import { evaluatePlace } from "../lib/levels";
import type { Clinic, StockReport } from "../lib/types";

type Props = {
  local: Clinic;
  pendingCount: number;
  onSave: (report: StockReport) => Promise<void>;
};

function toReport(clinic: Clinic): StockReport {
  return {
    quantities: { ...clinic.quantities },
    online: clinic.online,
    notes: clinic.notes,
  };
}

/** Inventory: this place declares its own resources. Saves locally, instantly. */
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
              Declare Stock and Capacity
            </h2>
            <p className="text-xs text-slate-500">
              Saved locally first. Low, Critical, and Urgent reports sync automatically;
              Normal reports wait for you to choose Sync now in Sync Status.
            </p>
          </div>
        </div>
        <span className="text-xs text-slate-500">
          Last saved: {formatTime(local.updatedAt)}
        </span>
      </div>

      {/* Re-mounts with fresh values whenever this place's record changes. */}
      <StockForm
        key={local.updatedAt ?? "new"}
        local={local}
        pendingCount={pendingCount}
        savedMessage={savedMessage}
        onSave={async (report) => {
          await onSave(report);
          setSavedMessage(`Report saved for ${local.name}.`);
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

  // Priority is worked out from what is typed, using this place's own bands.
  const preview = evaluatePlace(SCENARIO, local, draft.quantities, true);
  const previewOf = (id: string) => preview.resources.find((r) => r.resource.id === id);

  function setQuantity(id: string, value: number) {
    setDraft((previous) => ({
      ...previous,
      quantities: { ...previous.quantities, [id]: value },
    }));
    setErrorMessage("");
    onEdit();
  }

  function setField<K extends "online" | "notes">(key: K, value: StockReport[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setErrorMessage("");
    onEdit();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const numbers = INPUT_RESOURCES.map((r) => draft.quantities[r.id]);
    if (numbers.some((value) => !Number.isFinite(value) || value < 0)) {
      setErrorMessage("Enter valid numbers of zero or greater.");
      return;
    }
    const capacityId = SCENARIO.roles?.capacity;
    if (capacityId && draft.quantities[capacityId] < 1) {
      const label = INPUT_RESOURCES.find((r) => r.id === capacityId)?.label ?? capacityId;
      setErrorMessage(`${label} must be at least 1.`);
      return;
    }

    setErrorMessage("");
    await onSave(draft);
  }

  const calculated = SCENARIO.resources.filter((r) => r.percentOf);

  return (
    <form onSubmit={submit}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-[#101B35] text-white">
              <th className="w-[38%] border border-[#101B35] px-3 py-2 font-semibold">
                Field
              </th>
              <th className="border border-[#101B35] px-3 py-2 font-semibold">
                Enter value
              </th>
              <th className="w-[22%] border border-[#101B35] px-3 py-2 font-semibold">
                Priority
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-slate-50">
              <td className="border border-slate-200 px-3 py-2.5 font-medium">
                {kindLabel(local)}
              </td>
              <td className="border border-slate-200 px-3 py-2.5" colSpan={2}>
                {local.id} — {local.name}{" "}
                <span className="text-xs text-slate-500">(this device)</span>
              </td>
            </tr>

            {INPUT_RESOURCES.map((resource, index) => {
              const status = previewOf(resource.id);
              return (
                <tr
                  key={resource.id}
                  className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}
                >
                  <td className="border border-slate-200 px-3 py-1.5 font-medium">
                    <label htmlFor={`field-${resource.id}`}>
                      {resource.label}
                      {resource.unit && (
                        <span className="font-normal text-slate-500"> ({resource.unit})</span>
                      )}
                    </label>
                  </td>
                  <td className="border border-slate-200 px-3 py-1.5">
                    <input
                      id={`field-${resource.id}`}
                      className={inputClass}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      required
                      value={draft.quantities[resource.id] ?? 0}
                      onChange={(event) =>
                        setQuantity(resource.id, Number(event.target.value))
                      }
                    />
                  </td>
                  <td className="border border-slate-200 px-3 py-1.5">
                    {status?.alertable ? (
                      <LevelPill
                        label={SCENARIO.levels.find((l) => l.level === status.level)?.label ?? ""}
                        tone={SCENARIO.levels.find((l) => l.level === status.level)?.tone ?? "ok"}
                      />
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {calculated.map((resource) => {
              const status = previewOf(resource.id);
              const def = SCENARIO.levels.find((l) => l.level === status?.level);
              return (
                <tr key={resource.id} className="bg-slate-50">
                  <td className="border border-slate-200 px-3 py-2 font-medium">
                    {resource.label}
                    <span className="font-normal text-slate-500"> (calculated)</span>
                  </td>
                  <td className="border border-slate-200 px-3 py-2">
                    {formatValue(status?.value ?? null, true)}
                  </td>
                  <td className="border border-slate-200 px-3 py-2">
                    {status?.alertable && def ? (
                      <LevelPill label={def.label} tone={def.tone} />
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}

            <tr className="bg-white">
              <td className="border border-slate-200 px-3 py-1.5 font-medium">
                <label htmlFor="field-notes">Other supplies / notes</label>
              </td>
              <td className="border border-slate-200 px-3 py-1.5" colSpan={2}>
                <input
                  id="field-notes"
                  className={inputClass}
                  type="text"
                  placeholder="Supply name, quantity, or notes"
                  value={draft.notes}
                  onChange={(event) => setField("notes", event.target.value)}
                />
              </td>
            </tr>

            <tr className="bg-slate-50">
              <td className="border border-slate-200 px-3 py-1.5 font-medium">
                <label htmlFor="field-online">Connection status</label>
              </td>
              <td className="border border-slate-200 px-3 py-1.5" colSpan={2}>
                <select
                  id="field-online"
                  className={inputClass}
                  value={draft.online ? "online" : "offline"}
                  onChange={(event) => setField("online", event.target.value === "online")}
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
          Save report
        </button>
      </div>
    </form>
  );
}
