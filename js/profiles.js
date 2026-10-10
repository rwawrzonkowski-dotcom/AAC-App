// Learner profiles. Several learners can share one iPad (e.g. in a clinic).
//
// A profile looks like this:
//   {
//     id, name, created, v: 2,
//     stage: 1..4,                      // how many core words are revealed
//     gridSize: 45 | 84,                // which board this learner uses
//     words: {                          // changes to BUILT-IN words, by word id.
//       "want": { show: true|false, label: "...", spoken: "..." },   // They follow
//       "about-name": { fill: "Sam" },                               // the word to
//     },                                                             // either board.
//     cells: {                          // things an adult ADDED to an empty cell,
//       "favorites:0,0":    { custom: true, label: "dino", spoken: "dino" },      // by position;
//       "favorites:0,1@84": { custom: true, label: "Trains", opens: "x3k9a" },   // "@84" = the 84 board
//     },
//     pages: {                          // pages an adult made (opened by a "opens" cell above)
//       "x3k9a": { size: 45, name: "Trains", parent: "favorites", at: {row, col}, depth: 2 },
//     },
//     pins: {},                         // set only by the upgrade code (js/migrate.js)
//     voice: { voiceURI: "", pitch: 1.5, rate: 1.05 },
//     touch: {                          // touch supports (adult menu > Touch)
//       holdOn: false, holdSec: 0.5,    // hold to select
//       ignoreOn: false, ignoreSec: 1,  // ignore repeated taps
//     }
//   }
// Cell keys are "<page>:<row>,<col>" (+ "@84" on the 84 board). Positions are
// permanent, so a key always means the same place on the board. See js/migrate.js
// for why built-in words are stored by id instead.
//
// Profiles live in IndexedDB; photos are stored as Blobs. A photo's key is either
// "w:<word id>" (a built-in word's photo, follows the word) or a cell key (a photo on
// something the adult added).
// Only tiny things (which learner is current) go in localStorage.
import * as db from "./db.js";
import { load, save, remove } from "./storage.js";
import { migrateCells, mapLegacyKey } from "./migrate.js";

export const CHILD_VOICE = { voiceURI: "", pitch: 1.5, rate: 1.05 };
export const ADULT_VOICE = { voiceURI: "", pitch: 1.0, rate: 1.0 };

const profiles = [];
let currentId = null;
const photos = new Map(); // photoKey -> { blob, url } for the CURRENT learner only

function newId() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

export const DEFAULT_TOUCH = { holdOn: false, holdSec: 0.5, ignoreOn: false, ignoreSec: 1 };

function makeProfile(name, stage = 1, voice = CHILD_VOICE) {
  return {
    id: newId(), name, created: Date.now(), v: 2, stage, gridSize: 45,
    words: {}, cells: {}, pages: {}, pins: {},
    voice: { ...voice }, touch: { ...DEFAULT_TOUCH },
  };
}

// Learners saved by older versions: upgrade the shape (and move their photos).
async function upgradeProfile(p, board) {
  if (!p.v) {
    // Version 1: everything was keyed by position. Re-key it by word (see js/migrate.js).
    const { words, cells, pins } = migrateCells(board, p.cells);
    const prefix = p.id + "|";
    for (const row of await db.getPrefix("photos", prefix)) {
      const old = row.key.slice(prefix.length);
      const now = mapLegacyKey(board, old);
      if (now !== old) {
        await db.put("photos", prefix + now, row.value);
        await db.del("photos", row.key);
      }
    }
    p.words = words; p.cells = cells; p.pins = pins; p.pages = {};
    p.gridSize = 45; p.v = 2;
    await saveProfile(p);
  }
  p.words = p.words || {}; p.cells = p.cells || {}; p.pages = p.pages || {}; p.pins = p.pins || {};
  p.gridSize = Number(p.gridSize) === 84 ? 84 : 45;
}

export async function initProfiles(board) {
  const stored = await db.getAll("profiles");
  profiles.length = 0;
  profiles.push(...stored.sort((a, b) => a.created - b.created));
  // Learners saved before touch supports existed get the (all off) defaults.
  for (const p of profiles) p.touch = { ...DEFAULT_TOUCH, ...(p.touch || {}) };
  for (const p of profiles) await upgradeProfile(p, board);

  if (profiles.length === 0) {
    // First run. Carry over the old temporary ?stage= / ?voice= settings, if any.
    const oldStage = parseInt(load("stage", 1), 10);
    const oldVoice = load("voice", "child");
    const p = makeProfile(
      "Learner 1",
      oldStage >= 1 && oldStage <= 4 ? oldStage : 1,
      oldVoice === "adult" ? ADULT_VOICE : CHILD_VOICE
    );
    profiles.push(p);
    await saveProfile(p);
    remove("stage");
    remove("voice");
  }
  const wanted = load("currentProfile", null);
  currentId = (profiles.find((p) => p.id === wanted) || profiles[0]).id;
  save("currentProfile", currentId);
  await loadPhotos();
}

