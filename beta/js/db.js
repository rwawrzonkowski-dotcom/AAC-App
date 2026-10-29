// A tiny promise wrapper around IndexedDB. Used for learner profiles and photos.
// Everything stays on this device.
//
// If IndexedDB is unavailable (some private-browsing modes) or fails, we fall
// back to plain in-memory storage so the app still works for the current
// session (but nothing is remembered after a reload).
//
// Ten "stores" (like tables): "profiles" and "photos", plus (Phase 2, teaching) "targets", "sessions" and "trials", plus
// (Phase 2, everyday recording) "events", "utterances", "daily" and "firstseen" (see js/everyday.js), plus (Phase 3, beta 3.0)
// "scenes" (photo scenes, see js/scenedata.js).
// Keys are strings. Teaching and everyday rows are keyed "<learnerId>|<id>" so one learner's rows are found (and deleted) by prefix.
// Everyday event and utterance ids start with the time (zero-padded), so a time range of rows is also a key range.

import { STORAGE_PREFIX } from "./channel.js";
// Stable: "aac-board" (as always). Beta: "beta-aac-board" (its own database).
const DB_NAME = STORAGE_PREFIX + "aac-board";
// Version 2 added the three teaching stores, version 3 the four everyday stores, version 4 the "scenes" store. Opening an older database
// just creates the missing stores and keeps every row that is already there (nothing is ever deleted or rewritten by an upgrade).
const DB_VERSION = 4;
export const STORES = ["profiles", "photos", "targets", "sessions", "trials", "events", "utterances", "daily", "firstseen", "scenes"];

const memory = Object.fromEntries(STORES.map((s) => [s, new Map()]));
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
      req.onsuccess = () => {
        // If a later version of the app needs to upgrade this database, let go of it so that upgrade is not held up.
        req.result.onversionchange = () => req.result.close();
        finish(req.result);
      };
      req.onerror = () => { fallback(req.error); finish(null); };
      // "Blocked" means another open copy of the app (an old tab) still holds the older database. The open continues by itself as
      // soon as that copy closes, so just wait: the 4-second timer above gives up and uses memory only if that never happens.
      req.onblocked = () => console.warn("IndexedDB upgrade is waiting for another open copy of the app to close");
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

// ---------- Helpers for the everyday data (js/everyday.js): many rows, so these never read more than they must ----------
const upper = (prefix) => prefix + "\uffff";
const rangeOf = (lower, up) => (typeof IDBKeyRange !== "undefined" ? IDBKeyRange.bound(lower, up) : null);

// Several writes in ONE transaction, possibly across stores: ops = [{ store, key, value } | { store, key, remove: true }].
export async function batch(ops) {
  if (!ops.length) return;
  const db = await open();
  if (db) {
    try {
      const names = [...new Set(ops.map((o) => o.store))];
      await new Promise((resolve, reject) => {
        const tx = db.transaction(names, "readwrite");
        for (const o of ops) {
          const st = tx.objectStore(o.store);
          if (o.remove) st.delete(o.key); else st.put(o.value, o.key);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      return;
    } catch (e) { console.warn("IndexedDB operation failed, using memory:", e); }
  }
  for (const o of ops) { if (o.remove) memory[o.store].delete(o.key); else memory[o.store].set(o.key, o.value); }
}

// Delete every row of `store` whose key is between `lower` and `upperKey` (both included). One fast operation, no reading.
export async function delRange(store, lower, upperKey) {
  const db = await open();
  if (db) {
    try { return await run(db, store, "readwrite", (s) => s.delete(rangeOf(lower, upperKey))); }
    catch (e) { console.warn("IndexedDB operation failed, using memory:", e); }
  }
  for (const k of [...memory[store].keys()]) if (k >= lower && k <= upperKey) memory[store].delete(k);
}

// How many rows start with `prefix` (counted by the database, nothing is read).
export async function countPrefix(store, prefix) {
  const db = await open();
  if (db) {
    try { return await run(db, store, "readonly", (s) => s.count(rangeOf(prefix, upper(prefix)))); }
    catch (e) { console.warn("IndexedDB operation failed, using memory:", e); }
  }
  let n = 0;
  for (const k of memory[store].keys()) if (k.startsWith(prefix)) n++;
  return n;
}

// How many rows have a key between `lower` and `upperKey` (both included), counted by the database. Used by the reports to count a time range.
export async function countRange(store, lower, upperKey) {
  const db = await open();
  if (db) {
    try { return await run(db, store, "readonly", (s) => s.count(rangeOf(lower, upperKey))); }
    catch (e) { console.warn("IndexedDB operation failed, using memory:", e); }
  }
  let n = 0;
  for (const k of memory[store].keys()) if (k >= lower && k <= upperKey) n++;
  return n;
}

// Rows with a key that starts with `prefix`, at most `count` of them, in key order, starting after `afterKey` (or from the start).
// Returns [{key, value}]. Used to read big stores in chunks.
// (Reports, Beta 2.5: `endKey` stops the page before that key, so a time range of rows can be read without reading the rest.)
export async function getPage(store, prefix, afterKey, count, endKey = null) {
  const db = await open();
  if (db) {
    try {
      const top = endKey || upper(prefix);
      const range = typeof IDBKeyRange !== "undefined"
        ? (afterKey ? IDBKeyRange.bound(afterKey, top, true, false) : IDBKeyRange.bound(prefix, top)) : null;
      const [keys, values] = await run(db, store, "readonly", (s) => {
        const a = s.getAllKeys(range, count), b = s.getAll(range, count);
        return { get result() { return [a.result, b.result]; } };
      });
      return keys.map((key, i) => ({ key, value: values[i] }));
    } catch (e) { console.warn("IndexedDB operation failed, using memory:", e); }
  }
  return [...memory[store].entries()].filter(([k]) => k.startsWith(prefix) && (!afterKey || k > afterKey) && (!endKey || k < endKey))
    .sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(0, count).map(([key, value]) => ({ key, value }));
}

// The newest `count` rows that start with `prefix` (largest keys first). With time-ordered keys these are the latest rows.
export async function getLast(store, prefix, count) {
  const db = await open();
  if (db) {
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const out = [];
        const req = tx.objectStore(store).openCursor(rangeOf(prefix, upper(prefix)), "prev");
        req.onsuccess = () => {
          const c = req.result;
          if (c && out.length < count) { out.push({ key: c.key, value: c.value }); c.continue(); }
        };
        tx.oncomplete = () => resolve(out);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (e) { console.warn("IndexedDB operation failed, using memory:", e); }
  }
  return [...memory[store].entries()].filter(([k]) => k.startsWith(prefix)).sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, count).map(([key, value]) => ({ key, value }));
}
