// Local-only storage (IndexedDB). Photos and scores never leave the device;
// we don't store photo embeddings at all.

/** One Warmr shot. The photo embedding is never stored, only the thumbnail. */
export interface Shot {
  id: string;
  day: string; // game day (America/New_York)
  ts: number;
  temperature: number;
  rank: number;
  of: number;
  band: number;
  won: boolean;
  thumbBlob: Blob;
}

/** Per-day game record; shots live in their own store. */
export interface GameRecord {
  day: string;
  status: "playing" | "won" | "gave-up";
  endedAt?: number;
}

const DB_NAME = "doppel";
const DB_VERSION = 1;

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
      db.createObjectStore("meta");
      const shots = db.createObjectStore("shots", { keyPath: "id" });
      shots.createIndex("ts", "ts");
      shots.createIndex("day", "day");
      db.createObjectStore("games", { keyPath: "day" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

/** For tests: drop the cached connection. */
export function _resetDbForTests() {
  dbp = undefined;
}

export const newId = () =>
  `${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;

export async function addShot(s: Shot): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("shots", "readwrite");
  tx.objectStore("shots").put(s);
  await done(tx);
}

/** Shots of one day, oldest first; or every shot, oldest first. */
export async function listShots(day?: string): Promise<Shot[]> {
  const db = await openDb();
  const store = db.transaction("shots").objectStore("shots");
  const all = (await req(day ? store.index("day").getAll(day) : store.index("ts").getAll())) as Shot[];
  return all.sort((a, b) => a.ts - b.ts);
}

export async function getGame(day: string): Promise<GameRecord | undefined> {
  const db = await openDb();
  return req(db.transaction("games").objectStore("games").get(day));
}

export async function putGame(g: GameRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("games", "readwrite");
  tx.objectStore("games").put(g);
  await done(tx);
}

export async function getShot(id: string): Promise<Shot | undefined> {
  const db = await openDb();
  return req(db.transaction("shots").objectStore("shots").get(id));
}

export async function listGames(): Promise<GameRecord[]> {
  const db = await openDb();
  return req(db.transaction("games").objectStore("games").getAll());
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return req(db.transaction("meta").objectStore("meta").get(key));
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put(value, key);
  await done(tx);
}

/** "Delete everything". */
export async function clearAll(): Promise<void> {
  const db = await openDb();
  const stores = ["meta", "shots", "games"];
  const tx = db.transaction(stores, "readwrite");
  for (const s of stores) tx.objectStore(s).clear();
  await done(tx);
}
