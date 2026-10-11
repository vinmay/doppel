// Local-only storage (IndexedDB). Photos, vectors and scores never leave the device.
//   days:  DayState per game day (small; written after every change)
//   shots: one accepted photo: thumbnail + its 768-d vector (needed to compare
//          the twin with the first photo after a reload) + what Doppel read
//   meta:  small settings (onboarding seen, last known place for sunrise)

import type { DayState } from "./day";
import type { Reading } from "./twin";

export interface StoredShot {
  id: string;
  day: string;
  ts: number;
  vector: Float32Array;
  reading: Reading;
  thumbBlob: Blob;
}

const DB_NAME = "doppel";
const DB_VERSION = 2; // v1 was the Warmr-era layout

let dbp: Promise<IDBDatabase> | undefined;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });
}

export function openDb(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const name of [...db.objectStoreNames]) db.deleteObjectStore(name);
      db.createObjectStore("meta");
      db.createObjectStore("days", { keyPath: "day" });
      db.createObjectStore("shots", { keyPath: "id" }).createIndex("day", "day");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

/** For tests: drop the cached connection. */
export function _resetDbForTests() {
  dbp = undefined;
}

export const newId = () => `${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;

async function put(store: string, value: unknown, key?: IDBValidKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value, key);
  await done(tx);
}

async function get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return req(db.transaction(store).objectStore(store).get(key));
}

export const putDay = (d: DayState) => put("days", d);
export const getDay = (day: string) => get<DayState>("days", day);
export async function listDays(): Promise<DayState[]> {
  const db = await openDb();
  const all = (await req(db.transaction("days").objectStore("days").getAll())) as DayState[];
  return all.sort((a, b) => (a.day < b.day ? 1 : -1));
}

export const putShot = (s: StoredShot) => put("shots", s);
export const getShot = (id: string) => get<StoredShot>("shots", id);

export const getMeta = <T>(key: string) => get<T>("meta", key);
export const setMeta = (key: string, value: unknown) => put("meta", value, key);

/** "Delete everything". */
export async function clearAll(): Promise<void> {
  const db = await openDb();
  const stores = ["meta", "days", "shots"];
  const tx = db.transaction(stores, "readwrite");
  for (const s of stores) tx.objectStore(s).clear();
  await done(tx);
}
