import { Users } from "lucide-react";

/** Placeholder: patient records get their own ledger entry type next. */
export default function PatientsView() {
  return (
    <section
      id="patients"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex items-start gap-3">
        <Users size={19} className="mt-0.5 text-teal-700" />
        <div>
          <h2 className="font-bold text-[#101B35]">Patients</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Patient-level records are not built yet. For now, the current
            patient count is entered under Inventory and shared with the
            network as part of the stock report.
          </p>
        </div>
      </div>
    </section>
  );
}
