import type { StoredEntry } from "./types";

/**
 * The clinic's on-device database (IndexedDB, built into every browser).
 * No dependencies, no background process, and it only touches storage when
 * something is actually written, which keeps power draw low.
 *
 *   ledger  every entry this device knows about (own + received)
 *   meta    small key/value facts: deviceId, sync cursor
 */
const DB_NAME = "nexus-care";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const ledger = db.createObjectStore("ledger", { keyPath: "id" });
        ledger.createIndex("synced", "synced");
        db.createObjectStore("meta");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    // Allow a retry later if opening failed.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function asPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadAllEntries(): Promise<StoredEntry[]> {
  const db = await openDb();
  const tx = db.transaction("ledger", "readonly");
  return asPromise(tx.objectStore("ledger").getAll() as IDBRequest<StoredEntry[]>);
}

/** Insert or overwrite. Callers dedupe by id first; one transaction per batch. */
export async function putEntries(entries: StoredEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const db = await openDb();
  const tx = db.transaction("ledger", "readwrite");
  const store = tx.objectStore("ledger");
  for (const entry of entries) store.put(entry);
  await finished(tx);
}

export async function markEntriesSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  const tx = db.transaction("ledger", "readwrite");
  const store = tx.objectStore("ledger");
  for (const id of ids) {
    const request = store.get(id);
    request.onsuccess = () => {
      const entry = request.result as StoredEntry | undefined;
      if (entry && entry.synced !== 1) store.put({ ...entry, synced: 1 });
    };
  }
  await finished(tx);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const tx = db.transaction("meta", "readonly");
  return asPromise(tx.objectStore("meta").get(key) as IDBRequest<T | undefined>);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put(value, key);
  await finished(tx);
}
