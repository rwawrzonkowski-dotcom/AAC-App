// App entry point. Ties everything together:
//   - loads the word map and the current learner's profile
//   - draws the main board (45 or 84 locations) or a category / adult-made page
//   - handles taps (speak / navigate), the adult lock, Edit mode and Model mode
import { speak, initSpeech, setVoiceSettings } from "./speech.js";
import { renderBoard, attachPressHandling, fitLabelsOnResize } from "./board.js";
import { buildModel, getPage, pathToCore, resolvePage, posKey, MAX_DEPTH } from "./boardmodel.js";
import { loadBoardData } from "./boarddata.js";
import {
  initProfiles, getCurrent, saveProfile, getPhotoUrl, setPhoto, removePhoto, newPageId, deleteAdultPage,
} from "./profiles.js";
import { attachHold } from "./hold.js";
import { requestAdultAccess } from "./lock.js";
import { openAdultMenu } from "./adult.js";
import { askConfirm } from "./ui.js";
import { openCellEditor } from "./editor.js";
import { logWord } from "./events.js";

const HOLD_TO_OPEN_MS = 3000;   // adult corner target
const HOLD_TO_END_MODEL_MS = 2000;
const MODEL_RETURN_DELAY_MS = 600;   // model mode: pause on each page while stepping back out
let returning = false;                // true during that pause

// ---------- Touch supports (adult menu > Touch), per learner ----------
// Only the child's board uses these, and not in Edit mode.
let lastSelectAt = -Infinity;        // when a word was last selected (ms)
const touchActive = () => !state.editing;

// How long a finger must stay down on a button (0 = no hold needed).
function holdMs() {
  const t = getCurrent().touch;
  return touchActive() && t.holdOn ? Math.round(t.holdSec * 1000) : 0;
}
// True while repeated taps are being ignored.
function tapsBlocked() {
  const t = getCurrent().touch;
  return touchActive() && t.ignoreOn && performance.now() - lastSelectAt < t.ignoreSec * 1000;
}

const state = {
  board: null,        // the word map (data/core-board.json)
  page: "core",       // "core", a category id such as "food", or an adult-made page id
  editing: false,     // Edit mode
  modeling: false,    // Model mode
  sentence: [],       // words in the message bar: {label, spoken}
  cells: new Map(),   // key -> description of each cell currently drawn
};

const $ = (id) => document.getElementById(id);

// ---------- Which page is showing ----------
// The layout for the current learner's grid size (45 or 84).
const modelNow = () => buildModel(state.board, getCurrent().gridSize);

function currentPageDef() {
  const profile = getCurrent();
  const model = modelNow();
  let page = getPage(model, profile, state.page);
  if (!page) { state.page = "core"; page = getPage(model, profile, "core"); }   // e.g. after switching board size
  return page;
}

// Redraw everything that depends on page / learner / mode.
function renderAll() {
  const profile = getCurrent();
  const model = modelNow();
  const page = currentPageDef();
  const cells = resolvePage(page, profile, model);
  state.cells = new Map(cells.map((d) => [d.key, d]));

  renderBoard($("board"), cells, {
    editing: state.editing, photoUrl: getPhotoUrl, backImage: state.board.backImage,
    cols: model.cols, rows: model.rows, size: model.size,
  });

  // Visual cue that the page changed: tinted background + page title.
  const onCategory = state.page !== "core";
  $("app").classList.toggle("on-category", onCategory);
  $("page-title").textContent = onCategory ? page.name : "";
  $("app").classList.toggle("editing", state.editing);
  $("edit-banner").hidden = !state.editing;
  $("model-banner").hidden = !state.modeling;

  // Learner's first name, small, in the message-bar corner. ("Learner 1" stays whole.)
  const m = profile.name.trim().match(/^\S+(?:\s+\d+)?/);
  $("learner-name").textContent = m ? m[0] : profile.name;

  setVoiceSettings(profile.voice);
}

function goTo(pageId) {
  state.page = pageId;
  renderAll();
  // brief fade so it is obvious the page changed
  const b = $("board");
  b.classList.remove("page-change");
  void b.offsetWidth;
  b.classList.add("page-change");
}

