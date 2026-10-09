// A tiny promise wrapper around IndexedDB. Used for learner profiles and photos.
// Everything stays on this device.
//
// If IndexedDB is unavailable (some private-browsing modes) or fails, we fall
// back to plain in-memory storage so the app still works for the current
// session (but nothing is remembered after a reload).
//
// Two "stores" (like tables): "profiles" and "photos". Keys are strings.

const DB_NAME = "aac-board";
const DB_VERSION = 1;
const STORES = ["profiles", "photos"];

const memory = { profiles: new Map(), photos: new Map() };
let dbPromise = null;
export let usingFallback = false;

function fallback(reason) {
  usingFallback = true;
  console.warn("IndexedDB unavailable, using memory only:", reason);
}

// Open the database once; resolves to null if it cannot be opened.
function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (!("indexedDB" in window)) { fallback("not supported"); return resolve(null); }
    let finished = false;
    const finish = (v) => { if (!finished) { finished = true; clearTimeout(timer); resolve(v); } };
    // Safari can occasionally hang on first open, so give up after 4 seconds.
    const timer = setTimeout(() => { fallback("timeout"); finish(null); }, 4000);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => finish(req.result);
      req.onerror = () => { fallback(req.error); finish(null); };
      req.onblocked = () => { fallback("blocked"); finish(null); };
    } catch (e) { fallback(e); finish(null); }
  });
  return dbPromise;
}

// Run one transaction. `work(store)` returns the IDBRequest whose result we want.
function run(db, storeName, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = work(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Try IndexedDB; on any failure use the in-memory copy instead.
async function withDb(storeName, mode, work, memWork) {
  const db = await open();
  if (db) {
    try { return await run(db, storeName, mode, work); }
    catch (e) { console.warn("IndexedDB operation failed, using memory:", e); }
  }
  return memWork(memory[storeName]);
}

export const get = (store, key) =>
  withDb(store, "readonly", (s) => s.get(key), (m) => m.get(key));

export const put = (store, key, value) =>
  withDb(store, "readwrite", (s) => s.put(value, key), (m) => { m.set(key, value); });

export const del = (store, key) =>
  withDb(store, "readwrite", (s) => s.delete(key), (m) => { m.delete(key); });

export const getAll = (store) =>
  withDb(store, "readonly", (s) => s.getAll(), (m) => [...m.values()]);

// All records whose key starts with `prefix`: returns [{key, value}, ...]
export async function getPrefix(store, prefix) {
  const range = typeof IDBKeyRange !== "undefined" ? IDBKeyRange.bound(prefix, prefix + "￿") : null;
  const db = await open();
  if (db) {
    try {
      const keys = await run(db, store, "readonly", (s) => s.getAllKeys(range));
      const values = await run(db, store, "readonly", (s) => s.getAll(range));
      return keys.map((key, i) => ({ key, value: values[i] }));
    } catch (e) { console.warn("IndexedDB operation failed, using memory:", e); }
  }
  return [...memory[store].entries()].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value }));
}

export async function delPrefix(store, prefix) {
  const range = typeof IDBKeyRange !== "undefined" ? IDBKeyRange.bound(prefix, prefix + "￿") : null;
  const db = await open();
  if (db) {
    try { return await run(db, store, "readwrite", (s) => s.delete(range)); }
    catch (e) { console.warn("IndexedDB operation failed, using memory:", e); }
  }
  for (const k of [...memory[store].keys()]) if (k.startsWith(prefix)) memory[store].delete(k);
}
