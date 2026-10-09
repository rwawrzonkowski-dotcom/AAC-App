// Backup and restore of learners (adult menu > Backup).
//
// A backup is ONE .json file you can keep in the Files app. It looks like:
//   {
//     app: "AAC-App", version: 1, exportedAt: "2026-10-09T12:00:00.000Z",
//     learners: [
//       { name, stage, cells, voice, touch,
//         photos: [ { key: "core:1,0", dataUrl: "data:image/jpeg;base64,..." } ] }
//     ]
//   }
// Photos are stored inside the file as text (base64 "data URLs"), each with the
// cell key it belongs to. The passcode is NEVER saved in a backup and never
// restored from one. Nothing here uses the network: the file stays on this iPad
// until you move it yourself.
import { h, openOverlay, askConfirm } from "./ui.js";
import {
  listProfiles, getPhotoBlobs, importLearner, DEFAULT_TOUCH, CHILD_VOICE,
} from "./profiles.js";

export const BACKUP_APP = "AAC-App";
export const BACKUP_VERSION = 1;

// ---------------------------------------------------------------- saving

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// Build the backup object for these learners (profile objects from profiles.js).
export async function buildBackup(learners) {
  const out = [];
  for (const p of learners) {
    const photos = [];
    for (const ph of await getPhotoBlobs(p.id)) {
      photos.push({ key: ph.key, dataUrl: await blobToDataUrl(ph.blob) });
    }
    out.push({
      name: p.name,
      stage: p.stage,
      cells: p.cells,
      voice: p.voice,
      touch: p.touch,
      photos,
    });
  }
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), learners: out };
}

// "Sam R." -> "Sam-R"; used inside the file name.
function safeName(name) {
  return (name || "learner").trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "learner";
}

export function backupFilename(label, date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;   // local date
  return `aac-backup-${safeName(label)}-${day}.json`;
}

// Hand the file to the browser as a download. On an iPad, Safari then shows its
// save / share sheet (choose "Save to Files").
export function downloadBackup(backup, filename) {
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Save one learner, or everyone. Returns the file name used.
export async function saveBackup(learners, label) {
  const backup = await buildBackup(learners);
  const filename = backupFilename(label);
  downloadBackup(backup, filename);
  return filename;
}

// ---------------------------------------------------------------- reading

class BackupError extends Error {}
const bad = (msg) => { throw new BackupError(msg); };

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v, fallback) => (typeof v === "number" && isFinite(v) ? v : fallback);
const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const CELL_KEY = /^[A-Za-z0-9_-]{1,40}:(\d{1,2}),(\d{1,2})$/;

function validKey(key) {
  const m = CELL_KEY.exec(key);
  return !!m && +m[1] < 5 && +m[2] < 9;      // the grid is 5 rows x 9 columns
}

// Turn base64 text into a Blob (works offline, no network).
function dataUrlToBlob(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,/.exec(dataUrl);
  if (!m) return null;
  try {
    const bin = atob(dataUrl.slice(m[0].length));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch (e) { return null; }
}

// Check one learner from the file and rebuild a CLEAN copy that contains only
// the things we expect (nothing else from the file is kept).
function cleanLearner(raw, index) {
  if (!isObj(raw)) bad(`Learner ${index + 1} in the file is not readable.`);
  const name = str(raw.name, 40).trim();
  if (!name) bad(`Learner ${index + 1} in the file has no name.`);

  const stage = Math.round(num(raw.stage, 1));
  if (stage < 1 || stage > 4) bad(`${name}: the vocabulary stage is not valid.`);

  // The adult's changes to buttons.
  const cells = {};
  if (raw.cells !== undefined && !isObj(raw.cells)) bad(`${name}: the button changes are not readable.`);
  for (const [key, ov] of Object.entries(raw.cells || {})) {
    if (!validKey(key) || !isObj(ov)) bad(`${name}: a button entry is not valid.`);
    const c = {};
    if (ov.show === true || ov.show === false) c.show = ov.show;
    if (typeof ov.label === "string") c.label = str(ov.label, 30);
    if (typeof ov.spoken === "string") c.spoken = str(ov.spoken, 60);
    if (ov.custom === true) c.custom = true;
    cells[key] = c;
  }

  const v = isObj(raw.voice) ? raw.voice : {};
  const voice = {
    voiceURI: str(v.voiceURI, 200),
    pitch: clamp(num(v.pitch, CHILD_VOICE.pitch), 0.5, 2),
    rate: clamp(num(v.rate, CHILD_VOICE.rate), 0.5, 1.5),
  };

  const t = isObj(raw.touch) ? raw.touch : {};
  const touch = {
    holdOn: t.holdOn === true,
    holdSec: clamp(num(t.holdSec, DEFAULT_TOUCH.holdSec), 0.1, 2),
    ignoreOn: t.ignoreOn === true,
    ignoreSec: clamp(num(t.ignoreSec, DEFAULT_TOUCH.ignoreSec), 0.25, 3),
  };

  if (raw.photos !== undefined && !Array.isArray(raw.photos)) bad(`${name}: the photos are not readable.`);
  const photos = [];
  for (const ph of raw.photos || []) {
    if (!isObj(ph) || !validKey(ph.key) || typeof ph.dataUrl !== "string") bad(`${name}: a photo entry is not valid.`);
    const blob = dataUrlToBlob(ph.dataUrl);
    if (!blob) bad(`${name}: a photo could not be read.`);
    photos.push({ key: ph.key, blob });
  }
  return { name, stage, cells, voice, touch, photos };
}

// Read and check a chosen file. Resolves to { exportedAt, learners: [clean...] }
// or throws an Error whose message is safe to show to the adult.
export async function readBackupFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); }
  catch (e) { bad("That file is not a backup from this app (it could not be read)."); }
  if (!isObj(data) || data.app !== BACKUP_APP) bad("That file is not a backup from this app.");
  if (!Number.isInteger(data.version) || data.version < 1) bad("This backup has no valid version number.");
  if (data.version > BACKUP_VERSION) bad("This backup was made by a newer version of the app. Please update the app first.");
  if (!Array.isArray(data.learners) || data.learners.length === 0) bad("This backup does not contain any learners.");
  if (data.learners.length > 50) bad("This backup has too many learners.");
  const learners = data.learners.map(cleanLearner);
  return { exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : "", learners };
}

