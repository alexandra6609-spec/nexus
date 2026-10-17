export const inputClass =
  "w-full min-w-0 rounded border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600";

export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

import type { Tone } from "../lib/scenario";

export const toneClasses: Record<Tone, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  info: "bg-sky-50 text-sky-800",
  warn: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
  critical: "bg-red-600 text-white",
};

const pillStyles: Record<string, string> = {
  "Pending confirmation": "bg-amber-50 text-amber-800",
  Confirmed: "bg-emerald-50 text-emerald-700",
  Declined: "bg-red-50 text-red-700",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
        pillStyles[status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

/** A pill coloured by a scenario level's tone (Normal / Low / Critical ...). */
export function LevelPill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}
