// Learner profiles. Several learners can share one iPad (e.g. in a clinic).
//
// A profile looks like this:
//   {
//     id, name, created, v: 3,
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
//     pins: {},                         // no longer used (always empty; kept so old backups still read)
//     notices: ["..."],                 // plain-language notes for the adult (shown in the adult
//                                       // menu until dismissed), e.g. a word that was moved by an upgrade
//     voice: {                          // adult menu > Voice (see js/speech.js)
//       voiceURI: "", pitch: 1.5,
//       rate: 1.05,                     // "Speed": a single word
//       sentenceRate: 0.9,              // "Sentence speed": the message bar and any phrase of 2+ words
//       pause: "off",                   // "Pause between words": off | short | medium | long
//     },
//     touch: {                          // touch supports (adult menu > Touch)
//       holdOn: false, holdSec: 0.5,    // hold to select
//       ignoreOn: false, ignoreSec: 1,  // ignore repeated taps
//     },
//     model: {                          // what Model mode shows (adult menu > Model prompt)
//       style: "ring", ringOpacity: 100, critterOpacity: 100,   // see js/critters.js
//       animal, color, accessory, size, arrival
//     },
//     wordsButton: "auto",              // the top-bar Words (and Forms) buttons: "auto" (from stage 3),
//                                       // "always" or "never"  (adult menu > Vocabulary stage)
//     wordsOnly: false,                 // reading stage: no pictures at all, only large words
//     keyboardButton: "auto",           // the top-bar ABC (keyboard) button: "auto" (from stage 3),
//                                       // "always" or "never"  (adult menu > Vocabulary stage)
//     speakLetters: false,              // the keyboard says each letter's name as it is typed
//   }
// Cell keys are "<page>:<row>,<col>" (+ "@84" on the 84 board). Positions are
// permanent, so a key always means the same place on the board. See js/migrate.js
// for why built-in words are stored by id instead.
//
// Profiles live in IndexedDB; photos are stored as Blobs. A photo's key is either
// "w:<word id>" (a built-in word's photo, follows the word) or a cell key (a photo on
// something the adult added). The one other key is "critter": the learner's own picture
// for the model critter (adult menu > Model prompt).
// Only tiny things (which learner is current) go in localStorage.
import * as db from "./db.js";
import { load, save, remove } from "./storage.js";
import { migrateCells, mapLegacyKey, relocateAdultWords, moveMap, describeMoves, CURRENT_PROFILE_VERSION } from "./migrate.js";
import { DEFAULT_MODEL, cleanModel } from "./critters.js";
import { PAUSE_CHOICES } from "./speech.js";

export const CHILD_VOICE = { voiceURI: "", pitch: 1.5, rate: 1.05, sentenceRate: 0.9, pause: "off" };
export const ADULT_VOICE = { voiceURI: "", pitch: 1.0, rate: 1.0, sentenceRate: 0.9, pause: "off" };

const profiles = [];
let currentId = null;
const photos = new Map(); // photoKey -> { blob, url } for the CURRENT learner only

function newId() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

export const WORDS_BUTTON_CHOICES = ["auto", "always", "never"];
export const KEYBOARD_BUTTON_CHOICES = ["auto", "always", "never"];   // same three choices for the ABC button

export const DEFAULT_TOUCH = { holdOn: false, holdSec: 0.5, ignoreOn: false, ignoreSec: 1 };

function makeProfile(name, stage = 1, voice = CHILD_VOICE) {
  return {
    id: newId(), name, created: Date.now(), v: CURRENT_PROFILE_VERSION, stage, gridSize: 45,
    words: {}, cells: {}, pages: {}, pins: {}, notices: [],
    voice: { ...voice }, touch: { ...DEFAULT_TOUCH }, model: { ...DEFAULT_MODEL },
    wordsButton: "auto", wordsOnly: false, keyboardButton: "auto", speakLetters: false,
  };
}

