"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import Header from "./components/Header";
import Sidebar, { NAV_ITEMS, type ViewId } from "./components/Sidebar";
import { LOCAL_CLINIC_ID, SCENARIO } from "./lib/directory";
import { declareStock, markArrived, requestTransfer, transferSupply } from "./lib/store";
import { sendUrgent } from "./lib/sync";
import { useAutoSync, useStore } from "./lib/use-store";
import AlertBanner from "./components/AlertBanner";
import InventoryView from "./views/InventoryView";
import NetworkView from "./views/NetworkView";
import OverviewView from "./views/OverviewView";
import PatientsView from "./views/PatientsView";
import SettingsView from "./views/SettingsView";
import SyncView from "./views/SyncView";
import TriageView from "./views/TriageView";
import DiseaseScanner from "./views/DiseaseScanner";
import EmergencyPanel from "./views/EmergencyPanel";

/**
 * Shell only. Each sidebar item is one file in ./views, and all of them read
 * from the local store (./lib/store). To attach a real backend later, change
 * ./lib/sync.ts. The screens do not need to know.
 */
export default function Home() {
  const store = useStore();
  useAutoSync(store.autoPendingCount);
  const [view, setView] = useState<ViewId>("inventory");

  const local =
    store.clinics.find((clinic) => clinic.id === LOCAL_CLINIC_ID) ??
    store.clinics[0];
  const viewLabel = NAV_ITEMS.find((item) => item.id === view)?.label ?? "";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <Sidebar active={view} onSelect={setView} pendingCount={store.pendingCount} />

        <main className="min-w-0 flex-1 p-3 sm:p-5 lg:p-6">
          <Header viewLabel={viewLabel} local={local} pendingCount={store.pendingCount} />

          {!store.storageOk && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <p>
                This browser is not saving data on the device (private
                browsing?). Reports will be lost when this page closes. Open the
                app in a normal window.
              </p>
            </div>
          )}

          {!store.ready ? (
            <p className="text-sm text-slate-500">Opening this clinic&apos;s saved data…</p>
          ) : (
            <>
              <AlertBanner
                local={local}
                clinics={store.clinics}
                alerts={store.alerts}
                onFulfill={async (alertId, to, resource) => {
                  const entry = await transferSupply(to, resource, 1, { alertId });
                  await sendUrgent(entry);
                }}
              />
              {view === "overview" && <OverviewView clinics={store.clinics} />}
              {view === "patients" && (
                <PatientsView
                  local={local}
                  clinics={store.clinics}
                  tokens={store.tokens}
                  smsMessages={store.smsMessages}
                />
              )}
              {view === "triage" && (
                <TriageView
                  local={local}
                  clinics={store.clinics}
                  transfers={store.transfers}
                  tokens={store.tokens}
                  onArrived={markArrived}
                  onRequest={(clinic) =>
                    requestTransfer(clinic.id, "Confirm beds, supplies and receiving staff")
                  }
                  onFulfill={async (to, resource, requestId) => {
                    await transferSupply(to, resource, 1, { requestId });
                  }}
                />
              )}
              {view === "network" && (
                <NetworkView
                  clinics={store.clinics}
                  localClinicId={local.id}
                  onEditLocal={() => setView("inventory")}
                  onSendSupply={async (to, resource) => {
                    await transferSupply(to, resource);
                  }}
                />
              )}
              {view === "triage" && <EmergencyPanel local={local} clinics={store.clinics} />}
              {view === "inventory" && (
                <InventoryView
                  local={local}
                  pendingCount={store.pendingCount}
                  onSave={declareStock}
                />
              )}
              {view === "sync" && <SyncView store={store} />}
              {view === "disease-scanner" && <DiseaseScanner />}
              {view === "settings" && <SettingsView store={store} local={local} />}
            </>
          )}

          <footer className="py-4 text-center text-xs text-slate-400">
            Nexus Care · Pillar 2: Low-Bandwidth Inter-Clinic Mesh &amp; Triage
            Engine · {SCENARIO.name}
          </footer>
        </main>
      </div>
    </div>
  );
}