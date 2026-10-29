// Everyday (free-use) recording, Phase 2 Round B (beta). Saves WHICH words a learner uses and WHEN, on this iPad only, so Round C can
// build progress reports. Everything here is quiet bookkeeping: it never speaks, never draws on the board, and never makes the
// board wait. Speaking always happens first; recording is queued and written to IndexedDB a moment later (see "WRITING").
//
// WHAT IS KEPT (IndexedDB, js/db.js; every key is "<learnerId>|<id>" so a learner's rows are found, backed up and deleted by prefix):
//   events      one per word the learner (or an adult, or a teaching session) selected. The id starts with the time, so rows come
//               back in time order and "everything older than X" is one cheap key range (pruning).
//               { id, time, wordId (null for typed words and numbers), label, spoken, how, pages?, form?, mode, gridSize, stage,
//                 base? (the base word's label, for forms), sessionId?, trialId? }
//                 how   "board" (main board) | "page" (a category, folder or Words page; pages = page ids from the first page to the
//                       page the word was on) | "forms" (Forms button: wordId = the base word, form = the form chosen) | "dial"
//                       (press-and-hold dial: same) | "keyboard" | "numberpad"
//                 mode  "learner" | "model" (an adult tapped in Model mode) | "session" (a tap during a teaching session; sessionId, and
//                       trialId while a trial is running)
//   utterances  one per message the learner built: { id, time (= end), start, end, chips: [{wordId, label}], spokenAsSentence,
//               endedBy: "barSpeak" | "clear" | "idle", mixed, gridSize, stage }. Only the chips left in the bar count (Delete
//               edits are reflected), and only learner-mode chips are listed; mixed = an adult (Model mode) or a teaching session
//               supplied some of the chips of that message.
//   daily       one per learner per local day (key "<learnerId>|YYYY-MM-DD"), updated as taps happen, kept forever:
//               { date, learnerTaps, uniqueWords: [keys], newWords, newWordList: [keys], utterances, multiWordUtterances,
//                 longestUtterance, wordCounts: { key: n }, modelTaps, sessionTaps,
//                 howCounts: { board|page|forms|dial|keyboard|numberpad: n } (learner taps by how they were reached; Beta 2.5),
//                 utteranceWords: total words in all of the day's messages (for the average message length; Beta 2.5) }
//               (howCounts and utteranceWords are null on a day saved before Beta 2.5: the reports then read that day's raw rows instead.)
//               Only mode "learner" taps count in learnerTaps, uniqueWords, wordCounts and newWords. A "key" is the word id
//               ("go"), "go+went" for a form chosen from the Forms button or the dial, or "~label" for typed words and numbers.
//   firstseen   one per word key the learner has used in learner mode: { key, wordId, label, time, date }. This is what makes a
//               "new word" (first ever learner use) survive pruning, because raw events are deleted after the retention period
//               while daily summaries and firstseen rows are kept forever.
// Settings (per learner, localStorage): record (default true, also for learners that existed before this version) and
// retentionDays (90, 180, 365 or 0 = forever; default 180).
//
// WRITING. recordWord() / utterances only change memory and put the new rows in a small queue; a timer (1.5 s) and the page being
// hidden write the queue in ONE IndexedDB transaction. If the app is killed in that 1.5 s the last few taps are lost (accepted:
// reports are statistics, and speech must never wait for the disk).
// BIG DATA. Pruning is one key-range delete; rebuilds and backups read in chunks of 2000 rows and give way to taps between chunks.
import * as db from "./db.js";
import { load, save, remove } from "./storage.js";

export const RETENTION_CHOICES = [90, 180, 365, 0];          // days; 0 = forever
export const DEFAULT_RETENTION = 180;
export const IDLE_UTTERANCE_MS = 20000;                      // no chip added for this long ends an utterance
const FLUSH_MS = 1500;
const CHUNK = 2000;
const DAY_MS = 86400000;