// A voice object with every field present: anything missing gets the child default
// (Sentence speed 0.9, pause Off). Used for old learners and when reading backups.
export function cleanVoice(v) {
  const o = v && typeof v === "object" ? v : {};
  const num = (x, d, lo, hi) => (typeof x === "number" && isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
  return {
    voiceURI: typeof o.voiceURI === "string" ? o.voiceURI.slice(0, 200) : "",
    pitch: num(o.pitch, CHILD_VOICE.pitch, 0.5, 2),
    rate: num(o.rate, CHILD_VOICE.rate, 0.5, 1.5),
    sentenceRate: num(o.sentenceRate, CHILD_VOICE.sentenceRate, 0.5, 1.5),
    pause: PAUSE_CHOICES.includes(o.pause) ? o.pause : "off",
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
  if (p.v < 4) {
    // Version 2 -> 3 (Phase 1.6): category pages were reorganized into row groups. Version 3 -> 4 (Phase 1.7):
    // the Numbers page gained the Number pad button. Words the adult ADDED to a cell that a built-in word
    // now needs are kept and moved (see js/migrate.js; running it again is harmless).
    const r = relocateAdultWords(board, p.cells, p.pages);
    p.cells = r.cells; p.pages = r.pages; p.pins = {};
    const map = moveMap(r.moves);
    if (Object.keys(map).length) {
      const prefix = p.id + "|";
      for (const row of await db.getPrefix("photos", prefix)) {          // their photos move with them
        const to = map[row.key.slice(prefix.length)];
        if (to) { await db.put("photos", prefix + to, row.value); await db.del("photos", row.key); }
      }
    }
    p.notices = [...(p.notices || []), ...describeMoves(r.moves)];
    p.v = CURRENT_PROFILE_VERSION;
    await saveProfile(p);
  }
  p.words = p.words || {}; p.cells = p.cells || {}; p.pages = p.pages || {}; p.pins = p.pins || {};
  p.notices = Array.isArray(p.notices) ? p.notices : [];
  p.gridSize = Number(p.gridSize) === 84 ? 84 : 45;
}

export async function initProfiles(board) {
  const stored = await db.getAll("profiles");
  profiles.length = 0;
  profiles.push(...stored.sort((a, b) => a.created - b.created));
  // Learners saved before touch supports existed get the (all off) defaults.
  for (const p of profiles) p.touch = { ...DEFAULT_TOUCH, ...(p.touch || {}) };
  // Learners saved before the model critter existed get the defaults (ring only, 100%).
  for (const p of profiles) p.model = cleanModel(p.model);
  // Learners saved before the Words pages (Phase 1.6B): Words button on Auto, pictures on.
  for (const p of profiles) {
    if (!WORDS_BUTTON_CHOICES.includes(p.wordsButton)) p.wordsButton = "auto";
    p.wordsOnly = p.wordsOnly === true;
  }
  // Learners saved before the keyboard and speech pacing (Phase 1.7): ABC on Auto, letters not spoken,
  // Sentence speed 0.9 and no pauses.
  for (const p of profiles) {
    if (!KEYBOARD_BUTTON_CHOICES.includes(p.keyboardButton)) p.keyboardButton = "auto";
    p.speakLetters = p.speakLetters === true;
    p.voice = cleanVoice(p.voice);
  }
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
// `data` = { name, stage, gridSize, words, cells, pages, pins, voice, touch, model, wordsButton, wordsOnly, keyboardButton, speakLetters,
//            notices, photos: [{ key, blob }] }
// Returns the saved profile.
export async function importLearner(data, replaceId = null) {
  let p = replaceId ? profiles.find((x) => x.id === replaceId) : null;
  if (p) {
    p.name = data.name;
    p.stage = data.stage;
    p.gridSize = data.gridSize;
    p.words = data.words; p.cells = data.cells; p.pages = data.pages; p.pins = data.pins;
    p.notices = data.notices || [];
    p.v = CURRENT_PROFILE_VERSION;
    p.voice = data.voice;
    p.touch = data.touch;
    p.model = data.model;
    p.wordsButton = data.wordsButton; p.wordsOnly = data.wordsOnly;
    p.keyboardButton = data.keyboardButton; p.speakLetters = data.speakLetters;
    await db.delPrefix("photos", p.id + "|");
  } else {
    p = makeProfile(data.name, data.stage, data.voice);
    p.gridSize = data.gridSize;
    p.words = data.words; p.cells = data.cells; p.pages = data.pages; p.pins = data.pins;
    p.notices = data.notices || [];
    p.touch = data.touch;
    p.model = data.model;
    p.wordsButton = data.wordsButton; p.wordsOnly = data.wordsOnly;
    p.keyboardButton = data.keyboardButton; p.speakLetters = data.speakLetters;
    profiles.push(p);
  }
  await saveProfile(p);
  for (const ph of data.photos) await db.put("photos", p.id + "|" + ph.key, { blob: ph.blob });
  if (p.id === currentId) await loadPhotos();   // the learner on screen changed: reload their photos
  return p;
}