// ---------- Message bar ----------
function drawMessage() {
  const chipsEl = $("message-chips");
  chipsEl.innerHTML = "";
  for (const w of state.sentence) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = w.label;
    chipsEl.appendChild(chip);
  }
  const box = $("message-text");
  box.scrollLeft = box.scrollWidth;   // keep the newest word in view
}

// ---------- Model mode highlight ----------
function ringCell(key, ms) {
  const el = document.querySelector(`#board .cell[data-key="${key}"]`);
  if (!el) return;
  el.classList.remove("model-ring");
  void el.offsetWidth;
  el.classList.add("model-ring");
  setTimeout(() => el.classList.remove("model-ring"), ms);
}

// ---------- Taps on the board ----------
function onCellTap(cellEl) {
  const d = state.cells.get(cellEl.dataset.key);
  if (!d || returning) return;

  // Back button: up ONE level (a page opened from another page goes back to that
  // page; a page opened from the main board goes back to the main board). Never speaks.
  if (d.kind === "home") { goTo(currentPageDef().parent || "core"); return; }

  if (state.editing) { editCell(d); return; }

  // Category / page button: open its page. No speech, nothing added.
  if (d.loadBoard) { goTo(d.loadBoard); return; }

  // A normal word: speak immediately, add to the message bar.
  lastSelectAt = performance.now();      // starts the "ignore repeated taps" wait, if it is on
  speak(d.spoken);
  state.sentence.push({ label: d.sentence ? d.spoken : d.label, spoken: d.spoken });
  drawMessage();
  logWord(d.label, state.modeling ? "model" : "learner");

  if (state.page !== "core") {
    // Item on any page: go back to the main board automatically.
    const profile = getCurrent();
    const model = modelNow();
    const path = pathToCore(model, profile, state.page);       // [this page, its parent, ..., "core"]
    if (state.modeling) {
      // Model mode: keep the page visible briefly so the item's ring is seen, then
      // step back out one page at a time, ringing the button that was used to open
      // each page (so the whole path is shown: item, sub-page button, category button).
      ringCell(d.key, 1200);
      returning = true;                    // ignore taps during the pauses
      const stepOut = (i) => setTimeout(() => {
        const child = getPage(model, profile, path[i]);
        goTo(path[i + 1]);
        ringCell(posKey(model.size, path[i + 1], child.at.row, child.at.col), 800);
        if (i + 2 < path.length) stepOut(i + 1); else returning = false;
      }, MODEL_RETURN_DELAY_MS);
      stepOut(0);
    } else {
      goTo("core");                        // learner taps return immediately
    }
  } else if (state.modeling) {
    ringCell(d.key, 1200);
  }
}