export const listProfiles = () => profiles.slice();
export const getCurrent = () => profiles.find((p) => p.id === currentId);
export const saveProfile = (p) => db.put("profiles", p.id, p);

export async function switchTo(id) {
  if (!profiles.find((p) => p.id === id)) return;
  currentId = id;
  save("currentProfile", id);
  await loadPhotos();
}

export async function addProfile(name) {
  const p = makeProfile(name);
  profiles.push(p);
  await saveProfile(p);
  return p;
}

export async function renameProfile(id, name) {
  const p = profiles.find((x) => x.id === id);
  if (!p) return;
  p.name = name;
  await saveProfile(p);
}

// Never deletes the last remaining learner.
export async function deleteProfile(id) {
  if (profiles.length <= 1) return false;
  const i = profiles.findIndex((p) => p.id === id);
  if (i < 0) return false;
  profiles.splice(i, 1);
  await db.del("profiles", id);
  await db.delPrefix("photos", id + "|");
  if (currentId === id) await switchTo(profiles[0].id);
  return true;
}

// ---- Photos (current learner) ----
async function loadPhotos() {
  for (const ph of photos.values()) URL.revokeObjectURL(ph.url);
  photos.clear();
  const prefix = currentId + "|";
  for (const { key, value } of await db.getPrefix("photos", prefix)) {
    if (value && value.blob) {
      photos.set(key.slice(prefix.length), { blob: value.blob, url: URL.createObjectURL(value.blob) });
    }
  }
}

export const getPhotoUrl = (photoKey) => (photos.get(photoKey) || {}).url || null;

export async function setPhoto(photoKey, blob) {
  const old = photos.get(photoKey);
  if (old) URL.revokeObjectURL(old.url);
  photos.set(photoKey, { blob, url: URL.createObjectURL(blob) });
  await db.put("photos", currentId + "|" + photoKey, { blob });
}

export async function removePhoto(photoKey) {
  const old = photos.get(photoKey);
  if (old) URL.revokeObjectURL(old.url);
  photos.delete(photoKey);
  await db.del("photos", currentId + "|" + photoKey);
}

// ---- Adult-made pages ----
export function newPageId() { return "x" + Math.random().toString(36).slice(2, 7).padEnd(5, "0"); }

// Delete an adult-made page, everything on it, and any pages made on it.
// (The button that opened it is removed by the caller.) Current learner only.
export async function deleteAdultPage(profile, pageId) {
  const doomed = [pageId];
  for (let i = 0; i < doomed.length; i++) {
    for (const [key, cell] of Object.entries(profile.cells)) {
      if (key.startsWith(doomed[i] + ":") && cell.opens && !doomed.includes(cell.opens)) doomed.push(cell.opens);
    }
  }
  for (const id of doomed) {
    for (const key of Object.keys(profile.cells)) {
      if (key.startsWith(id + ":")) { delete profile.cells[key]; await removePhoto(key); }
    }
    delete profile.pages[id];
  }
  await saveProfile(profile);
}

// ---- Backup and restore support ----
// Every photo of one learner (works for any learner, not just the current one):
// returns [{ key: photoKey, blob }, ...]
export async function getPhotoBlobs(profileId) {
  const prefix = profileId + "|";
  const rows = await db.getPrefix("photos", prefix);
  return rows.filter((r) => r.value && r.value.blob).map((r) => ({ key: r.key.slice(prefix.length), blob: r.value.blob }));
}

// Add the clean learner `data` (from js/backup.js) to this device.
//   replaceId = id of an existing learner to overwrite, or null to add a new one.
// `data` = { name, stage, gridSize, words, cells, pages, pins, voice, touch, photos: [{ key, blob }] }
// Returns the saved profile.
export async function importLearner(data, replaceId = null) {
  let p = replaceId ? profiles.find((x) => x.id === replaceId) : null;
  if (p) {
    p.name = data.name;
    p.stage = data.stage;
    p.gridSize = data.gridSize;
    p.words = data.words; p.cells = data.cells; p.pages = data.pages; p.pins = data.pins;
    p.voice = data.voice;
    p.touch = data.touch;
    await db.delPrefix("photos", p.id + "|");
  } else {
    p = makeProfile(data.name, data.stage, data.voice);
    p.gridSize = data.gridSize;
    p.words = data.words; p.cells = data.cells; p.pages = data.pages; p.pins = data.pins;
    p.touch = data.touch;
    profiles.push(p);
  }
  await saveProfile(p);
  for (const ph of data.photos) await db.put("photos", p.id + "|" + ph.key, { blob: ph.blob });
  if (p.id === currentId) await loadPhotos();   // the learner on screen changed: reload their photos
  return p;
}