// ---------------------------------------------------------------- small helpers
const pad13 = (t) => String(Math.max(0, Math.floor(t))).padStart(13, "0");
const p2 = (n) => String(n).padStart(2, "0");
/** Local calendar day of a time, "YYYY-MM-DD". */
export const localDate = (t) => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
/** Local midnight (ms) at the start of a "YYYY-MM-DD" day. */
export const dayStart = (date) => { const [y, m, d] = date.split("-").map(Number); return new Date(y, m - 1, d).getTime(); };
let seq = 0;
const newKeyId = (time) => pad13(time) + "-" + (seq++ % 46656).toString(36).padStart(3, "0") + Math.random().toString(36).slice(2, 4);

/** The key a word is counted under: its id; "id+form" for a chosen form; "~label" for typed words and numbers. */
export function wordKeyOf(e) {
  if (e.wordId) return e.form ? e.wordId + "+" + e.form : e.wordId;
  return "~" + String(e.label || "").toLowerCase();
}

// Let taps and the screen have a turn between chunks (a MessageChannel message is a real task, and is not slowed or faked like timers).
function yieldNow() {
  return new Promise((resolve) => {
    if (typeof MessageChannel === "undefined") { setTimeout(resolve, 0); return; }
    const mc = new MessageChannel();
    mc.port1.onmessage = () => { mc.port1.close(); resolve(); };
    mc.port2.postMessage(0);
  });
}

// ---------------------------------------------------------------- settings (per learner)
const settingsCache = new Map();
function cleanSettings(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return { record: r.record !== false, retentionDays: RETENTION_CHOICES.includes(r.retentionDays) ? r.retentionDays : DEFAULT_RETENTION };
}
export function getSettings(learnerId) {
  let s = settingsCache.get(learnerId);
  if (!s) { s = cleanSettings(load("everyday." + learnerId, null)); settingsCache.set(learnerId, s); }
  return s;
}
export const isRecording = (learnerId) => getSettings(learnerId).record;
export function setSettings(learnerId, patch) {
  const clean = cleanSettings({ ...getSettings(learnerId), ...patch });
  settingsCache.set(learnerId, clean);
  save("everyday." + learnerId, clean);
  if (!clean.record) dropUtterance();           // pausing: whatever is half-built in the message bar is not recorded
  return clean;
}

// ---------------------------------------------------------------- per-learner state (memory)
const states = new Map();
const blankDay = (date) => ({ date, learnerTaps: 0, uniqueWords: [], newWords: 0, newWordList: [], utterances: 0,
  multiWordUtterances: 0, longestUtterance: 0, wordCounts: {}, modelTaps: 0, sessionTaps: 0, howCounts: {}, utteranceWords: 0 });

function stateFor(learnerId) {
  let st = states.get(learnerId);
  if (st) return st;
  st = { id: learnerId, loaded: false, busy: false, known: new Set(), rows: new Map(), q: [], pumping: false,
    out: { events: [], utterances: [], first: [] }, dirtyDays: new Set(), timer: null, writing: Promise.resolve(), waiters: [] };
  states.set(learnerId, st);
  st.ready = (async () => {
    try { for (const { value } of await db.getPrefix("firstseen", learnerId + "|")) if (value && value.key) st.known.add(value.key); }
    catch (e) { console.warn("Could not read the known words:", e); }
    st.loaded = true;
    pump(st);
  })();
  return st;
}
/** Get a learner's everyday state ready (known words loaded). Call when a learner becomes current. */
export const prepare = (learnerId) => stateFor(learnerId).ready;

