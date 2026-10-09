// App entry point. Ties everything together:
//   - loads the word map and the current learner's profile
//   - draws the main board or a category page
//   - handles taps (speak / navigate), the adult lock, Edit mode and Model mode
import { speak, initSpeech, setVoiceSettings } from "./speech.js";
import { renderBoard, attachPressHandling, resolvePage, cellKey } from "./board.js";
import {
  initProfiles, getCurrent, saveProfile, getPhotoUrl, setPhoto, removePhoto,
} from "./profiles.js";
import { attachHold } from "./hold.js";
import { requestAdultAccess } from "./lock.js";
import { openAdultMenu } from "./adult.js";
import { openCellEditor } from "./editor.js";
import { logWord } from "./events.js";

const HOLD_TO_OPEN_MS = 3000;   // adult corner target
const HOLD_TO_END_MODEL_MS = 2000;

const state = {
  board: null,        // the word map (data/core-board.json)
  page: "core",       // "core" or a category id such as "food"
  editing: false,     // Edit mode
  modeling: false,    // Model mode
  sentence: [],       // words in the message bar: {label, spoken}
  cells: new Map(),   // key -> description of each cell currently drawn
};

const $ = (id) => document.getElementById(id);

// ---------- Which page is showing ----------
function currentPageDef() {
  const { board, page } = state;
  if (page === "core") return { id: "core", name: "", buttons: board.buttons, homeAt: null };
  const def = board.pages[page];
  // The Home cell sits where this category's button sits on the main board.
  const catButton = board.buttons.find((b) => b.loadBoard === page);
  return { id: page, name: def.name, buttons: def.buttons, homeAt: { row: catButton.row, col: catButton.col } };
}

// Redraw everything that depends on page / learner / mode.
function renderAll() {
  const profile = getCurrent();
  const page = currentPageDef();
  const cells = resolvePage(page, profile);
  state.cells = new Map(cells.map((d) => [d.key, d]));

  renderBoard($("board"), cells, { editing: state.editing, photoUrl: getPhotoUrl });

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
  if (!d) return;

  // Home button: back to the main board (never speaks).
  if (d.kind === "home") { goTo("core"); return; }

  if (state.editing) { editCell(d); return; }

  // Category button on the main board: open its page. No speech, nothing added.
  if (d.loadBoard) { goTo(d.loadBoard); return; }

  // A normal word: speak immediately, add to the message bar.
  speak(d.spoken);
  state.sentence.push({ label: d.label, spoken: d.spoken });
  drawMessage();
  logWord(d.label, state.modeling ? "model" : "learner");

  if (state.page !== "core") {
    // Category item: go back to the main board automatically.
    const fromPage = currentPageDef();
    goTo("core");
    if (state.modeling) {
      // Re-highlight the path: the category button the item came from.
      ringCell(cellKey("core", fromPage.homeAt.row, fromPage.homeAt.col), 800);
    }
  } else if (state.modeling) {
    ringCell(d.key, 1200);
  }
}

// ---------- Edit mode ----------
async function editCell(d) {
  const result = await openCellEditor(d, getPhotoUrl(d.key), { onOpenPage: goTo });
  if (!result) return;
  const profile = getCurrent();

  if (result.removeWord) {
    delete profile.cells[d.key];
    await removePhoto(d.key);
  } else {
    const ov = { ...(profile.cells[d.key] || {}) };
    if (d.kind === "empty") {
      ov.custom = true;
      ov.label = result.label;
      if (result.spoken !== result.label) ov.spoken = result.spoken; else delete ov.spoken;
    } else {
      // Store only what differs from the built-in word.
      if (result.show === "auto") delete ov.show; else ov.show = result.show;
      if (d.custom) {
        ov.label = result.label;
        if (result.spoken !== result.label) ov.spoken = result.spoken; else delete ov.spoken;
      } else {
        const baseSpoken = d.base.spokenText || d.base.label;
        if (result.label !== d.base.label) ov.label = result.label; else delete ov.label;
        if (result.spoken !== baseSpoken) ov.spoken = result.spoken; else delete ov.spoken;
      }
    }
    if (Object.keys(ov).length) profile.cells[d.key] = ov; else delete profile.cells[d.key];

    if (result.photo instanceof Blob) await setPhoto(d.key, result.photo);
    else if (result.photo === null) await removePhoto(d.key);
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
  await initProfiles();
  state.board = await (await fetch("data/core-board.json")).json();

  attachPressHandling($("board"), onCellTap);

  // Message bar: tap text to speak the sentence; Delete / Clear
  attachPressHandling($("message-bar"), (el) => {
    if (el.id === "message-text") speak(state.sentence.map((w) => w.spoken).join(" "));
    else if (el.id === "delete-btn") { state.sentence.pop(); drawMessage(); }
    else if (el.id === "clear-btn") { state.sentence.length = 0; drawMessage(); }
  }, "#message-text, .bar-btn");

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
