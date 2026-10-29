// Scenes (Phase 3, beta 3.0): saving, reading, backing up and restoring a learner's scenes.
//
// WHAT A SCENE IS: one photo an adult took of a place or activity (kitchen, park, bath...) plus the list of buttons that appear
// in the context strip while the scene is active. Two kinds of buttons:
//   "object"  a thing found in the photo: its label, the box around it (as fractions of the photo: 0 to 1) and a small square
//             crop of the photo (about 256 px) that is drawn on the button.
//   "related" a word that goes with the scene (push, drink, more...). It has no photo: it is drawn with the board's symbol.
// Both have a label, the text that is spoken, and (when the word is on the VOICE board) its word id, which is how the app finds
// the word's permanent spot on the board to glow.
//
// STORAGE: IndexedDB store "scenes", one row per scene, key "<learnerId>|<sceneId>". The photo and every crop are Blobs inside
// the row. Everything stays on this iPad; deleting a learner deletes their scenes (js/profiles.js).
//
//   scene = { id, learnerId, name, order, created, showPhoto, photo: Blob, photoW, photoH,
//             items: [ { id, kind: "object" | "related", label, spoken, wordId | null, box?: {x,y,w,h}, crop?: Blob } ] }
//
// BACKUP (file version 15, "Include scenes and photos"): { active: sceneId | null, list: [ the same, with the Blobs written as
// base64 "data URLs" ] }. A backup made before version 15 has no scenes and restores as before.
import * as db from "./db.js";

export const MAX_SCENES = 50;      // per learner
export const MAX_ITEMS = 60;       // buttons in one scene

const key = (learnerId, id) => learnerId + "|" + id;
export const newSceneId = () => "sc" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const newItemId = () => "i" + Math.random().toString(36).slice(2, 9);

// A learner's scenes, in the order the adult arranged them.
export async function listScenes(learnerId) {
  const rows = await db.getPrefix("scenes", learnerId + "|");
  return rows.map((r) => r.value).filter((s) => s && s.id).sort((a, b) => (a.order - b.order) || (a.created - b.created));
}
export const getScene = (learnerId, id) => db.get("scenes", key(learnerId, id));
export const putScene = (scene) => db.put("scenes", key(scene.learnerId, scene.id), scene);
export const deleteScene = (learnerId, id) => db.del("scenes", key(learnerId, id));
export const deleteScenes = (learnerId) => db.delPrefix("scenes", learnerId + "|");

// Save a new order: `scenes` is the list in the wanted order.
export async function saveOrder(scenes) {
  scenes.forEach((s, i) => { s.order = i; });
  await db.batch(scenes.map((s) => ({ store: "scenes", key: key(s.learnerId, s.id), value: s })));
}

// ---------------------------------------------------------------- backup
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function exportScenes(learnerId, activeId) {
  const list = [];
  for (const s of await listScenes(learnerId)) {
    const items = [];
    for (const it of s.items) {
      const o = { id: it.id, kind: it.kind, label: it.label, spoken: it.spoken, wordId: it.wordId || null };
      if (it.box) o.box = it.box;
      if (it.crop) o.crop = await blobToDataUrl(it.crop);
      items.push(o);
    }
    list.push({ id: s.id, name: s.name, order: s.order, created: s.created, showPhoto: !!s.showPhoto,
      photoW: s.photoW, photoH: s.photoH, photo: await blobToDataUrl(s.photo), items });
  }
  return { active: list.some((s) => s.id === activeId) ? activeId : null, list };
}

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const WORD_ID = /^[A-Za-z0-9_:,@.+~-]{1,80}$/;
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const txt = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const unit = (v) => (typeof v === "number" && isFinite(v) ? Math.min(1, Math.max(0, v)) : null);

function dataUrlToBlob(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,/.exec(typeof dataUrl === "string" ? dataUrl : "");
  if (!m) return null;
  try {
    const bin = atob(dataUrl.slice(m[0].length));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch (e) { return null; }
}

// Read the `scenes` part of a backup file and keep only what we know. Anything unreadable is skipped (never an error).
// Returns { active, list: [scene without learnerId] } or null.
export function cleanScenesBackup(raw) {
  if (!isObj(raw) || !Array.isArray(raw.list)) return null;
  const list = [];
  const seen = new Set();
  for (const s of raw.list.slice(0, MAX_SCENES)) {
    if (!isObj(s) || typeof s.id !== "string" || !ID.test(s.id) || seen.has(s.id)) continue;
    const photo = dataUrlToBlob(s.photo);
    if (!photo) continue;
    seen.add(s.id);
    const items = [];
    for (const it of (Array.isArray(s.items) ? s.items : []).slice(0, MAX_ITEMS)) {
      if (!isObj(it) || (it.kind !== "object" && it.kind !== "related")) continue;
      const label = txt(it.label, 40).trim();
      if (!label) continue;
      const o = { id: ID.test(it.id) ? it.id : newItemId(), kind: it.kind, label, spoken: txt(it.spoken, 80) || label,
        wordId: typeof it.wordId === "string" && WORD_ID.test(it.wordId) ? it.wordId : null };
      if (it.kind === "object") {
        const b = isObj(it.box) ? it.box : {};
        const x = unit(b.x), y = unit(b.y), w = unit(b.w), hh = unit(b.h);
        if (x === null || y === null || w === null || hh === null || w < 0.005 || hh < 0.005) continue;
        o.box = { x, y, w, h: hh };
        const crop = dataUrlToBlob(it.crop);
        if (crop) o.crop = crop;
      }
      items.push(o);
    }
    list.push({ id: s.id, name: txt(s.name, 40).trim() || "Scene", order: Number.isFinite(s.order) ? s.order : list.length,
      created: Number.isFinite(s.created) ? s.created : Date.now(), showPhoto: s.showPhoto === true,
      photoW: Math.round(Number(s.photoW)) || 0, photoH: Math.round(Number(s.photoH)) || 0, photo, items });
  }
  if (!list.length && !(raw.list.length === 0)) return null;
  return { active: typeof raw.active === "string" && seen.has(raw.active) ? raw.active : null, list };
}

// Replace this learner's scenes with the ones from a backup. Returns the id of the scene that was active (or null).
export async function importScenes(learnerId, data) {
  await deleteScenes(learnerId);
  await db.batch(data.list.map((s) => ({ store: "scenes", key: key(learnerId, s.id), value: { ...s, learnerId } })));
  return data.active;
}
