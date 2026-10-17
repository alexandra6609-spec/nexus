import { CloudOff, HardDriveDownload } from "lucide-react";
import { kindLabel } from "../lib/clinic-logic";
import type { Clinic } from "../lib/types";

type Props = {
  viewLabel: string;
  local: Clinic;
  pendingCount: number;
};

export default function Header({ viewLabel, local, pendingCount }: Props) {
  return (
    <header className="mb-4 flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
      <div>
        <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
          <span>Nexus Care</span>
          <span>/</span>
          <span>{viewLabel}</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[#101B35]">
          {local.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {kindLabel(local)} {local.id} · {local.region}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {pendingCount > 0 ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <CloudOff size={14} />
            {pendingCount} {pendingCount === 1 ? "change" : "changes"} waiting
            to send
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
            <HardDriveDownload size={14} />
            Saved on this device
          </span>
        )}
      </div>
    </header>
  );
}
