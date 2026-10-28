// Saving and reading teaching data (Phase 2, Round A). Everything stays on this device, in IndexedDB (js/db.js).
//
// Three stores, one row per item, each keyed "<learnerId>|<id>" so a learner's rows are found, backed up and deleted by prefix:
//   targets   one per word: its settings, status, the history of level changes and its teaching instructions (see newTarget in js/teaching.js)
//   sessions  { id, learnerId, start, end, who, where, targets: [wordId], notes, levelChanges }
//   trials    { id, sessionId, learnerId, wordId, label, type, start, end, latencyMs, result, promptLevel, startLevel,
//               direction, errors, chainStepsPrompted, chain, promptTimeline }
// Every trial is written the moment it ends, so nothing is lost if the iPad is closed in the middle of a session.
// Rounds B (everyday recording) and C (reports) read these same rows.
import * as db from "./db.js";
import { newTarget, cleanTarget, cleanSession, cleanTrial } from "./teaching.js";
import { load, save } from "./storage.js";
import { loadBoardData, getBoardData } from "./boarddata.js";
import { buildModel, pathToCore } from "./boardmodel.js";
import { loadTemplates, ensureInstructions, copyInstructions } from "./templates.js";

export const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Targets (kept in memory for the learner on screen) ----------
let cacheFor = null;
const cache = new Map();            // wordId -> target (including removed ones)

export async function loadTeaching(learnerId) {
  cache.clear();
  cacheFor = learnerId;
  for (const { value } of await db.getPrefix("targets", learnerId + "|")) {
    const t = cleanTarget(value, learnerId);
    if (t) cache.set(t.wordId, t);
  }
  // Migration (beta 2.1): a target from Round A, or from an older backup, has no teaching instructions yet. It gets the starting
  // template for its word and page; nothing else about the target changes.
  await Promise.all([loadTemplates(), loadBoardData()]);
  for (const t of cache.values()) if (ensureInstructions(getBoardData(), t)) await db.put("targets", learnerId + "|" + t.wordId, t);
}
export const loadedFor = () => cacheFor;

// Targets currently in use (not removed), oldest first.
export const getTargets = () => [...cache.values()].filter((t) => !t.removed).sort((a, b) => a.added - b.added);
export const getTarget = (wordId) => { const t = cache.get(wordId); return t && !t.removed ? t : null; };
export const isTarget = (wordId) => !!getTarget(wordId);

export async function saveTarget(t) {
  if (t.learnerId === cacheFor) cache.set(t.wordId, t);     // (a session closing after a learner switch must not leak into the new learner's list)
  await db.put("targets", t.learnerId + "|" + t.wordId, t);
}

// Add a word as a target (or bring a removed one back with its old settings and history).
export async function addTarget(learnerId, info) {
  await Promise.all([loadTemplates(), loadBoardData()]);
  const old = cache.get(info.wordId);
  if (old) {
    old.removed = null; old.label = info.label; old.pageId = info.pageId || "core"; old.path = info.path || [];
    ensureInstructions(getBoardData(), old);
    await saveTarget(old);
    return old;
  }
  const t = newTarget(learnerId, info);
  ensureInstructions(getBoardData(), t);          // the starting template for this word (js/templates.js)
  await saveTarget(t);
  return t;
}
// "Remove": the target disappears from the lists but its history (and every session and trial) is kept.
export async function removeTarget(wordId) {
  const t = cache.get(wordId);
  if (!t) return;
  t.removed = Date.now();
  await saveTarget(t);
}

// ---------- Sessions and trials ----------
export const putSession = (s) => db.put("sessions", s.learnerId + "|" + s.id, s);
export const putTrial = (t) => db.put("trials", t.learnerId + "|" + t.id, t);

export async function listSessions(learnerId) {
  return (await db.getPrefix("sessions", learnerId + "|")).map((r) => cleanSession(r.value, learnerId)).filter(Boolean);
}
export async function listTrials(learnerId) {
  return (await db.getPrefix("trials", learnerId + "|")).map((r) => cleanTrial(r.value, learnerId)).filter(Boolean);
}

