// Backup and restore of learners (adult menu > Backup).
//
// A backup is ONE .json file you can keep in the Files app. It looks like:
//   {
//     app: "AAC-App", version: 14, exportedAt: "2026-10-09T12:00:00.000Z",
//     teachingTemplates: { templateId: { clinical: {field: text}, parent: {field: text} } },     (optional: only in "all learners" files)
//     learners: [
//       { name, stage, gridSize, words, cells, pages, pins, voice, touch, model, wordsButton, wordsOnly,
//         keyboardButton, speakLetters, wordDial,
//         teaching: { targets: [...], sessions: [...], trials: [...] },     (optional: see below)
//         photos: [ { key: "w:want", dataUrl: "data:image/jpeg;base64,..." } ] }
//     ]
//   }
// `words` = changes to built-in words (by word id), `cells` = things added to empty
// cells (by position), `pages` = pages the adult made. See js/profiles.js.
// `model` = the Model prompt settings (js/critters.js). A learner's own critter picture
// is one of the photos, with the key "critter".
// `wordsButton` ("auto" | "always" | "never") and `wordsOnly` (the reading stage) came with version 5
// (Phase 1.6B, the Words pages); an older backup restores with Auto and pictures on.
// `voice` holds voiceURI, pitch, rate (word speed), sentenceRate and pause; `keyboardButton` ("auto" | "always" |
// "never") and `speakLetters` came with version 6 (Phase 1.7, the keyboard and speech pacing). An older backup
// restores with Auto, letters not spoken, Sentence speed 0.9 and no pauses. Version 7 (Phase 1.7B) only changed the
// layout (toy and animal folders): a backup older than 7 has its adult-added words checked against the new folder buttons.
// Version 8 (Phase 1.8A) is the same kind of change (folders on Places, People, Chat, Feelings, Drinks and Food): a backup
// older than 8 is checked again, and gets a note that "ranch" moved into More food. Version 9 (Phase 1.8B) is the same kind of
// change again (folders on the Describing, Time, Numbers, Clothes, Outside and Things Words pages): a backup older than 9 is checked.
// `wordDial` ({ mode, holdSec, markers }: the press-and-hold word-forms dial) came with version 10 (beta). A backup without it
// (every version 9 and older backup, including ones made by the stable app) restores with the defaults: Auto, 0.5 s, markers on.
// Version 10 changed no layout, so the version 9 checks still apply to older backups.
// `teaching` (Phase 2, version 11, beta) holds the learner's targets, teaching sessions and trials (see js/teachdata.js). The adult
// chooses in the backup section whether to include it ("Include teaching data", on by default); without it the field is simply
// missing. A reward picture of a target is one of the photos, with the key "reward:<word id>", and travels with the teaching
// data. Every older backup (version 10 and below) has no `teaching` field and restores as before; restoring one over an
// existing learner leaves that learner's teaching data alone. A version 11 file is too new for the stable app, so it can only
// be restored in the beta.
// Version 12 (beta 2.1, teaching instructions) added `instructions` to every target ({ templateId, overrides }) and, in a backup of
// ALL learners, `teachingTemplates`: the wording of the templates this device has edited (device-wide, not per learner; only the
// changed fields). Version 11 backups restore with the starting template assigned to every target (js/templates.js); restoring a
// file with `teachingTemplates` asks before replacing this device's own edited templates. The template wording itself is in
// data/teaching-templates.json and is not saved in backups.
// Version 13 (beta 2.2, everyday recording) added `everyday` to a learner: { settings: { record, retentionDays }, events, utterances,
// daily, firstSeen } (see js/everyday.js for what each row holds). The adult chooses in the backup section whether to include it
// ("Include everyday use data", on by default); without it the field is missing. Restoring brings the raw rows and the daily
// summaries, then rebuilds the summaries of the days that have raw events, so they always match. A backup older than 13 has no
// `everyday` field and restores as before; restoring one over an existing learner leaves that learner's everyday data alone.
// Version 14 (beta 2.3, prompt ladders) changed the targets inside `teaching`: instead of a numeric prompt level and "most help" ceiling a
// target has `ladderMode` ("default" | "custom"), `stepSize` ("standard" | "medium" | "fine"), `customLadder` ([{ type, opacity }], most help
// first) and `pos` (its starting step; the ladder's length means Independent), and every new trial has `promptStep`, `startStep`, `help`
// and `startHelp` next to the old `promptLevel` / `startLevel`. A target without `ladderVersion: 1` (every backup of version 11 to 13) is
// converted on the way in by cleanTarget (js/teaching.js: old level 7 -> Model 100%, 6 -> 75%, 5 -> 50%, 4 and 3 and 2 -> 25%, 1 and 0 ->
// Independent, the change logged in its history as "ladder update"); an old trial keeps its data and gets a computed `help`.
// Version 1 backups (made before Phase 1.5A, keyed only by position), version 2
// backups (made before the model critter) and version 3 backups (made before the category
// pages were reorganized into row groups, Phase 1.6) are still readable: they are upgraded on
// the way in (see js/migrate.js; missing Model prompt settings become the defaults, and a word
// the adult had added to a cell that a built-in word now needs is moved to a free cell).
// Photos are stored inside the file as text (base64 "data URLs"), each with the
// photo key it belongs to. The passcode is NEVER saved in a backup and never
// restored from one. Nothing here uses the network: the file stays on this iPad
// until you move it yourself.
import { h, openOverlay, askConfirm } from "./ui.js";
import {
  listProfiles, getPhotoBlobs, importLearner, DEFAULT_TOUCH, cleanVoice, KEYBOARD_BUTTON_CHOICES,
} from "./profiles.js";
import { exportTeaching } from "./teachdata.js";
import { exportEveryday, cleanEverydayBackup } from "./everyday.js";
import { cleanTarget, cleanSession, cleanTrial } from "./teaching.js";
import { getEdits, hasEdits, cleanEdits, replaceEdits, editedCount } from "./templates.js";
import { getBoardData } from "./boarddata.js";
import { SIZES, MAX_DEPTH } from "./boardmodel.js";
import { migrateCells, mapLegacyKey, relocateAdultWords, moveMap, describeMoves, RANCH_NOTE } from "./migrate.js";
import { cleanModel } from "./critters.js";
import { WORDS_BUTTON_CHOICES, cleanWordDial } from "./profiles.js";