// ---------- Edit mode ----------
// Everything an adult changes is stored in one of two places (see js/profiles.js):
//   built-in word  -> profile.words[wordId]   (follows the word to either board)
//   added by adult -> profile.cells[position] (belongs to that cell on that board)
async function editCell(d) {
  const profile = getCurrent();
  const page = currentPageDef();
  const canMakePage = d.kind === "empty" && page.depth < MAX_DEPTH;
  const result = await openCellEditor(d, getPhotoUrl(d.photoKey), { onOpenPage: goTo, canMakePage });
  if (!result) return;

  if (result.deletePage) {
    const sure = await askConfirm(
      `Delete the page "${d.label}" and everything on it? The words and photos on it will be erased from this iPad. This cannot be undone.`,
      "Delete page");
    if (!sure) return;
    await deleteAdultPage(profile, d.opens);
    delete profile.cells[d.key];
    await removePhoto(d.photoKey);
  } else if (result.removeWord) {
    delete profile.cells[d.key];
    await removePhoto(d.photoKey);
  } else if (d.kind === "empty") {
    // A new button in an empty cell: a word, or a page.
    const cell = { custom: true, label: result.label };
    if (result.makePage) {
      const id = newPageId();
      profile.pages[id] = { size: profile.gridSize, name: result.label, parent: page.id,
                            at: { row: d.row, col: d.col }, depth: page.depth + 1 };
      cell.opens = id;
    } else if (result.spoken !== result.label) {
      cell.spoken = result.spoken;
    }
    profile.cells[d.key] = cell;
  } else if (d.custom) {
    // An adult-added word or page button: edit it in place.
    const cell = { ...profile.cells[d.key], label: result.label };
    if (result.show === "auto") delete cell.show; else cell.show = result.show;
    if (!d.opens) { if (result.spoken !== result.label) cell.spoken = result.spoken; else delete cell.spoken; }
    else { profile.pages[d.opens].name = result.label; }
    profile.cells[d.key] = cell;
  } else {
    // A built-in word: store only what differs from the built-in version.
    const ov = { ...(profile.words[d.wordId] || {}) };
    if (d.sentence && d.blank) {
      if (result.fill) ov.fill = result.fill; else delete ov.fill;
    } else {
      if (result.show === "auto") delete ov.show; else ov.show = result.show;
      const baseSpoken = d.base.template || d.base.spokenText || d.base.label;
      if (result.label !== d.base.label) ov.label = result.label; else delete ov.label;
      if (result.spoken !== baseSpoken) ov.spoken = result.spoken; else delete ov.spoken;
    }
    if (Object.keys(ov).length) profile.words[d.wordId] = ov; else delete profile.words[d.wordId];
  }
  if (!result.deletePage && !result.removeWord && result.photo !== undefined) {
    if (result.photo instanceof Blob) await setPhoto(d.photoKey, result.photo);
    else if (result.photo === null) await removePhoto(d.photoKey);
  }
  await saveProfile(profile);
  renderAll();
}

function startEditing() { state.modeling = false; state.editing = true; renderAll(); }
function stopEditing() { state.editing = false; renderAll(); }
function startModeling() { state.editing = false; state.modeling = true; renderAll(); }
function stopModeling() { state.modeling = false; renderAll(); }

// ---------- Adult lock ----------
let adultBusy = false;
async function openAdult() {
  if (adultBusy) return;
  adultBusy = true;
  try {
    if (!(await requestAdultAccess())) return;
    openAdultMenu({
      board: state.board,
      onLearnerChanged: () => {
        // A different learner: start clean on the main board.
        state.sentence.length = 0;
        drawMessage();
        state.page = "core";
        renderAll();
      },
      onVocabChanged: renderAll,
      onBoardSizeChanged: () => {
        // Different grid: word locations changed, so start clean on the main board.
        state.sentence.length = 0;
        drawMessage();
        state.page = "core";
        renderAll();
      },
      onEdit: startEditing,
      onModel: startModeling,
    });
  } finally {
    adultBusy = false;
  }
}

// ---------- Start ----------
async function start() {
  initSpeech();
  state.board = await loadBoardData();
  await initProfiles(state.board);

  attachPressHandling($("board"), onCellTap, ".cell.tap", { holdMs, blocked: tapsBlocked });

  // Message bar: tap text to speak the sentence; Delete / Clear
  attachPressHandling($("message-bar"), (el) => {
    if (el.id === "message-text") speak(state.sentence.map((w) => w.spoken).join(" "));
    else if (el.id === "delete-btn") { state.sentence.pop(); drawMessage(); }
    else if (el.id === "clear-btn") { state.sentence.length = 0; drawMessage(); }
  }, "#message-text, .bar-btn");

  fitLabelsOnResize($("board"));
  attachHold($("adult-hold"), HOLD_TO_OPEN_MS, openAdult);
  attachHold($("model-end"), HOLD_TO_END_MODEL_MS, stopModeling);
  $("edit-done").addEventListener("click", stopEditing);

  renderAll();

  // Block pinch/double-tap zoom and rubber-band scrolling on iOS
  // (but let the adult menus scroll).
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("touchmove", (e) => { if (!e.target.closest(".sheet")) e.preventDefault(); }, { passive: false });
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js", { scope: "./" }).catch((e) =>
      console.warn("Offline support unavailable:", e));
  }
}

start();
