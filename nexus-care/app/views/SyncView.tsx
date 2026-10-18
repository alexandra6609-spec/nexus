"use client";

import { useRef, useState } from "react";
import { Download, RefreshCw, Upload } from "lucide-react";
import { secondaryButtonClass, buttonClass } from "../components/ui";
import { formatTime } from "../lib/clinic-logic";
import { LOCAL_CLINIC_ID, SYNC_URL } from "../lib/directory";
import { defaultTransport, exportBundle, importBundle, syncNow } from "../lib/sync";
import type { StoreState } from "../lib/types";

const MAX_FILE_BYTES = 5_000_000;

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2 text-sm last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}

/** Sync Status: what is waiting, plus the two ways to move data without internet. */
export default function SyncView({ store }: { store: StoreState }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [bundleMessage, setBundleMessage] = useState("");
  const [bundleError, setBundleError] = useState("");
  const transport = defaultTransport();

  async function handleFile(file: File | undefined) {
    setBundleMessage("");
    setBundleError("");
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setBundleError("That file is too large.");
      return;
    }
    try {
      const { added, ignored } = importBundle(await file.text());
      setBundleMessage(
        `Imported ${added} new ${added === 1 ? "record" : "records"}. ${ignored} already known or invalid.`
      );
    } catch (error) {
      setBundleError(error instanceof Error ? error.message : "Import failed.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <section id="sync-status" className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-bold text-[#101B35]">Sync status</h2>
        <p className="mt-1 text-xs text-slate-500">
          Everything is already saved on this device. Syncing only shares it.
        </p>

        <dl className="mt-3">
          <Row label="Waiting to send" value={String(store.pendingCount)} />
          <Row label="Last successful sync" value={store.sync.lastSuccessAt ? formatTime(store.sync.lastSuccessAt) : "Never"} />
          <Row label="Clinic hub" value={SYNC_URL || "Not set up (offline only)"} />
        </dl>

        {store.sync.error && (
          <p role="alert" className="mt-3 text-xs font-medium text-amber-800">
            {store.sync.error}
          </p>
        )}

        <div className="mt-4">
          <button
            type="button"
            className={buttonClass}
            disabled={!transport || store.sync.syncing}
            onClick={() =>
              transport && void syncNow(transport, { includeRoutineStock: true })
            }
          >
            <RefreshCw size={16} />
            {store.sync.syncing ? "Syncing…" : "Sync now"}
          </button>
          {!transport && (
            <p className="mt-2 text-xs text-slate-500">
              Set NEXT_PUBLIC_SYNC_URL to connect a clinic hub.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-bold text-[#101B35]">Move data by file</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          No signal? Export everything on this device to a file, carry it on a
          supply truck or USB stick, and import it at another clinic. Importing
          the same file twice is safe.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() =>
              download(exportBundle(), `nexus-${LOCAL_CLINIC_ID}-${new Date().toISOString().slice(0, 10)}.json`)
            }
          >
            <Download size={16} />
            Export file
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={16} />
            Import file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
        </div>

        {bundleMessage && (
          <p role="status" className="mt-3 text-xs font-medium text-emerald-700">
            {bundleMessage}
          </p>
        )}
        {bundleError && (
          <p role="alert" className="mt-3 text-xs font-medium text-red-700">
            {bundleError}
          </p>
        )}
      </div>
    </section>
  );
}
