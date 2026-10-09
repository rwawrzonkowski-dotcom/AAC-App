// Learner profiles. Several learners can share one iPad (e.g. in a clinic).
//
// A profile looks like this:
//   {
//     id, name, created,
//     stage: 1..4,                      // how many core words are revealed
//     cells: {                          // everything an adult changed, by cell
//       "core:1,0": { show: true|false, label: "...", spoken: "..." },
//       "favorites:0,0": { custom: true, label: "dino", spoken: "dino" },
//     },
//     voice: { voiceURI: "", pitch: 1.5, rate: 1.05 },
//     touch: {                          // touch supports (adult menu > Touch)
//       holdOn: false, holdSec: 0.5,    // hold to select
//       ignoreOn: false, ignoreSec: 1,  // ignore repeated taps
//     }
//   }
// Cell keys are "<page>:<row>,<col>". Positions are permanent, so a key always
// means the same place on the board.
//
// Profiles live in IndexedDB; photos are stored as Blobs, one per cell.
// Only tiny things (which learner is current) go in localStorage.
import * as db from "./db.js";
import { load, save, remove } from "./storage.js";

export const CHILD_VOICE = { voiceURI: "", pitch: 1.5, rate: 1.05 };
export const ADULT_VOICE = { voiceURI: "", pitch: 1.0, rate: 1.0 };

const profiles = [];
let currentId = null;
const photos = new Map(); // cellKey -> { blob, url } for the CURRENT learner only

function newId() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

export const DEFAULT_TOUCH = { holdOn: false, holdSec: 0.5, ignoreOn: false, ignoreSec: 1 };

function makeProfile(name, stage = 1, voice = CHILD_VOICE) {
  return { id: newId(), name, created: Date.now(), stage, cells: {}, voice: { ...voice }, touch: { ...DEFAULT_TOUCH } };
}

export async function initProfiles() {
  const stored = await db.getAll("profiles");
  profiles.length = 0;
  profiles.push(...stored.sort((a, b) => a.created - b.created));
  // Learners saved before touch supports existed get the (all off) defaults.
  for (const p of profiles) p.touch = { ...DEFAULT_TOUCH, ...(p.touch || {}) };

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

export const getPhotoUrl = (cellKey) => (photos.get(cellKey) || {}).url || null;

export async function setPhoto(cellKey, blob) {
  const old = photos.get(cellKey);
  if (old) URL.revokeObjectURL(old.url);
  photos.set(cellKey, { blob, url: URL.createObjectURL(blob) });
  await db.put("photos", currentId + "|" + cellKey, { blob });
}

export async function removePhoto(cellKey) {
  const old = photos.get(cellKey);
  if (old) URL.revokeObjectURL(old.url);
  photos.delete(cellKey);
  await db.del("photos", currentId + "|" + cellKey);
}

// ---- Backup and restore support ----
// Every photo of one learner (works for any learner, not just the current one):
// returns [{ key: cellKey, blob }, ...]
export async function getPhotoBlobs(profileId) {
  const prefix = profileId + "|";
  const rows = await db.getPrefix("photos", prefix);
  return rows.filter((r) => r.value && r.value.blob).map((r) => ({ key: r.key.slice(prefix.length), blob: r.value.blob }));
}

// Add the clean learner `data` (from js/backup.js) to this device.
//   replaceId = id of an existing learner to overwrite, or null to add a new one.
// `data` = { name, stage, cells, voice, touch, photos: [{ key, blob }] }
// Returns the saved profile.
export async function importLearner(data, replaceId = null) {
  let p = replaceId ? profiles.find((x) => x.id === replaceId) : null;
  if (p) {
    p.name = data.name;
    p.stage = data.stage;
    p.cells = data.cells;
    p.voice = data.voice;
    p.touch = data.touch;
    await db.delPrefix("photos", p.id + "|");
  } else {
    p = makeProfile(data.name, data.stage, data.voice);
    p.cells = data.cells;
    p.touch = data.touch;
    profiles.push(p);
  }
  await saveProfile(p);
  for (const ph of data.photos) await db.put("photos", p.id + "|" + ph.key, { blob: ph.blob });
  if (p.id === currentId) await loadPhotos();   // the learner on screen changed: reload their photos
  return p;
}
