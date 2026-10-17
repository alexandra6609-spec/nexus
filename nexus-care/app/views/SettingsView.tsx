import { MapPin } from "lucide-react";
import { LOCAL_CLINIC_ID, SEED_DEMO } from "../lib/directory";
import type { Clinic, StoreState } from "../lib/types";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2 text-sm last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}

export default function SettingsView({
  store,
  local,
}: {
  store: StoreState;
  local: Clinic;
}) {
  return (
    <section
      id="settings"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex items-start gap-3">
        <MapPin size={19} className="mt-0.5 text-teal-700" />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-[#101B35]">This device</h2>
          <dl className="mt-2">
            <Row label="Clinic" value={`${LOCAL_CLINIC_ID} — ${local.name}`} />
            <Row label="Device ID" value={store.deviceId || "…"} />
            <Row
              label="On-device storage"
              value={store.storageOk ? "Working" : "Unavailable"}
            />
            <Row label="Demo data" value={SEED_DEMO ? "On (fictional figures)" : "Off"} />
          </dl>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Reports are saved on this device and keep working with no
            connection. Connection indicators show what each clinic reported,
            not a live network test. Until a hub or file import brings in other
            clinics&apos; reports, their figures are the last ones this device
            received.
          </p>
        </div>
      </div>
    </section>
  );
}