// Work is queued per learner and run in order, because the first tap of an app start (or of a new day) may have to wait a
// moment until the known words / that day's summary have been read from the database.
function enqueue(st, date, fn) { st.q.push({ date, fn }); pump(st); }
function pump(st) {
  if (st.pumping || st.busy || !st.loaded) return;
  while (st.q.length) {
    const t = st.q[0];
    if (t.date && !st.rows.has(t.date)) {
      st.pumping = true;
      loadDay(st, t.date).finally(() => { st.pumping = false; pump(st); });
      return;
    }
    st.q.shift();
    try { t.fn(t.date ? st.rows.get(t.date) : null); } catch (e) { console.warn("Everyday recording problem:", e); }
  }
  for (const wake of st.waiters.splice(0)) wake();           // everything queued so far has been counted
}
// Resolves when every tap queued so far has been counted (immediately if nothing is waiting).
const drained = (st) => (st.loaded && !st.pumping && !st.busy && !st.q.length ? Promise.resolve() : new Promise((r) => { st.waiters.push(r); pump(st); }));
async function loadDay(st, date) {
  let row = null;
  try { row = await db.get("daily", st.id + "|" + date); } catch (e) { /* start a new day */ }
  if (!st.rows.has(date)) st.rows.set(date, cleanDay(row, date) || blankDay(date));
}

// ---------------------------------------------------------------- recording words
/**
 * Record one selected word. Call it AFTER speaking. All arguments are plain values, nothing is awaited.
 *   e: { time?, wordId, label, spoken, how, pages?, form?, mode, gridSize, stage, sessionId?, trialId? }
 */
export function recordWord(learnerId, e) {
  if (!learnerId || !getSettings(learnerId).record) return;
  const st = stateFor(learnerId);
  const time = typeof e.time === "number" ? e.time : Date.now();
  const ev = { id: newKeyId(time), time, wordId: e.wordId || null, label: String(e.label || ""), spoken: String(e.spoken || e.label || ""),
    how: e.how, mode: e.mode, gridSize: e.gridSize, stage: e.stage };
  if (e.pages && e.pages.length) ev.pages = e.pages;
  if (e.form) ev.form = e.form;
  if (e.base) ev.base = e.base;
  if (e.sessionId) ev.sessionId = e.sessionId;
  if (e.trialId) ev.trialId = e.trialId;
  enqueue(st, localDate(time), (row) => applyWord(st, ev, row));
}

function applyWord(st, ev, row) {
  st.out.events.push(ev);
  if (ev.mode === "learner") {
    const key = wordKeyOf(ev);
    row.learnerTaps++;
    if (!row.wordCounts[key]) row.uniqueWords.push(key);
    row.wordCounts[key] = (row.wordCounts[key] || 0) + 1;
    if (row.howCounts) row.howCounts[ev.how] = (row.howCounts[ev.how] || 0) + 1;
    if (!st.known.has(key)) {
      st.known.add(key);
      row.newWords++; row.newWordList.push(key);
      st.out.first.push({ key, wordId: ev.wordId, label: ev.form || ev.label, time: ev.time, date: row.date });
    }
  } else if (ev.mode === "model") row.modelTaps++;
  else if (ev.mode === "session") row.sessionTaps++;
  touch(st, row);
}

function applyUtterance(st, u, row) {
  st.out.utterances.push(u);
  row.utterances++;
  if (u.chips.length >= 2) row.multiWordUtterances++;
  row.longestUtterance = Math.max(row.longestUtterance, u.chips.length);
  if (row.utteranceWords !== null) row.utteranceWords += u.chips.length;
  touch(st, row);
}

function touch(st, row) { st.dirtyDays.add(row.date); schedule(st); }

// ---------------------------------------------------------------- utterances
// One utterance is being built at a time (the message bar is one thing). app.js tells us when the chips change and when the bar is
// spoken or cleared; we keep a copy of the chips and decide what to record. `base` = how many chips at the start of the bar already
// belong to an utterance that was recorded (spoken or timed out) and are still showing; they are not recorded twice.
const U = { learnerId: null, snap: [], base: 0, start: null, lastAdd: null, timer: null, meta: { gridSize: 45, stage: 1 } };

/**
 * The chips in the message bar changed. `sentence` = [{id, label, mode}]; `added` is true when a chip was added or replaced
 * (this restarts the 20 s idle wait), false when one was deleted.
 */