// ---------------------------------------------------------------- restoring

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// "Sam" -> "Sam (2)" if "Sam" is taken, and so on.
function uniqueName(name, taken) {
  if (!taken.some((n) => sameName(n, name))) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name} (${i})`;
    if (!taken.some((n) => sameName(n, candidate))) return candidate;
  }
}

function showMessage(title, text) {
  return new Promise((resolve) => {
    const o = openOverlay([
      h("h2", { text: title }),
      h("p", { class: "confirm-text", text }),
      h("div", { class: "btn-row" },
        h("button", { type: "button", class: "btn primary", id: "backup-msg-ok", text: "OK",
          onclick: () => { o.close(); resolve(); } })),
    ], { sheetClass: "small" });
  });
}

// Whole restore flow for a chosen file: check it, show what is inside, ask what
// to do for each learner, then restore. NOTHING is changed until the adult taps
// "Restore" (and confirms, if any learner would be replaced).
// Resolves to a short result sentence, or "" if cancelled.
export async function restoreFromFile(file) {
  let backup;
  try { backup = await readBackupFile(file); }
  catch (e) {
    await showMessage("Cannot restore", e instanceof BackupError ? e.message : "That file could not be read.");
    return "";
  }

  const existing = listProfiles();
  // choice[i] = "add" or the id of the existing learner to replace
  const choice = backup.learners.map(() => "add");

  return new Promise((resolve) => {
    const rows = backup.learners.map((l, i) => {
      const match = existing.find((p) => sameName(p.name, l.name));
      const addBtn = h("button", { type: "button", class: "seg on", id: `restore-add-${i}`, text: "Add as a new learner" });
      const repBtn = match
        ? h("button", { type: "button", class: "seg", id: `restore-replace-${i}`, text: `Replace the existing "${match.name}"` })
        : null;
      const paint = () => {
        addBtn.classList.toggle("on", choice[i] === "add");
        if (repBtn) repBtn.classList.toggle("on", choice[i] !== "add");
      };
      addBtn.addEventListener("click", () => { choice[i] = "add"; paint(); });
      if (repBtn) repBtn.addEventListener("click", () => { choice[i] = match.id; paint(); });
      const photoText = l.photos.length === 1 ? "1 photo" : `${l.photos.length} photos`;
      return h("div", { class: "restore-row" },
        h("div", { class: "restore-name", text: l.name }),
        h("div", { class: "muted", text: `Stage ${l.stage}, ${photoText}` }),
        h("div", { class: "seg-row" }, addBtn, repBtn),
        match ? null : h("div", { class: "muted", text: "No learner with this name here yet." }));
    });

    const finish = (msg) => { o.close(); resolve(msg); };

    async function go() {
      const replacing = backup.learners
        .map((l, i) => (choice[i] !== "add" ? existing.find((p) => p.id === choice[i]) : null))
        .filter(Boolean);
      if (replacing.length) {
        const names = replacing.map((p) => p.name).join(", ");
        const sure = await askConfirm(
          `Replace ${names}? Their current settings, changes and photos on this iPad will be erased and swapped for the ones in the backup.`,
          "Replace");
        if (!sure) return;
      }
      const taken = listProfiles().map((p) => p.name);
      let added = 0, replaced = 0;
      for (let i = 0; i < backup.learners.length; i++) {
        const l = backup.learners[i];
        if (choice[i] === "add") {
          const name = uniqueName(l.name, taken);
          taken.push(name);
          await importLearner({ ...l, name }, null);
          added++;
        } else {
          await importLearner(l, choice[i]);
          replaced++;
        }
      }
      const parts = [];
      if (added) parts.push(added === 1 ? "1 learner added" : `${added} learners added`);
      if (replaced) parts.push(replaced === 1 ? "1 learner replaced" : `${replaced} learners replaced`);
      finish("Restored: " + parts.join(", ") + ".");
    }

    const total = backup.learners.reduce((n, l) => n + l.photos.length, 0);
    const when = backup.exportedAt ? new Date(backup.exportedAt) : null;
    const o = openOverlay([
      h("h2", { text: "Restore from backup" }),
      h("p", { class: "muted",
        text: `This file has ${backup.learners.length === 1 ? "1 learner" : backup.learners.length + " learners"} ` +
          `and ${total === 1 ? "1 photo" : total + " photos"}` +
          (when && !isNaN(when) ? `, saved ${when.toLocaleDateString()}.` : ".") +
          " Choose what to do with each learner. Nothing changes until you tap Restore." }),
      h("div", { class: "restore-list" }, rows),
      h("p", { class: "muted", text: "The passcode is never part of a backup, so it will not change." }),
      h("div", { class: "btn-row" },
        h("button", { type: "button", class: "btn", id: "restore-cancel", text: "Cancel", onclick: () => finish("") }),
        h("button", { type: "button", class: "btn primary", id: "restore-go", text: "Restore", onclick: go })),
    ], { sheetClass: "editor" });
  });
}
