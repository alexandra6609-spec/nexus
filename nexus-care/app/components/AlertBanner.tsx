"use client";

import { useEffect, useState } from "react";
import { PackageCheck, Siren } from "lucide-react";
import { ALERT_POLL_SECONDS, ALERT_URL, TRANSFER_RESOURCES } from "../lib/directory";
import { formatMinutes, isRecent, planCasualties, travelFrom } from "../lib/clinic-logic";
import { pullAlerts } from "../lib/sync";
import { buttonClass, inputClass } from "./ui";
import type { Clinic, EmergencyAlert } from "../lib/types";

type Props = {
  local: Clinic;
  clinics: Clinic[];
  alerts: EmergencyAlert[];
  onFulfill: (alertId: string, to: string, resource: string) => Promise<void>;
};

export default function AlertBanner({ local, clinics, alerts, onFulfill }: Props) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [selectedResources, setSelectedResources] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!ALERT_URL) return;
    const check = () => {
      if (document.visibilityState === "visible") void pullAlerts();
    };
    check();
    const timer = setInterval(check, ALERT_POLL_SECONDS * 1000);
    return () => clearInterval(timer);
  }, []);

  const nameOf = (id: string) => clinics.find((c) => c.id === id)?.name ?? id;
  const live = alerts.filter((a) => isRecent(a.ts) && !dismissed.includes(a.id)).slice(0, 3);
  if (live.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {live.map((alert) => {
        const mine = alert.from === local.id;
        const resource = TRANSFER_RESOURCES.find((r) => r.id === alert.resource);
        const have = resource ? local.quantities[resource.id] ?? 0 : 0;
        const availableResources = TRANSFER_RESOURCES.filter(
          (item) => (local.quantities[item.id] ?? 0) > 0
        );
        const selectedResourceId =
          alert.alert === "crisis"
            ? resource?.id ?? ""
            : selectedResources[alert.id] ?? availableResources[0]?.id ?? "";
        const selectedResource = TRANSFER_RESOURCES.find(
          (item) => item.id === selectedResourceId
        );
        const canFulfill =
          !mine &&
          !alert.fulfilled &&
          selectedResource !== undefined &&
          (local.quantities[selectedResource.id] ?? 0) > 0;
        const split =
          alert.alert === "mass-casualty" && alert.casualties
            ? planCasualties(alert.casualties, alert.from, clinics)
            : null;

        return (
          <div
            key={alert.id}
            role="alert"
            className="rounded-lg border-2 border-red-700 bg-red-600 p-3 text-white shadow"
          >
            <div className="flex items-start gap-2">
              <Siren size={20} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-bold uppercase tracking-wide">
                  {alert.alert === "crisis" ? "Emergency" : "Mass casualty"} · {nameOf(alert.from)}
                </p>
                {alert.alert === "crisis" ? (
                  <p>
                    Patient crashing now.
                    {resource ? ` Needs ${resource.label.toLowerCase()}.` : ""}
                    {alert.note ? ` ${alert.note}` : ""}
                  </p>
                ) : (
                  <p>{alert.casualties ?? "Several"} casualties incoming.</p>
                )}
                {alert.fulfilled ? (
                  <p className="text-red-100">A supply transfer is recorded for this alert.</p>
                ) : mine ? (
                  <p className="text-red-100">Your alert is out. Other clinics can see it.</p>
                ) : (
                  <p className="text-red-100">
                    {alert.alert === "crisis" && resource
                      ? `You have ${have} ${resource.unit ?? ""} on hand. `
                      : ""}
                    {nameOf(alert.from)} is {travelFrom(local.id, alert.from)} away.
                  </p>
                )}
                {split && (
                  <ul className="mt-1 list-inside list-disc text-red-50">
                    {split.plan.map((row) => (
                      <li key={row.clinic.id}>
                        {row.clinic.id === local.id ? "You: take " : `${row.clinic.name}: `}
                        {row.count} ({row.minutes === 0 ? "on site" : formatMinutes(row.minutes)})
                      </li>
                    ))}
                    {split.unplaced > 0 && <li>{split.unplaced} with no free bed in the region</li>}
                  </ul>
                )}
                {canFulfill && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {alert.alert === "mass-casualty" && (
                      <select
                        className={inputClass}
                        aria-label="Supply to send for emergency"
                        value={selectedResourceId}
                        onChange={(event) =>
                          setSelectedResources((current) => ({
                            ...current,
                            [alert.id]: event.target.value,
                          }))
                        }
                      >
                        {availableResources.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label} ({local.quantities[item.id]} available)
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={busyId === alert.id}
                      onClick={() => {
                        if (!selectedResource) return;
                        setBusyId(alert.id);
                        setMessages((current) => ({ ...current, [alert.id]: "" }));
                        void onFulfill(alert.id, alert.from, selectedResource.id)
                          .then(() =>
                            setMessages((current) => ({
                              ...current,
                              [alert.id]: "1 unit transfer queued for the requesting clinic.",
                            }))
                          )
                          .catch((error: unknown) =>
                            setMessages((current) => ({
                              ...current,
                              [alert.id]:
                                error instanceof Error ? error.message : "Could not send supply.",
                            }))
                          )
                          .finally(() => setBusyId(null));
                      }}
                    >
                      <PackageCheck size={15} />
                      Send 1 {selectedResource.unit ?? "unit"}
                    </button>
                  </div>
                )}
                {messages[alert.id] && (
                  <p role="status" className="mt-1 text-red-50">
                    {messages[alert.id]}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDismissed((ids) => [...ids, alert.id])}
                className="rounded bg-red-800 px-2 py-1 text-xs font-semibold hover:bg-red-900"
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