export function sentenceChanged(learnerId, sentence, meta, added) {
  if (!learnerId) return;
  if (U.learnerId && U.learnerId !== learnerId) endUtterance("clear");
  U.learnerId = learnerId;
  if (meta) U.meta = meta;
  U.snap = sentence.map((c) => ({ wordId: c.id || null, label: c.label, mode: c.mode || "learner" }));
  if (U.snap.length < U.base) U.base = U.snap.length;
  if (U.snap.length <= U.base) { U.start = null; U.lastAdd = null; clearTimeout(U.timer); return; }   // nothing new in the bar
  if (added) {
    const now = Date.now();
    if (U.start === null) U.start = now;
    U.lastAdd = now;
    clearTimeout(U.timer);
    U.timer = setTimeout(() => endUtterance("idle"), IDLE_UTTERANCE_MS);
  }
}

/** The utterance ends: source = "barSpeak" | "clear" | "idle". Records it if recording is on and it has a learner chip. */
export function endUtterance(source) {
  clearTimeout(U.timer);
  const lid = U.learnerId;
  const chips = U.snap.slice(U.base);
  if (lid && chips.length && getSettings(lid).record) {
    const mine = chips.filter((c) => c.mode === "learner");
    if (mine.length) {
      const end = source === "idle" && U.lastAdd ? U.lastAdd : Date.now();
      const u = { id: newKeyId(end), time: end, start: Math.min(U.start ?? end, end), end,
        chips: mine.map((c) => ({ wordId: c.wordId, label: c.label })), spokenAsSentence: source === "barSpeak", endedBy: source,
        mixed: mine.length !== chips.length, gridSize: U.meta.gridSize, stage: U.meta.stage };
      const st = stateFor(lid);
      enqueue(st, localDate(end), (row) => applyUtterance(st, u, row));
    }
  }
  if (source === "clear") { U.base = 0; U.snap = []; } else U.base = U.snap.length;
  U.start = null; U.lastAdd = null;
}
/** Forget the half-built utterance without recording it (recording was paused). */
export function dropUtterance() { clearTimeout(U.timer); U.base = U.snap.length; U.start = null; U.lastAdd = null; }

// ---------------------------------------------------------------- writing
function schedule(st) { if (!st.timer) st.timer = setTimeout(() => { st.timer = null; flushState(st); }, FLUSH_MS); }
const copyOf = (o) => JSON.parse(JSON.stringify(o));

/** Write everything waiting for this learner. Resolves when it is on disk. */
export function flushState(st) {
  clearTimeout(st.timer); st.timer = null;
  const ops = [];
  for (const e of st.out.events.splice(0)) ops.push({ store: "events", key: st.id + "|" + e.id, value: e });
  for (const u of st.out.utterances.splice(0)) ops.push({ store: "utterances", key: st.id + "|" + u.id, value: u });
  for (const f of st.out.first.splice(0)) ops.push({ store: "firstseen", key: st.id + "|" + f.key, value: f });
  for (const date of st.dirtyDays) { const r = st.rows.get(date); if (r) ops.push({ store: "daily", key: st.id + "|" + date, value: copyOf(r) }); }
  st.dirtyDays.clear();
  st.writing = st.writing.then(async () => {
    try { for (let i = 0; i < ops.length; i += CHUNK) await db.batch(ops.slice(i, i + CHUNK)); }
    catch (e) { console.warn("Could not save everyday data:", e); }
  });
  return st.writing;
}
/** Wait until every queued tap has been counted, then write everything (all learners). */
export async function flushAll() {
  for (const st of states.values()) {
    await st.ready;
    await drained(st);
    await flushState(st);
  }
}
/** Start the "write when hidden" safety net. Call once. */
export function initEveryday() {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAll(); });
  window.addEventListener("pagehide", () => flushAll());
}