// A session left open (the app was closed in the middle of it) is closed at the time of its last trial.
export async function closeOrphanSessions(learnerId) {
  const sessions = (await listSessions(learnerId)).filter((s) => s.end === null);
  if (!sessions.length) return;
  const trials = await listTrials(learnerId);
  for (const s of sessions) {
    const mine = trials.filter((t) => t.sessionId === s.id);
    s.end = mine.length ? Math.max(...mine.map((t) => t.end)) : s.start;
    await putSession(s);
  }
}

// ---------- Copying instructions ----------
// Copy one target's instructions (template and the adult's edits, nothing else) onto other targets of the same learner.
export async function copyInstructionsToTargets(source, wordIds) {
  let n = 0;
  for (const id of wordIds) {
    const t = cache.get(id);
    if (!t || t.removed || t === source) continue;
    copyInstructions(source, t);
    await saveTarget(t);
    n++;
  }
  return n;
}
// Copy a target's instructions to another learner. If that learner already has the word as a target the instructions are
// updated (a removed target comes back); otherwise the word is added there as a new target with default settings. The
// teaching history, sessions and trials are never copied. Returns "added" or "updated".
export async function copyTargetToLearner(source, profile) {
  await Promise.all([loadTemplates(), loadBoardData()]);
  const key = profile.id + "|" + source.wordId;
  const row = await db.get("targets", key);
  const old = row ? cleanTarget(row, profile.id) : null;
  let t, how;
  if (old) {
    t = old; how = "updated";
    t.removed = null;
  } else {
    // The route to the word depends on the learner's board size (for example Animals is a Play folder on the 45 board).
    const model = buildModel(getBoardData(), profile.gridSize);
    const route = pathToCore(model, profile, source.pageId);
    const onBoard = route[route.length - 1] === "core";
    t = newTarget(profile.id, { wordId: source.wordId, label: source.label, pageId: onBoard ? source.pageId : "core",
      path: onBoard ? route.reverse().slice(1) : [] });
    how = "added";
  }
  copyInstructions(source, t);
  await db.put("targets", key, t);
  return how;
}

// ---------- Backup support ----------
export async function exportTeaching(learnerId) {
  const targets = (await db.getPrefix("targets", learnerId + "|")).map((r) => r.value).filter(Boolean);
  const sessions = (await db.getPrefix("sessions", learnerId + "|")).map((r) => r.value).filter(Boolean);
  const trials = (await db.getPrefix("trials", learnerId + "|")).map((r) => r.value).filter(Boolean);
  return { targets, sessions, trials };
}
export async function deleteTeaching(learnerId) {
  for (const store of ["targets", "sessions", "trials"]) await db.delPrefix(store, learnerId + "|");
}
// Only the sessions and trials (the record of what happened); the targets and their settings stay. Used by "Clear everyday data" with
// "Also clear teaching data" ticked (js/datapanel.js).
export async function deleteSessionData(learnerId) {
  for (const store of ["sessions", "trials"]) await db.delPrefix(store, learnerId + "|");
}
// Write already-cleaned teaching data for this learner (the caller has deleted the old rows when replacing).
export async function importTeaching(learnerId, data) {
  await Promise.all([loadTemplates(), loadBoardData()]);
  for (const t of data.targets) {
    ensureInstructions(getBoardData(), t);        // a backup from before beta 2.1 has no instructions: assign the starting template
    await db.put("targets", learnerId + "|" + t.wordId, { ...t, learnerId });
  }
  for (const s of data.sessions) await db.put("sessions", learnerId + "|" + s.id, { ...s, learnerId });
  for (const t of data.trials) await db.put("trials", learnerId + "|" + t.id, { ...t, learnerId });
}

// ---------- Small per-learner choices kept on this device ----------
// The last Who / Where chosen for a session, and the longest a trial may run.
export const getLastTags = (learnerId) => load("teachLast." + learnerId, { who: "", where: "" });
export const setLastTags = (learnerId, v) => save("teachLast." + learnerId, v);
export function getMaxTrialSec(learnerId, fallback) {
  const v = load("teachMax." + learnerId, fallback);
  return typeof v === "number" && v >= 5 && v <= 300 ? v : fallback;
}
export const setMaxTrialSec = (learnerId, v) => save("teachMax." + learnerId, v);
