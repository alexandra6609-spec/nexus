
"use client";

import { useState, type FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BedDouble,
  Building2,
  CheckCircle2,
  ClipboardList,
  Droplets,
  LayoutDashboard,
  MapPin,
  Network,
  Package,
  Radio,
  Settings,
  ShieldAlert,
  Stethoscope,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";

type Clinic = {
  id: string;
  name: string;
  region: string;
  patients: number;
  capacity: number;
  staff: number;
  oxygen: number;
  fluids: number;
  antivenom: number;
  online: boolean;
  notes: string;
  lastUpdated: string;
};

type Transfer = {
  id: number;
  from: string;
  to: string;
  reason: string;
  status: string;
};

type StockDraft = {
  clinicId: string;
  patients: number;
  capacity: number;
  staff: number;
  oxygen: number;
  fluids: number;
  antivenom: number;
  online: boolean;
  notes: string;
};

const initialClinics: Clinic[] = [
  {
    id: "A",
    name: "North Outpost",
    region: "Northern District",
    patients: 28,
    capacity: 24,
    staff: 3,
    oxygen: 2,
    fluids: 8,
    antivenom: 0,
    online: false,
    notes: "Antivenom unavailable. Request stock confirmation.",
    lastUpdated: "Oct 17, 2026 · 8:30 AM",
  },
  {
    id: "B",
    name: "East Outpost",
    region: "Eastern District",
    patients: 18,
    capacity: 30,
    staff: 5,
    oxygen: 12,
    fluids: 48,
    antivenom: 8,
    online: true,
    notes: "",
    lastUpdated: "Oct 17, 2026 · 9:10 AM",
  },
  {
    id: "C",
    name: "South Outpost",
    region: "Southern District",
    patients: 27,
    capacity: 30,
    staff: 4,
    oxygen: 4,
    fluids: 12,
    antivenom: 8,
    online: true,
    notes: "",
    lastUpdated: "Oct 17, 2026 · 9:05 AM",
  },
  {
    id: "D",
    name: "West Outpost",
    region: "Western District",
    patients: 12,
    capacity: 20,
    staff: 3,
    oxygen: 8,
    fluids: 32,
    antivenom: 8,
    online: true,
    notes: "",
    lastUpdated: "Oct 17, 2026 · 9:15 AM",
  },
  {
    id: "E",
    name: "Central Outpost",
    region: "Central District",
    patients: 32,
    capacity: 40,
    staff: 7,
    oxygen: 14,
    fluids: 60,
    antivenom: 8,
    online: true,
    notes: "",
    lastUpdated: "Oct 17, 2026 · 9:20 AM",
  },
];

const initialTransfers: Transfer[] = [
  {
    id: 1,
    from: "North Outpost",
    to: "East Outpost",
    reason: "Capacity check required",
    status: "Pending confirmation",
  },
];

const inputClass =
  "w-full min-w-0 rounded border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600";

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function makeDraft(clinic: Clinic): StockDraft {
  return {
    clinicId: clinic.id,
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

function occupancy(clinic: Clinic) {
  if (clinic.capacity <= 0) return 0;
  return Math.round((clinic.patients / clinic.capacity) * 100);
}

function freeBeds(clinic: Clinic) {
  return Math.max(0, clinic.capacity - clinic.patients);
}

function clinicStatus(clinic: Clinic) {
  const percentage = occupancy(clinic);

  if (clinic.patients >= clinic.capacity) return "At Capacity";
  if (percentage >= 75) return "Busy";
  return "Available";
}

function supplyStatus(quantity: number, lowThreshold: number) {
  if (quantity <= 0) return "Out";
  if (quantity <= lowThreshold) return "Low";
  return "Stocked";
}

function supplyColor(status: string) {
  if (status === "Out") return "text-red-700 bg-red-50";
  if (status === "Low") return "text-amber-800 bg-amber-50";
  return "text-emerald-700 bg-emerald-50";
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Available: "bg-emerald-50 text-emerald-700",
    Busy: "bg-amber-50 text-amber-800",
    "At Capacity": "bg-red-50 text-red-700",
    "Pending confirmation": "bg-amber-50 text-amber-800",
    "Stocked": "bg-emerald-50 text-emerald-700",
    Low: "bg-amber-50 text-amber-800",
    Out: "bg-red-50 text-red-700",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
        styles[status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

export default function Home() {
  const [clinics, setClinics] = useState<Clinic[]>(initialClinics);
  const [selectedClinicId, setSelectedClinicId] = useState("A");
  const [draft, setDraft] = useState<StockDraft>(
    makeDraft(initialClinics[0])
  );
  const [transfers, setTransfers] =
    useState<Transfer[]>(initialTransfers);
  const [savedMessage, setSavedMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const selectedClinic =
    clinics.find((clinic) => clinic.id === selectedClinicId) ??
    clinics[0];

  const northClinic =
    clinics.find((clinic) => clinic.id === "A") ?? clinics[0];

  const totalPatients = clinics.reduce(
    (sum, clinic) => sum + clinic.patients,
    0
  );

  const totalCapacity = clinics.reduce(
    (sum, clinic) => sum + clinic.capacity,
    0
  );

  const totalAvailableBeds = clinics.reduce(
    (sum, clinic) => sum + freeBeds(clinic),
    0
  );

  const clinicsAtCapacity = clinics.filter(
    (clinic) => clinic.patients >= clinic.capacity
  ).length;

  // Alternatives are recalculated from the latest submitted clinic reports.
  const alternatives = clinics
    .filter(
      (clinic) =>
        clinic.id !== northClinic.id &&
        freeBeds(clinic) > 0
    )
    .sort((a, b) => {
      // Prefer more free beds, then clinics reporting a connection.
      if (freeBeds(b) !== freeBeds(a)) {
        return freeBeds(b) - freeBeds(a);
      }
      return Number(b.online) - Number(a.online);
    });

  function changeClinic(clinicId: string) {
    const clinic = clinics.find((item) => item.id === clinicId);
    if (!clinic) return;

    setSelectedClinicId(clinicId);
    setDraft(makeDraft(clinic));
    setSavedMessage("");
    setErrorMessage("");
  }

  function updateDraft<K extends keyof StockDraft>(
    key: K,
    value: StockDraft[K]
  ) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setSavedMessage("");
    setErrorMessage("");
  }

  function submitStockReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const numericFields = [
      draft.patients,
      draft.capacity,
      draft.staff,
      draft.oxygen,
      draft.fluids,
      draft.antivenom,
    ];

    if (
      numericFields.some(
        (value) => !Number.isFinite(value) || value < 0
      )
    ) {
      setErrorMessage("Enter valid numbers of zero or greater.");
      return;
    }

    if (draft.capacity < 1) {
      setErrorMessage("Bed capacity must be at least 1.");
      return;
    }

    const now = new Date().toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const updatedClinic: Clinic = {
      ...selectedClinic,
      patients: draft.patients,
      capacity: draft.capacity,
      staff: draft.staff,
      oxygen: draft.oxygen,
      fluids: draft.fluids,
      antivenom: draft.antivenom,
      online: draft.online,
      notes: draft.notes,
      lastUpdated: now,
    };

    setClinics((previous) =>
      previous.map((clinic) =>
        clinic.id === selectedClinicId ? updatedClinic : clinic
      )
    );

    setDraft({ ...draft });
    setSavedMessage(
      `Stock report updated for ${selectedClinic.name}.`
    );
    setErrorMessage("");
  }

  function requestClinicCheck(clinic: Clinic) {
    const newTransfer: Transfer = {
      id: Date.now(),
      from: northClinic.name,
      to: clinic.name,
      reason: "Confirm beds, supplies and receiving staff",
      status: "Pending confirmation",
    };

    setTransfers((previous) => [newTransfer, ...previous]);
    document
      .getElementById("transfer-requests")
      ?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="flex min-h-screen flex-col lg:flex-row">
        {/* Sidebar */}
        <aside className="flex w-full shrink-0 flex-col bg-[#101B35] text-white lg:sticky lg:top-0 lg:h-screen lg:w-60">
          <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600">
              <Activity size={23} />
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">
                Nexus Care
              </p>
              <p className="text-xs text-slate-300">
                Clinic Coordination
              </p>
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto p-3 lg:flex-1 lg:flex-col lg:overflow-visible">
            {[
              {
                label: "Overview",
                href: "#overview",
                icon: LayoutDashboard,
              },
              {
                label: "Patients",
                href: "#clinic-network",
                icon: Users,
              },
              {
                label: "Triage",
                href: "#alternatives",
                icon: Stethoscope,
              },
              {
                label: "Clinic Network",
                href: "#clinic-network",
                icon: Network,
                active: true,
              },
              {
                label: "Inventory",
                href: "#declare-stock",
                icon: Package,
              },
              {
                label: "Sync Status",
                href: "#sync-status",
                icon: Radio,
              },
              {
                label: "Settings",
                href: "#settings",
                icon: Settings,
              },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <a
                  key={item.label}
                  href={item.href}
                  className={`flex shrink-0 items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${
                    item.active
                      ? "bg-teal-700 text-white"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>

          <div
            id="sync-status"
            className="hidden border-t border-white/10 p-4 lg:block"
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <WifiOff size={17} className="text-amber-400" />
              <span>Offline Mode</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Local prototype. Live clinic synchronization is not
              connected.
            </p>
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 p-3 sm:p-5 lg:p-6">
          {/* Header */}
          <header className="mb-4 flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                <span>Nexus Care</span>
                <span>/</span>
                <span>Clinic Network</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[#101B35]">
                Inter-Clinic Network
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Report stock, monitor capacity, and review alternative
                clinics.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="text-slate-500">Selected clinic: </span>
                <span className="font-semibold text-slate-800">
                  Clinic {selectedClinic.id} — {selectedClinic.name}
                </span>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                <WifiOff size={14} />
                Offline Mode
              </span>
            </div>
          </header>

          {/* FIRST SECTION: Declare Clinic Stock */}
          <section
            id="declare-stock"
            className="mb-5 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
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
                    Submit the latest clinic figures before reviewing
                    network availability.
                  </p>
                </div>
              </div>
              <span className="text-xs text-slate-500">
                * Sample data — replace with current figures
              </span>
            </div>

            <form onSubmit={submitStockReport}>
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
                      <td className="border border-slate-200 px-3 py-1.5 font-medium">
                        Clinic
                      </td>
                      <td className="border border-slate-200 px-3 py-1.5">
                        <select
                          className={inputClass}
                          value={selectedClinicId}
                          onChange={(event) =>
                            changeClinic(event.target.value)
                          }
                        >
                          {clinics.map((clinic) => (
                            <option key={clinic.id} value={clinic.id}>
                              Clinic {clinic.id} — {clinic.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>

                    {(
                      [
                        ["Current patients", "patients"],
                        ["Bed capacity", "capacity"],
                        ["Staff available", "staff"],
                        ["Oxygen cylinders", "oxygen"],
                        ["IV fluid bags", "fluids"],
                        ["Antivenom vials", "antivenom"],
                      ] as const
                    ).map(([label, key], index) => (
                      <tr
                        key={key}
                        className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}
                      >
                        <td className="border border-slate-200 px-3 py-1.5 font-medium">
                          {label}
                        </td>
                        <td className="border border-slate-200 px-3 py-1.5">
                          <input
                            className={inputClass}
                            type="number"
                            min="0"
                            step="1"
                            required
                            value={draft[key]}
                            onChange={(event) =>
                              updateDraft(key, Number(event.target.value))
                            }
                          />
                        </td>
                      </tr>
                    ))}

                    <tr className="bg-white">
                      <td className="border border-slate-200 px-3 py-1.5 font-medium">
                        Other supplies / notes
                      </td>
                      <td className="border border-slate-200 px-3 py-1.5">
                        <input
                          className={inputClass}
                          type="text"
                          placeholder="Supply name, quantity, or notes"
                          value={draft.notes}
                          onChange={(event) =>
                            updateDraft("notes", event.target.value)
                          }
                        />
                      </td>
                    </tr>

                    <tr className="bg-slate-50">
                      <td className="border border-slate-200 px-3 py-1.5 font-medium">
                        Clinic connection status
                      </td>
                      <td className="border border-slate-200 px-3 py-1.5">
                        <select
                          className={inputClass}
                          value={draft.online ? "online" : "offline"}
                          onChange={(event) =>
                            updateDraft(
                              "online",
                              event.target.value === "online"
                            )
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
                    </p>
                  )}
                </div>

                <button type="submit" className={buttonClass}>
                  <ClipboardList size={16} />
                  Submit Stock Report
                </button>
              </div>
            </form>
          </section>

          {/* Network overview */}
          <section id="overview" className="mb-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-[#101B35]">
                Network Overview
              </h2>
              <span className="text-xs text-slate-500">
                Calculated from clinic reports
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500">
                    Total patients
                  </span>
                  <Users size={18} className="text-teal-700" />
                </div>
                <p className="mt-1 text-2xl font-bold text-[#101B35]">
                  {totalPatients}
                </p>
                <p className="text-xs text-slate-500">
                  Across {clinics.length} clinics
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500">
                    Available beds
                  </span>
                  <BedDouble size={18} className="text-teal-700" />
                </div>
                <p className="mt-1 text-2xl font-bold text-[#101B35]">
                  {totalAvailableBeds}
                </p>
                <p className="text-xs text-slate-500">
                  At clinics below capacity
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500">
                    Network capacity
                  </span>
                  <Building2 size={18} className="text-teal-700" />
                </div>
                <p className="mt-1 text-2xl font-bold text-[#101B35]">
                  {totalCapacity}
                </p>
                <p className="text-xs text-slate-500">
                  Total reported beds
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500">
                    Clinics at capacity
                  </span>
                  <AlertTriangle size={18} className="text-red-600" />
                </div>
                <p className="mt-1 text-2xl font-bold text-[#101B35]">
                  {clinicsAtCapacity}
                </p>
                <p className="text-xs text-slate-500">
                  Includes over-capacity clinics
                </p>
              </div>
            </div>
          </section>

          {/* Clinic network cards */}
          <section id="clinic-network" className="mb-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-[#101B35]">
                Five-Clinic Network
              </h2>
              <span className="text-xs text-slate-500">
                Select a clinic above to edit its report
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {clinics.map((clinic) => {
                const percent = occupancy(clinic);
                const status = clinicStatus(clinic);
                const isOverCapacity = clinic.patients > clinic.capacity;

                return (
                  <button
                    type="button"
                    key={clinic.id}
                    onClick={() => changeClinic(clinic.id)}
                    className={`rounded-lg border bg-white p-4 text-left shadow-sm transition hover:border-teal-500 ${
                      selectedClinicId === clinic.id
                        ? "border-teal-600 ring-1 ring-teal-600"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <div className="rounded-md bg-slate-100 p-2 text-slate-700">
                          <Building2 size={20} />
                        </div>
                        <div>
                          <h3 className="font-bold text-[#101B35]">
                            {clinic.name}
                          </h3>
                          <p className="text-xs text-slate-500">
                            Clinic {clinic.id} · {clinic.region}
                          </p>
                        </div>
                      </div>
                      <StatusPill status={status} />
                    </div>

                    <div className="mt-4 flex items-end justify-between gap-2">
                      <div>
                        <p className="text-xs text-slate-500">
                          Patient occupancy
                        </p>
                        <p className="text-xl font-bold text-[#101B35]">
                          {clinic.patients}
                          <span className="text-sm font-normal text-slate-500">
                            {" "}
                            / {clinic.capacity}
                          </span>
                        </p>
                      </div>
                      <p
                        className={`text-sm font-bold ${
                          isOverCapacity ? "text-red-700" : "text-slate-600"
                        }`}
                      >
                        {percent}%
                      </p>
                    </div>

                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          isOverCapacity
                            ? "bg-red-600"
                            : percent >= 75
                              ? "bg-amber-500"
                              : "bg-teal-600"
                        }`}
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>

                    {isOverCapacity && (
                      <p className="mt-2 text-xs font-semibold text-red-700">
                        {clinic.patients - clinic.capacity} patients over capacity
                      </p>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                      <div className="flex items-center gap-2 text-sm">
                        <BedDouble size={16} className="text-slate-500" />
                        <span>
                          <strong>{freeBeds(clinic)}</strong>{" "}
                          <span className="text-slate-500">free beds</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Users size={16} className="text-slate-500" />
                        <span>
                          <strong>{clinic.staff}</strong>{" "}
                          <span className="text-slate-500">staff</span>
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span
                        className={`rounded px-2 py-1 text-xs ${supplyColor(
                          supplyStatus(clinic.oxygen, 2)
                        )}`}
                      >
                        O₂: {clinic.oxygen} ·{" "}
                        {supplyStatus(clinic.oxygen, 2)}
                      </span>
                      <span
                        className={`rounded px-2 py-1 text-xs ${supplyColor(
                          supplyStatus(clinic.fluids, 8)
                        )}`}
                      >
                        IV: {clinic.fluids} ·{" "}
                        {supplyStatus(clinic.fluids, 8)}
                      </span>
                      <span
                        className={`rounded px-2 py-1 text-xs ${supplyColor(
                          supplyStatus(clinic.antivenom, 2)
                        )}`}
                      >
                        Antivenom: {clinic.antivenom} ·{" "}
                        {supplyStatus(clinic.antivenom, 2)}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs">
                      <span
                        className={`flex items-center gap-1 ${
                          clinic.online ? "text-emerald-700" : "text-amber-800"
                        }`}
                      >
                        {clinic.online ? (
                          <Wifi size={14} />
                        ) : (
                          <WifiOff size={14} />
                        )}
                        {clinic.online
                          ? "Reported connected"
                          : "Last reported offline"}
                      </span>
                      <span className="text-slate-400">Edit report →</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Alternative clinic suggestions */}
          <section id="alternatives" className="mb-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-md bg-red-50 p-2 text-red-700">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#101B35]">
                  Alternative Clinic Suggestions
                </h2>
                <p className="text-xs text-slate-500">
                  For North Outpost when its reported patient load reaches
                  capacity.
                </p>
              </div>
            </div>

            {northClinic.patients >= northClinic.capacity ? (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">
                    North Outpost is at or over capacity.
                  </p>
                  <p className="mt-1 text-xs">
                    Reported load: {northClinic.patients} patients for{" "}
                    {northClinic.capacity} beds. Confirm current availability,
                    clinical suitability, staffing, supplies, and transport
                    directly with the receiving clinic before arranging a
                    transfer.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
                North Outpost is currently below its reported bed capacity.
                Alternatives are still listed for coordination.
              </div>
            )}

            {alternatives.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
                No other clinics currently report free beds. Contact the
                network coordinator to confirm options.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {alternatives.map((clinic, index) => (
                  <div
                    key={clinic.id}
                    className="rounded-lg border border-slate-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-800">
                          {index + 1}
                        </div>
                        <div>
                          <h3 className="font-bold text-[#101B35]">
                            {clinic.name}
                          </h3>
                          <p className="text-xs text-slate-500">
                            {clinic.region}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-md bg-emerald-50 px-2 py-1 text-sm font-bold text-emerald-800">
                        {freeBeds(clinic)} free beds
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded bg-slate-100 px-2 py-1">
                        Patients: {clinic.patients}/{clinic.capacity}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-1">
                        Staff: {clinic.staff}
                      </span>
                      <span
                        className={`rounded px-2 py-1 ${
                          clinic.online
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-800"
                        }`}
                      >
                        {clinic.online
                          ? "Reported connected"
                          : "Offline — verify by contact"}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1 text-sm">
                      <p className="flex items-center gap-2">
                        <Activity size={15} className="text-slate-500" />
                        Oxygen:{" "}
                        <StatusPill
                          status={supplyStatus(clinic.oxygen, 2)}
                        />
                        <span className="text-slate-500">
                          ({clinic.oxygen} reported)
                        </span>
                      </p>
                      <p className="flex items-center gap-2">
                        <Droplets size={15} className="text-slate-500" />
                        IV fluids:{" "}
                        <StatusPill
                          status={supplyStatus(clinic.fluids, 8)}
                        />
                        <span className="text-slate-500">
                          ({clinic.fluids} reported)
                        </span>
                      </p>
                      <p className="flex items-center gap-2">
                        <Package size={15} className="text-slate-500" />
                        Antivenom:{" "}
                        <StatusPill
                          status={supplyStatus(clinic.antivenom, 2)}
                        />
                        <span className="text-slate-500">
                          ({clinic.antivenom} reported)
                        </span>
                      </p>
                    </div>

                    <button
                      type="button"
                      className={`${buttonClass} mt-4 w-full`}
                      onClick={() => requestClinicCheck(clinic)}
                    >
                      Request availability confirmation
                      <ArrowRight size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-2 text-xs leading-5 text-slate-500">
              Suggestions use reported capacity and stock only. They are not
              verified in real time and do not determine patient-specific
              clinical suitability.
            </p>
          </section>

          {/* Transfer requests */}
          <section
            id="transfer-requests"
            className="mb-5 rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="mb-3 flex items-center gap-2">
              <ArrowRight size={19} className="text-teal-700" />
              <div>
                <h2 className="font-bold text-[#101B35]">
                  Clinic Coordination Requests
                </h2>
                <p className="text-xs text-slate-500">
                  Requests created by selecting an alternative clinic.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th className="border-b border-slate-200 px-3 py-2">
                      From
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2">
                      To
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2">
                      Request
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((transfer) => (
                    <tr key={transfer.id}>
                      <td className="border-b border-slate-100 px-3 py-3">
                        {transfer.from}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 font-medium">
                        {transfer.to}
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
          </section>

          {/* Offline and settings information */}
          <section
            id="settings"
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex items-start gap-3">
              <MapPin size={19} className="mt-0.5 text-teal-700" />
              <div>
                <h2 className="font-bold text-[#101B35]">
                  Reporting and offline status
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Clinic reports update this dashboard while the page is open.
                  The connection indicators are reported clinic statuses, not
                  a live network test. This front-end prototype does not
                  transmit reports, create real transfer requests, or save
                  data after a reload. Connect a backend and an offline data
                  queue before using this system in a real healthcare setting.
                </p>
              </div>
            </div>
          </section>

          <footer className="py-4 text-center text-xs text-slate-400">
            Nexus Care · Pillar 2: Low-Bandwidth Inter-Clinic Mesh &amp; Triage
            Engine · Fictional demonstration data
          </footer>
        </main>
      </div>
    </div>
  );
}