// ---------------------------------------------------------------- reading (check panel now, reports in Round C)
const P = (id) => id + "|";
export async function getDay(learnerId, date) {
  await flushAll();
  return cleanDay(await db.get("daily", learnerId + "|" + date), date) || blankDay(date);
}
/** All daily summaries of a learner, oldest first. */
export async function listDaily(learnerId) {
  await flushAll();
  return (await db.getPrefix("daily", P(learnerId))).map((r) => cleanDay(r.value, "")).filter(Boolean).sort((a, b) => (a.date < b.date ? -1 : 1));
}
// Read a whole store of one learner in chunks, keeping rows that pass `keep`.
async function readAll(store, learnerId, keep = () => true) {
  const out = [];
  for (let after = null;;) {
    const page = await db.getPage(store, P(learnerId), after, CHUNK);
    for (const { value } of page) if (keep(value)) out.push(value);
    if (page.length < CHUNK) break;
    after = page[page.length - 1].key;
    await yieldNow();
  }
  return out;
}
/** Raw word events with time in [from, to), oldest first. */
export async function listEvents(learnerId, from = 0, to = Infinity) {
  await flushAll();
  return readAll("events", learnerId, (e) => e.time >= from && e.time < to);
}
// Rows with a time in [from, to), oldest first, read straight from the key range (the id starts with the time), so a short period
// does not read the whole store. Used by the reports (Beta 2.5).
async function readTimeRange(store, learnerId, from, to) {
  const out = [], endKey = isFinite(to) ? P(learnerId) + pad13(to) : null;
  for (let after = P(learnerId) + pad13(Math.max(0, from));;) {
    const page = await db.getPage(store, P(learnerId), after, CHUNK, endKey);
    for (const { value } of page) out.push(value);
    if (page.length < CHUNK) break;
    after = page[page.length - 1].key;
    await yieldNow();
  }
  return out;
}
export async function listEventsBetween(learnerId, from, to) { await flushAll(); return readTimeRange("events", learnerId, from, to); }
export async function listUtterancesBetween(learnerId, from, to) { await flushAll(); return readTimeRange("utterances", learnerId, from, to); }
/** How many word events have a time in [from, to) (counted by the database, nothing is read). */
export async function countEventsBetween(learnerId, from, to) {
  await flushAll();
  return db.countRange("events", P(learnerId) + pad13(Math.max(0, from)), P(learnerId) + (isFinite(to) ? pad13(to) : "\uffff"));
}
/** Every first-seen row of a learner (word key, label, time, date). */
export async function listFirstSeen(learnerId) {
  await flushAll();
  return (await db.getPrefix("firstseen", P(learnerId))).map((r) => r.value).filter((f) => f && f.key);
}
export async function listUtterances(learnerId, from = 0, to = Infinity) {
  await flushAll();
  return readAll("utterances", learnerId, (u) => u.time >= from && u.time < to);
}
/** Words first used in learner mode at or after `since` (ms), oldest first. */
export async function newWordsSince(learnerId, since) {
  await flushAll();
  return (await db.getPrefix("firstseen", P(learnerId))).map((r) => r.value).filter((f) => f && f.time >= since).sort((a, b) => a.time - b.time);
}
export async function lastUtterances(learnerId, n = 10) {
  await flushAll();
  return (await db.getLast("utterances", P(learnerId), n)).map((r) => r.value);
}
/** How much is stored: counts, and an estimate of the size in bytes (counted by the database, sized by sampling 50 rows). */
export async function storageInfo(learnerId) {
  await flushAll();
  const sizeOf = async (store, count) => {
    if (!count) return 0;
    const sample = await db.getPage(store, P(learnerId), null, 50);
    const avg = sample.reduce((n, r) => n + JSON.stringify(r.value).length + r.key.length, 0) / Math.max(1, sample.length);
    return avg * count;
  };
  const info = { events: await db.countPrefix("events", P(learnerId)), utterances: await db.countPrefix("utterances", P(learnerId)),
    days: await db.countPrefix("daily", P(learnerId)), words: await db.countPrefix("firstseen", P(learnerId)), bytes: 0 };
  info.bytes = Math.round((await sizeOf("events", info.events)) + (await sizeOf("utterances", info.utterances)) +
    (await sizeOf("daily", info.days)) + (await sizeOf("firstseen", info.words)));
  return info;
}
export function formatBytes(n) {
  if (n < 1024) return n + " bytes";
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB";
  return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + " MB";
}