export const BACKUP_APP = "AAC-App";
export const BACKUP_VERSION = 14;

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
// options.teaching (default true): include the learners' targets, sessions, trials and reward pictures.
// options.everyday (default true): include the learners' everyday use data (word events, utterances, daily summaries, settings).
// options.templates (default false; the "all learners" button): include this device's edited teaching templates, if there are any.
export async function buildBackup(learners, { teaching = true, templates = false, everyday = true } = {}) {
  const out = [];
  for (const p of learners) {
    const photos = [];
    for (const ph of await getPhotoBlobs(p.id)) {
      if (!teaching && ph.key.startsWith("reward:")) continue;      // reward pictures belong to the teaching data
      photos.push({ key: ph.key, dataUrl: await blobToDataUrl(ph.blob) });
    }
    out.push({
      name: p.name,
      stage: p.stage,
      gridSize: p.gridSize,
      words: p.words,
      cells: p.cells,
      pages: p.pages,
      pins: p.pins,
      voice: p.voice,
      touch: p.touch,
      model: p.model,
      wordsButton: p.wordsButton,
      wordsOnly: p.wordsOnly,
      keyboardButton: p.keyboardButton,
      speakLetters: p.speakLetters,
      wordDial: p.wordDial,
      ...(teaching ? { teaching: await exportTeaching(p.id) } : {}),
      ...(everyday ? { everyday: await exportEveryday(p.id) } : {}),
      photos,
    });
  }
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(),
    ...(templates && hasEdits() ? { teachingTemplates: getEdits() } : {}), learners: out };
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
export async function saveBackup(learners, label, options) {
  const backup = await buildBackup(learners, options);
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
const CELL_KEY = /^[A-Za-z0-9_-]{1,40}:(\d{1,2}),(\d{1,2})(@84)?$/;
const WORD_KEY = /^w:[A-Za-z0-9_-]{1,40}$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;

// A position key such as "food:0,3" or "food:0,3@84" that lies inside its grid.
function validCellKey(key) {
  const m = CELL_KEY.exec(key);
  if (!m) return false;
  const g = SIZES[m[3] ? 84 : 45];
  return +m[1] < g.rows && +m[2] < g.cols;
}
// A photo key: a built-in word ("w:want"), a cell, or the learner's own critter picture.
const REWARD_KEY = /^reward:[A-Za-z0-9_:,@.|-]{1,80}$/;
const validKey = (key) => typeof key === "string" && (key === "critter" || WORD_KEY.test(key) || REWARD_KEY.test(key) || validCellKey(key));

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

// Keep only the fields we know in one button's changes.
function cleanOverride(ov) {
  const c = {};
  if (ov.show === true || ov.show === false) c.show = ov.show;
  if (typeof ov.label === "string") c.label = str(ov.label, 30);
  if (typeof ov.spoken === "string") c.spoken = str(ov.spoken, 60);
  if (typeof ov.fill === "string") c.fill = str(ov.fill, 60);
  return c;
}

// Check one learner from the file and rebuild a CLEAN copy that contains only
// the things we expect (nothing else from the file is kept).
function cleanLearner(raw, index, version) {
  if (!isObj(raw)) bad(`Learner ${index + 1} in the file is not readable.`);
  const name = str(raw.name, 40).trim();
  if (!name) bad(`Learner ${index + 1} in the file has no name.`);
  const board = getBoardData();

  const stage = Math.round(num(raw.stage, 1));
  if (stage < 1 || stage > 4) bad(`${name}: the vocabulary stage is not valid.`);

  if (raw.cells !== undefined && !isObj(raw.cells)) bad(`${name}: the button changes are not readable.`);
  if (raw.photos !== undefined && !Array.isArray(raw.photos)) bad(`${name}: the photos are not readable.`);

  let gridSize = 45, words = {}, cells = {}, pages = {}, pins = {};
  let photoKey = (k) => k;

  if (version < 2) {
    // Made before Phase 1.5A: only position-keyed changes. Upgrade them.
    const old = {};
    for (const [key, ov] of Object.entries(raw.cells || {})) {
      if (!validCellKey(key) || !isObj(ov)) bad(`${name}: a button entry is not valid.`);
      const c = cleanOverride(ov);
      if (ov.custom === true) c.custom = true;
      old[key] = c;
    }
    ({ words, cells, pins } = migrateCells(board, old));
    photoKey = (k) => mapLegacyKey(board, k);
  } else {
    gridSize = Number(raw.gridSize) === 84 ? 84 : 45;
    for (const [id, ov] of Object.entries(isObj(raw.words) ? raw.words : {})) {
      if (!ID.test(id) || !isObj(ov)) bad(`${name}: a word entry is not valid.`);
      if (board.words[id]) words[id] = cleanOverride(ov);        // unknown words are ignored
    }
    for (const [key, ov] of Object.entries(raw.cells || {})) {
      if (!validCellKey(key) || !isObj(ov)) bad(`${name}: a button entry is not valid.`);
      const c = cleanOverride(ov);
      if (ov.custom === true) c.custom = true;
      if (typeof ov.opens === "string" && ID.test(ov.opens)) c.opens = ov.opens;
      delete c.fill;
      cells[key] = c;
    }
    for (const [id, pg] of Object.entries(isObj(raw.pages) ? raw.pages : {})) {
      if (!ID.test(id) || !isObj(pg) || !isObj(pg.at)) bad(`${name}: an adult-made page is not valid.`);
      const size = Number(pg.size) === 84 ? 84 : 45;
      const depth = Math.round(num(pg.depth, 0));
      const row = Math.round(num(pg.at.row, -1)), col = Math.round(num(pg.at.col, -1));
      if (depth < 1 || depth > MAX_DEPTH || row < 0 || col < 0 || row >= SIZES[size].rows || col >= SIZES[size].cols ||
          typeof pg.parent !== "string" || !ID.test(pg.parent)) bad(`${name}: an adult-made page is not valid.`);
      pages[id] = { size, name: str(pg.name, 30), parent: pg.parent, at: { row, col }, depth };
    }
    for (const [key, p] of Object.entries(isObj(raw.pins) ? raw.pins : {})) {
      if (/^(45|84):[A-Za-z0-9_-]{1,40}:[A-Za-z0-9_-]{1,40}$/.test(key) && Array.isArray(p) && p.length === 2 &&
          p.every((n) => Number.isInteger(n) && n >= 0 && n < 12)) pins[key] = p;
    }
  }

  // Voice. Sentence speed and the pause only count in version 6+ backups (older ones get 0.9 and Off).
  const voice = cleanVoice(isObj(raw.voice) ? (version >= 6 ? raw.voice : { ...raw.voice, sentenceRate: undefined, pause: undefined }) : null);

  const t = isObj(raw.touch) ? raw.touch : {};
  const touch = {
    holdOn: t.holdOn === true,
    holdSec: clamp(num(t.holdSec, DEFAULT_TOUCH.holdSec), 0.1, 2),
    ignoreOn: t.ignoreOn === true,
    ignoreSec: clamp(num(t.ignoreSec, DEFAULT_TOUCH.ignoreSec), 0.25, 3),
  };

  // Backups older than version 3 have no Model prompt settings: use the defaults.
  const model = cleanModel(version >= 3 ? raw.model : null);

  // Backups older than version 5 were made before the Words pages: Auto, and pictures on.
  const wordsButton = version >= 5 && WORDS_BUTTON_CHOICES.includes(raw.wordsButton) ? raw.wordsButton : "auto";
  const wordsOnly = version >= 5 && raw.wordsOnly === true;
  // Backups older than version 6 were made before the keyboard: ABC on Auto, letters not spoken.
  const keyboardButton = version >= 6 && KEYBOARD_BUTTON_CHOICES.includes(raw.keyboardButton) ? raw.keyboardButton : "auto";
  const speakLetters = version >= 6 && raw.speakLetters === true;
  // Backups older than version 10 (or without the field) were made before the word-forms dial: the defaults.
  const wordDial = cleanWordDial(version >= 10 ? raw.wordDial : null);

  // Backups older than version 4 were made before the row-group category pages (Phase 1.6), and backups
  // older than version 9 before the Number pad button, the toy and animal folder buttons (Phase 1.7), the folder
  // buttons on Places, People, Chat, Feelings, Drinks and Food (Phase 1.8A) and on the Words pages (Phase 1.8B): move any
  // word the adult added to a cell that a built-in word now needs. (Pins are obsolete. Running this on a backup that is already
  // tidy moves nothing.)
  let notices = [];
  let moved = {};
  if (version < 9) {
    const r = relocateAdultWords(board, cells, pages);
    cells = r.cells; pages = r.pages; pins = {};
    moved = moveMap(r.moves);
    notices = describeMoves(r.moves);
    if (version < 8) notices.push(RANCH_NOTE);   // (Phase 1.8A: ranch moved into More food; version 8 backups already know)
  }

  const photos = [];
  for (const ph of raw.photos || []) {
    if (!isObj(ph) || !validKey(ph.key) || typeof ph.dataUrl !== "string") bad(`${name}: a photo entry is not valid.`);
    const blob = dataUrlToBlob(ph.dataUrl);
    if (!blob) bad(`${name}: a photo could not be read.`);
    const key = version < 2 ? photoKey(ph.key) : ph.key;
    photos.push({ key: moved[key] || key, blob });          // a moved word's photo moves with it
  }
  // Teaching data exists only in version 11+ backups made with "Include teaching data". Anything unreadable is skipped.
  let teaching = null;
  if (version >= 11 && isObj(raw.teaching)) {
    const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
    const seen = new Set();
    teaching = {
      targets: list(raw.teaching.targets, 500).map((t) => cleanTarget(t, "")).filter((t) => t && !seen.has(t.wordId) && seen.add(t.wordId)),
      sessions: list(raw.teaching.sessions, 20000).map((s) => cleanSession(s, "")).filter(Boolean),
      trials: list(raw.teaching.trials, 400000).map((t) => cleanTrial(t, "")).filter(Boolean),
    };
  }
  // Everyday use data exists only in version 13+ backups made with "Include everyday use data".
  const everyday = version >= 13 ? cleanEverydayBackup(raw.everyday) : null;
  return { name, stage, gridSize, words, cells, pages, pins, voice, touch, model, wordsButton, wordsOnly, keyboardButton, speakLetters, wordDial, notices, teaching, everyday, photos };
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
  const learners = data.learners.map((l, i) => cleanLearner(l, i, data.version));
  const teachingTemplates = data.version >= 12 ? cleanEdits(data.teachingTemplates) : {};
  return { exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : "", learners, teachingTemplates };
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
      const tc = (l.teaching ? `, teaching data (${l.teaching.targets.length} targets, ${l.teaching.sessions.length} sessions)` : "") +
        (l.everyday ? `, everyday use data (${l.everyday.events.length} words, ${l.everyday.utterances.length} messages)` : "");
      return h("div", { class: "restore-row" },
        h("div", { class: "restore-name", text: l.name }),
        h("div", { class: "muted", text: `Stage ${l.stage}, ${photoText}${tc}` }),
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
      // Edited teaching templates in the file (a backup of all learners): ask before replacing this device's own edits.
      const tn = Object.keys(backup.teachingTemplates).length;
      let templatesNote = "";
      if (tn) {
        const ok = !hasEdits() || await askConfirm(
          `This backup has ${tn} edited teaching ${tn === 1 ? "template" : "templates"}. This device already has ${editedCount()} of its own. ` +
          "Replace this device's edited templates with the ones in the backup? (Cancel keeps this device's; the learners are still restored.)", "Replace");
        if (ok) { replaceEdits(backup.teachingTemplates); templatesNote = " Edited teaching templates restored."; }
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
      finish("Restored: " + parts.join(", ") + "." + templatesNote);
    }

    const total = backup.learners.reduce((n, l) => n + l.photos.length, 0);
    const when = backup.exportedAt ? new Date(backup.exportedAt) : null;
    const o = openOverlay([
      h("h2", { text: "Restore from backup" }),
      h("p", { class: "muted",
        text: `This file has ${backup.learners.length === 1 ? "1 learner" : backup.learners.length + " learners"} ` +
          `and ${total === 1 ? "1 photo" : total + " photos"}` +
          (Object.keys(backup.teachingTemplates).length ? " and edited teaching templates" : "") +
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
