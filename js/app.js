// App entry point. Ties everything together:
//   - loads the word map and the current learner's profile
//   - draws the main board (45 or 84 locations) or a category / adult-made page
//   - handles taps (speak / navigate), the adult lock, Edit mode and Model mode
//   - the top-bar Words button (Words pages) and Forms button (other forms of the last word)
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
import { runPrompt, clearCritter, stepPauseMs, usesCritter, RING_MS, RING_PATH_MS, CRITTER_TOTAL_MS } from "./modelprompt.js";
import { preloadCritterArt } from "./critters.js";
import { loadForms, formsFor, openFormsPopover } from "./forms.js";

const HOLD_TO_OPEN_MS = 3000;   // adult corner target
const HOLD_TO_END_MODEL_MS = 2000;
// Model mode: how long to pause on each page while stepping back out (ring only: 600 ms;
// with the critter it is longer, so the critter has time to arrive, stay and fade: see js/modelprompt.js).
let returning = false;                // true during those pauses
let previewing = false;               // true while "Preview on board" runs (taps are ignored)

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
  sentence: [],       // words in the message bar: {label, spoken, base} (base = the word tapped on the board)
  cells: new Map(),   // key -> description of each cell currently drawn
  forms: null,        // the open Forms popover, if any
};

// ---------- The Words button ----------
// "auto" shows it from stage 3 up; "always" and "never" are the adult's choice (adult menu).
const wordsButtonShown = (p) => p.wordsButton === "always" || (p.wordsButton !== "never" && p.stage >= 3);
// True while the Words menu or any page opened from it is showing.
const onWordsPage = (pageId = state.page) => {
  const profile = getCurrent();
  return pathToCore(modelNow(), profile, pageId).includes("words");
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
  if (state.page !== "core" && !wordsButtonShown(profile) && onWordsPage()) state.page = "core";   // the adult turned Words off
  const page = currentPageDef();
  const cells = resolvePage(page, profile, model);
  state.cells = new Map(cells.map((d) => [d.key, d]));

  renderBoard($("board"), cells, {
    editing: state.editing, photoUrl: getPhotoUrl, backImage: state.board.backImage,
    cols: model.cols, rows: model.rows, size: model.size, wordsOnly: profile.wordsOnly,
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
  updateBar();
}

// The Words and Forms buttons in the top bar. They only change themselves (and the message text's width):
// the grid below never moves.
function updateBar() {
  const profile = getCurrent();
  const shown = wordsButtonShown(profile);
  $("words-btn").hidden = !shown;
  $("forms-btn").hidden = !shown;
  $("words-btn").textContent = shown && onWordsPage() ? "Close" : "Words";
  const ew = $("edit-words");
  ew.hidden = !shown;
  ew.textContent = shown && onWordsPage() ? "Close Words" : "Words";
  updateFormsButton();
}

// Words button: open the Words menu; while a Words page is open the same button ("Close") goes back to the main board.
function toggleWords() {
  goTo(onWordsPage() ? "core" : "words");
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
  updateFormsButton();
}

// ---------- Forms ----------
// On only when the last word in the message bar has other forms (go: went, going...).
function lastWordForms() {
  const last = state.sentence[state.sentence.length - 1];
  return last ? formsFor(last.label) || formsFor(last.spoken) : null;
}
function updateFormsButton() {
  $("forms-btn").disabled = !lastWordForms();
}
function closeForms() { if (state.forms) { state.forms.close(); state.forms = null; } }

// Open the popover over the grid. Choosing a form replaces the last word and speaks it.
// In Model mode it also counts as a model event (and the chosen button gets the learner's prompt).
function openForms() {
  const forms = lastWordForms();
  if (!forms || state.forms || returning || previewing) return;
  const last = state.sentence[state.sentence.length - 1];
  if (state.modeling) runPrompt($("forms-btn"), getCurrent().model, getPhotoUrl("critter"), RING_MS);
  let chosen = false;
  state.forms = openFormsPopover({
    forms, current: last.label,
    pressOptions: { holdMs, blocked: tapsBlocked },
    onClose: () => { state.forms = null; },
    onChoose: (form) => {
      if (chosen) return;
      chosen = true;
      lastSelectAt = performance.now();
      speak(form);
      const base = last.base || last.label;
      state.sentence[state.sentence.length - 1] = { label: form, spoken: form, base };
      drawMessage();
      logWord(base, state.modeling ? "model" : "learner", state.modeling ? promptInfo() : undefined, { form });
      if (state.modeling) {
        // Let the adult's ring show on the chosen form for a moment, then close.
        const pop = state.forms;
        runPrompt(pop.button(form), getCurrent().model, getPhotoUrl("critter"), RING_MS);
        setTimeout(() => { if (state.forms === pop) closeForms(); }, 700);
      } else {
        closeForms();
      }
    },
  });
}

// ---------- Model mode prompt ----------
// Shows the learner's chosen prompt (ring, critter or both, at their opacity) on the
// button with this key. The ring/critter never take part in the layout: see js/modelprompt.js.
function promptCell(key, ringMs) {
  const el = document.querySelector(`#board .cell[data-key="${key}"]`);
  runPrompt(el, getCurrent().model, getPhotoUrl("critter"), ringMs);
}
// The same prompt on the top-bar Words button (the "opener" of the Words menu).
function promptWordsButton(ringMs) {
  runPrompt($("words-btn"), getCurrent().model, getPhotoUrl("critter"), ringMs);
}

// What to remember about the prompt in the event list (for Phase 2 data).
function promptInfo() {
  const m = getCurrent().model;
  return { style: m.style, ringOpacity: m.ringOpacity, critterOpacity: m.critterOpacity };
}

// "Preview on board" (adult menu > Model prompt): run the prompt once on the "more"
// button (or the first visible button) without speaking or touching the message bar.
function previewPrompt() {
  const cell = document.querySelector('#board .cell[data-word="more"].tap:not(.ghost)') ||
               document.querySelector("#board .cell.tap:not(.ghost):not(.type-home)");
  if (!cell) return Promise.resolve();
  previewing = true;
  clearCritter();
  runPrompt(cell, getCurrent().model, getPhotoUrl("critter"), RING_MS);
  return new Promise((resolve) => setTimeout(() => { previewing = false; resolve(); },
    (usesCritter(getCurrent().model) ? CRITTER_TOTAL_MS : RING_MS) + 300));
}

// ---------- Taps on the board ----------
function onCellTap(cellEl) {
  const d = state.cells.get(cellEl.dataset.key);
  if (!d || returning || previewing) return;

  // Back button: up ONE level (a page opened from another page goes back to that
  // page; a page opened from the main board goes back to the main board). Never speaks.
  if (d.kind === "home") { goTo(currentPageDef().parent || "core"); return; }

  if (state.editing) { editCell(d); return; }

  // Category / page button: open its page. No speech, nothing added.
  if (d.loadBoard) { goTo(d.loadBoard); return; }

  // A normal word: speak immediately, add to the message bar.
  lastSelectAt = performance.now();      // starts the "ignore repeated taps" wait, if it is on
  speak(d.spoken);
  const shown = d.sentence ? d.spoken : d.label;
  state.sentence.push({ label: shown, spoken: d.spoken, base: shown });
  drawMessage();
  logWord(d.label, state.modeling ? "model" : "learner", state.modeling ? promptInfo() : undefined);

  if (state.page !== "core") {
    // Item on any page: go back to the main board automatically.
    const profile = getCurrent();
    const model = modelNow();
    const path = pathToCore(model, profile, state.page);       // [this page, its parent, ..., "core"]
    if (state.modeling) {
      // Model mode: keep the page visible briefly so the item's ring is seen, then
      // step back out one page at a time, ringing the button that was used to open
      // each page (so the whole path is shown: item, sub-page button, category button).
      promptCell(d.key, RING_MS);
      returning = true;                    // ignore taps during the pauses
      const pause = stepPauseMs(profile.model);
      const stepOut = (i) => setTimeout(() => {
        const child = getPage(model, profile, path[i]);
        goTo(path[i + 1]);
        // the Words menu is opened by the top-bar Words button; every other page by a button on the grid
        if (child.at) promptCell(posKey(model.size, path[i + 1], child.at.row, child.at.col), RING_PATH_MS);
        else promptWordsButton(RING_PATH_MS);
        if (i + 2 < path.length) stepOut(i + 1); else returning = false;
      }, pause);
      stepOut(0);
    } else {
      goTo("core");                        // learner taps return immediately
    }
  } else if (state.modeling) {
    promptCell(d.key, RING_MS);
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

function startEditing() { closeForms(); state.modeling = false; state.editing = true; renderAll(); }
function stopEditing() { state.editing = false; renderAll(); }
function startModeling() { closeForms(); state.editing = false; state.modeling = true; renderAll(); }
function stopModeling() { state.modeling = false; clearCritter(); renderAll(); }

// ---------- Adult lock ----------
let adultBusy = false;

// Show the adult menu (the passcode has already been entered). `startAt` is the id of a
// section to scroll to, used when the menu reopens after "Preview on board".
function showAdultMenu(startAt) {
  openAdultMenu({
    board: state.board,
    startAt,
    onLearnerChanged: () => {
      // A different learner: start clean on the main board.
      closeForms();
      state.sentence.length = 0;
      drawMessage();
      state.page = "core";
      clearCritter();
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
    // The menu has closed itself; run the prompt on the board, then bring the menu back.
    onPreviewPrompt: async () => {
      await previewPrompt();
      showAdultMenu("sec-model");
    },
  });
}

async function openAdult() {
  if (adultBusy) return;
  adultBusy = true;
  try {
    if (!(await requestAdultAccess())) return;
    showAdultMenu();
  } finally {
    adultBusy = false;
  }
}

// ---------- Start ----------
async function start() {
  initSpeech();
  state.board = await loadBoardData();
  await loadForms();
  await initProfiles(state.board);
  preloadCritterArt();      // so the critter can appear instantly the first time

  attachPressHandling($("board"), onCellTap, ".cell.tap", { holdMs, blocked: tapsBlocked });

  // Message bar: tap text to speak the sentence; Delete / Clear
  attachPressHandling($("message-bar"), (el) => {
    if (el.disabled) return;
    if (el.id === "message-text") speak(state.sentence.map((w) => w.spoken).join(" "));
    else if (el.id === "delete-btn") { state.sentence.pop(); drawMessage(); }
    else if (el.id === "clear-btn") { state.sentence.length = 0; drawMessage(); }
    else if (el.id === "words-btn") { if (!returning && !previewing) toggleWords(); }
    else if (el.id === "forms-btn") openForms();
  }, "#message-text, .bar-btn");

  fitLabelsOnResize($("board"));
  attachHold($("adult-hold"), HOLD_TO_OPEN_MS, openAdult);
  attachHold($("model-end"), HOLD_TO_END_MODEL_MS, stopModeling);
  $("edit-done").addEventListener("click", stopEditing);
  $("edit-words").addEventListener("click", toggleWords);   // so an adult can edit the Words pages too

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