// ---------------------------------------------------------------- pruning, rebuilding, clearing
/** Delete raw events and utterances older than the learner's retention setting. Daily summaries and first-seen rows stay. Returns how many events went. */
export async function pruneOld(learnerId, now = Date.now()) {
  const days = getSettings(learnerId).retentionDays;
  if (!days) return 0;
  await flushAll();
  const cutoff = pad13(now - days * DAY_MS);
  const before = await db.countPrefix("events", P(learnerId));
  await db.delRange("events", P(learnerId), P(learnerId) + cutoff);
  await db.delRange("utterances", P(learnerId), P(learnerId) + cutoff);
  return before - (await db.countPrefix("events", P(learnerId)));
}
/** On app start: prune every learner, one after the other, without getting in the way of taps. */
export async function maintain(learnerIds) {
  for (const id of learnerIds) {
    await yieldNow();
    try { await pruneOld(id); } catch (e) { console.warn("Could not prune old everyday data:", e); }
  }
}

/**
 * Rebuild a learner's daily summaries (and first-seen rows) from the raw events and utterances, in chunks. Days that have raw
 * events are recomputed from them; older days (whose raw events were pruned) keep their stored summary. With `wipe` every
 * summary and first-seen row is dropped first (only the raw rows remain). Used after a restore, and available for repair.
 * "New word" = the earliest learner-mode event for that word key, unless a first-seen row already records an earlier time.
 */
export async function rebuildDaily(learnerId, { wipe = false } = {}) {
  const st = stateFor(learnerId);
  await st.ready;
  st.busy = true;                                   // taps meanwhile wait in the queue
  try {
    await flushState(st);
    const rows = new Map();                         // date -> fresh summary built from raw events
    const dayOf = (date) => { let r = rows.get(date); if (!r) { r = blankDay(date); rows.set(date, r); } return r; };
    const stored = new Map();                       // existing first-seen rows
    if (!wipe) for (const r of await db.getPrefix("firstseen", P(learnerId))) if (r.value && r.value.key) stored.set(r.value.key, r.value);
    const first = new Map();                        // key -> earliest learner event seen in the raw rows
    for (const e of await readAll("events", learnerId)) {
      const row = dayOf(localDate(e.time));
      if (e.mode === "learner") {
        const key = wordKeyOf(e);
        row.learnerTaps++;
        if (!row.wordCounts[key]) row.uniqueWords.push(key);
        row.wordCounts[key] = (row.wordCounts[key] || 0) + 1;
        row.howCounts[e.how] = (row.howCounts[e.how] || 0) + 1;
        if (!first.has(key)) first.set(key, { key, wordId: e.wordId || null, label: e.form || e.label, time: e.time, date: row.date });
      } else if (e.mode === "model") row.modelTaps++;
      else if (e.mode === "session") row.sessionTaps++;
    }
    for (const u of await readAll("utterances", learnerId)) {
      const row = dayOf(localDate(u.time));
      row.utterances++;
      if (u.chips.length >= 2) row.multiWordUtterances++;
      row.longestUtterance = Math.max(row.longestUtterance, u.chips.length);
      row.utteranceWords += u.chips.length;
    }
    const ops = [];
    // First-seen rows: the earlier of the stored time and the raw time. A word is "new" on the day of its raw event when that
    // event is the earliest known use.
    for (const [key, f] of first) {
      const old = stored.get(key);
      if (!old || f.time <= old.time) { ops.push({ store: "firstseen", key: P(learnerId) + key, value: f }); stored.set(key, f); }
    }
    for (const [key, f] of stored) {
      const row = rows.get(f.date), raw = first.get(key);
      if (row && raw && raw.time === f.time) { row.newWords++; row.newWordList.push(key); }
    }
    if (wipe) await db.delPrefix("daily", P(learnerId));
    for (const [date, row] of rows) ops.push({ store: "daily", key: P(learnerId) + date, value: row });
    for (let i = 0; i < ops.length; i += CHUNK) { await db.batch(ops.slice(i, i + CHUNK)); await yieldNow(); }
    st.rows.clear(); st.dirtyDays.clear();           // memory now matches the database
    st.known = new Set(stored.keys());
  } finally {
    st.busy = false;
    pump(st);
  }
}

/** Delete this learner's everyday data (raw events, utterances, daily summaries, first-seen rows). Settings stay. */
export async function clearEveryday(learnerId) {
  dropUtterance();
  const st = stateFor(learnerId);
  await st.ready;
  st.busy = true;
  try {
    st.q.length = 0; st.out.events.length = 0; st.out.utterances.length = 0; st.out.first.length = 0; st.dirtyDays.clear();
    clearTimeout(st.timer); st.timer = null;
    await st.writing;
    for (const store of ["events", "utterances", "daily", "firstseen"]) await db.delPrefix(store, P(learnerId));
    st.rows.clear(); st.known = new Set();
  } finally {
    st.busy = false;
    pump(st);
  }
}
/** A learner is deleted from the iPad: everything of theirs goes, settings included. */
export async function deleteEveryday(learnerId) {
  await clearEveryday(learnerId);
  states.delete(learnerId); settingsCache.delete(learnerId); remove("everyday." + learnerId);
}

// ---------------------------------------------------------------- backup support
const MAX_ROWS = { events: 1500000, utterances: 400000, daily: 20000, firstSeen: 50000 };
/** Everything of one learner for a backup file: { settings, events, utterances, daily, firstSeen }. */
export async function exportEveryday(learnerId) {
  await flushAll();
  return { settings: { ...getSettings(learnerId) }, events: await readAll("events", learnerId), utterances: await readAll("utterances", learnerId),
    daily: await readAll("daily", learnerId), firstSeen: await readAll("firstseen", learnerId) };
}

const HOWS = ["board", "page", "forms", "dial", "keyboard", "numberpad"];
const MODES = ["learner", "model", "session"];
const ENDS = ["barSpeak", "clear", "idle"];
const ID_RE = /^[A-Za-z0-9_:,@.+~-]{1,80}$/;
const KEYID_RE = /^\d{13}-[A-Za-z0-9]{1,12}$/;
const txt = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const nat = (v) => (typeof v === "number" && isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const stageOf = (v) => Math.min(4, Math.max(1, Math.round(v) || 1));

/** Keep only the known fields of a stored/backed-up word event; null if it is not usable. */
export function cleanEvent(raw) {
  if (!isObj(raw) || typeof raw.time !== "number" || !isFinite(raw.time) || raw.time < 0) return null;
  if (!HOWS.includes(raw.how) || !MODES.includes(raw.mode)) return null;
  const e = { id: typeof raw.id === "string" && KEYID_RE.test(raw.id) ? raw.id : newKeyId(raw.time), time: Math.floor(raw.time),
    wordId: typeof raw.wordId === "string" && ID_RE.test(raw.wordId) ? raw.wordId : null, label: txt(raw.label, 60), spoken: txt(raw.spoken, 160),
    how: raw.how, mode: raw.mode, gridSize: raw.gridSize === 84 ? 84 : 45, stage: stageOf(raw.stage) };
  if (Array.isArray(raw.pages)) { const p = raw.pages.filter((x) => typeof x === "string" && ID_RE.test(x)).slice(0, 8); if (p.length) e.pages = p; }
  if (typeof raw.form === "string" && raw.form) e.form = txt(raw.form, 40);
  if (typeof raw.base === "string" && raw.base) e.base = txt(raw.base, 60);
  if (typeof raw.sessionId === "string" && ID_RE.test(raw.sessionId)) e.sessionId = raw.sessionId;
  if (typeof raw.trialId === "string" && ID_RE.test(raw.trialId)) e.trialId = raw.trialId;
  return e;
}
export function cleanUtterance(raw) {
  if (!isObj(raw) || typeof raw.end !== "number" || !Array.isArray(raw.chips) || !ENDS.includes(raw.endedBy)) return null;
  const chips = raw.chips.slice(0, 60).filter(isObj).map((c) => ({ wordId: typeof c.wordId === "string" && ID_RE.test(c.wordId) ? c.wordId : null, label: txt(c.label, 60) }));
  if (!chips.length) return null;
  const end = Math.floor(raw.end);
  return { id: typeof raw.id === "string" && KEYID_RE.test(raw.id) ? raw.id : newKeyId(end), time: end,
    start: typeof raw.start === "number" && raw.start <= end ? Math.floor(raw.start) : end, end, chips,
    spokenAsSentence: raw.endedBy === "barSpeak", endedBy: raw.endedBy, mixed: raw.mixed === true,
    gridSize: raw.gridSize === 84 ? 84 : 45, stage: stageOf(raw.stage) };
}
export function cleanDay(raw, date) {
  if (!isObj(raw) || typeof raw.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) return null;
  const counts = {};
  if (isObj(raw.wordCounts)) for (const [k, v] of Object.entries(raw.wordCounts).slice(0, 5000)) counts[txt(k, 90)] = nat(v);
  const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 5000).map((x) => x.slice(0, 90)) : []);
  let how = null;                                   // (null = a day saved before Beta 2.5)
  if (isObj(raw.howCounts)) { how = {}; for (const h of HOWS) if (raw.howCounts[h]) how[h] = nat(raw.howCounts[h]); }
  return { date: raw.date, learnerTaps: nat(raw.learnerTaps), uniqueWords: list(raw.uniqueWords), newWords: nat(raw.newWords), newWordList: list(raw.newWordList),
    utterances: nat(raw.utterances), multiWordUtterances: nat(raw.multiWordUtterances), longestUtterance: nat(raw.longestUtterance), wordCounts: counts,
    modelTaps: nat(raw.modelTaps), sessionTaps: nat(raw.sessionTaps), howCounts: how,
    utteranceWords: typeof raw.utteranceWords === "number" && isFinite(raw.utteranceWords) ? nat(raw.utteranceWords) : null };
}
export function cleanFirstSeen(raw) {
  if (!isObj(raw) || typeof raw.key !== "string" || !raw.key || typeof raw.time !== "number" || !isFinite(raw.time)) return null;
  return { key: raw.key.slice(0, 90), wordId: typeof raw.wordId === "string" && ID_RE.test(raw.wordId) ? raw.wordId : null, label: txt(raw.label, 60),
    time: Math.floor(raw.time), date: localDate(raw.time) };
}
/** Clean the `everyday` part of a backup learner. Anything unusable is skipped. */
export function cleanEverydayBackup(raw) {
  if (!isObj(raw)) return null;
  const list = (v, max, fn) => (Array.isArray(v) ? v.slice(0, max).map(fn).filter(Boolean) : []);
  return { settings: cleanSettings(raw.settings), events: list(raw.events, MAX_ROWS.events, cleanEvent), utterances: list(raw.utterances, MAX_ROWS.utterances, cleanUtterance),
    daily: list(raw.daily, MAX_ROWS.daily, (d) => cleanDay(d, "")), firstSeen: list(raw.firstSeen, MAX_ROWS.firstSeen, cleanFirstSeen) };
}

/** Replace a learner's everyday data with already-cleaned backup data, then rebuild the daily summaries of the days that have raw events. */
export async function importEveryday(learnerId, data) {
  await clearEveryday(learnerId);
  setSettings(learnerId, data.settings);
  const ops = [];
  for (const e of data.events) ops.push({ store: "events", key: P(learnerId) + e.id, value: e });
  for (const u of data.utterances) ops.push({ store: "utterances", key: P(learnerId) + u.id, value: u });
  for (const d of data.daily) ops.push({ store: "daily", key: P(learnerId) + d.date, value: d });
  for (const f of data.firstSeen) ops.push({ store: "firstseen", key: P(learnerId) + f.key, value: f });
  for (let i = 0; i < ops.length; i += CHUNK) { await db.batch(ops.slice(i, i + CHUNK)); await yieldNow(); }
  await rebuildDaily(learnerId);
}
