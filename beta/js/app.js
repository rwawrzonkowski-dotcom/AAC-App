// App entry point. Ties everything together:
//   - loads the word map and the current learner's profile
//   - draws the main board (45 or 84 locations) or a category / adult-made page
//   - handles taps (speak / navigate), the adult lock, Edit mode and Model mode
//   - Teaching (beta, Phase 2): "choose targets" mode (tap words to make them targets) and teaching sessions
//     (js/session.js: controls in the context strip, prompts on the next button; the rules are in js/teaching.js)
//   - press-and-hold on a word: the word-forms dial (js/dial.js, slots in js/forms.js)
//   - the top-bar Words button (Words pages), Forms button (other forms of the last word) and
//     ABC button (the keyboard overlay; the number pad opens from the Numbers page or the keyboard's 123 key)
//   - playing the message bar (one utterance, or chip by chip with pauses: js/speech.js)
//   - everyday recording (Beta 2.2, js/everyday.js): after a word is spoken, a small record of it is queued (never before speaking)
//   - Scenes (Beta 3.0, js/scenestrip.js and js/sceneadult.js): an active scene's buttons stand in the context strip; a tap speaks like
//     a board word (onSceneItem below) and the word's permanent board spot glows. The recognition library is loaded only when an adult
//     makes a scene, never at app start.
import {
  speak, speakMessage, initSpeech, setVoiceSettings, stopSpeech, speakSequence, isMessagePlaying, pauseMs,
} from "./speech.js";
import { createTyping } from "./keyboard.js";
import { renderBoard, attachPressHandling, fitLabelsOnResize } from "./board.js";
import { buildModel, getPage, pathToCore, resolvePage, posKey, MAX_DEPTH } from "./boardmodel.js";
import { loadBoardData } from "./boarddata.js";
import {
  initProfiles, hasProfiles, listProfiles, addProfile, chooseCurrent, getCurrent, saveProfile, getPhotoUrl, setPhoto, removePhoto, newPageId, deleteAdultPage,
} from "./profiles.js";
import { attachHold } from "./hold.js";
import { requestAdultAccess } from "./lock.js";
import { openAdultMenu } from "./adult.js";
import { askConfirm } from "./ui.js";
import { showSetup } from "./setup.js";
import { openCellEditor } from "./editor.js";
import { logWord } from "./events.js";
import {
  runPrompt, sustainStep, clearCritter, stepPauseMs, usesCritter, ringBriefly, RING_MS, RING_PATH_MS, CRITTER_TOTAL_MS,
} from "./modelprompt.js";
import { setPreviewHook } from "./ladderui.js";
import { preloadCritterArt } from "./critters.js";
import { CHANNEL } from "./channel.js";
import * as teach from "./session.js";
import { runEndFlow } from "./teachui.js";
import { loadTeaching, getTargets, isTarget, addTarget, removeTarget, closeOrphanSessions } from "./teachdata.js";
import { loadForms, formsFor, dialFor, openFormsPopover } from "./forms.js";
import { openDial } from "./dial.js";
import * as everyday from "./everyday.js";
import * as scenes from "./scenestrip.js";
import { initCameraButton } from "./camerabtn.js";

const HOLD_TO_OPEN_MS = 3000;   // adult corner target
const HOLD_TO_END_MODEL_MS = 2000;
// Model mode: how long to pause on each page while stepping back out (ring only: 600 ms;
// with the critter it is longer, so the critter has time to arrive, stay and fade: see js/modelprompt.js).
let returning = false;                // true during those pauses
let previewing = false;               // true while "Preview on board" runs (taps are ignored)

// ---------- Touch supports (adult menu > Touch), per learner ----------
// Only the child's board uses these, and not in Edit mode.
let lastSelectAt = -Infinity;        // when a word was last selected (ms)
const touchActive = () => !state.editing && !state.choosing;

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
  choosing: false,    // "Add targets" mode (adult menu > Teaching): taps choose target words instead of speaking
  modeling: false,    // Model mode
  sentence: [],       // words in the message bar: {label, spoken, base} (base = the word tapped on the board)
  cells: new Map(),   // key -> description of each cell currently drawn
  forms: null,        // the open Forms popover, if any
  dial: null,         // the open press-and-hold word-forms dial, if any (js/dial.js)
  draft: null,        // what is being typed on the keyboard / number pad: { text, kind } or null
};
let started = false;  // true once the first board has been drawn
let typing = null;    // the keyboard / number pad overlay (js/keyboard.js), created in start()

// ---------- The Words button ----------
// "auto" shows it from stage 3 up; "always" and "never" are the adult's choice (adult menu).
const wordsButtonShown = (p) => p.wordsButton === "always" || (p.wordsButton !== "never" && p.stage >= 3);
// The ABC (keyboard) button works the same way, with its own setting: Auto = from stage 3.
const keyboardButtonShown = (p) => p.keyboardButton === "always" || (p.keyboardButton !== "never" && p.stage >= 3);
// The camera button (Beta 3.1, js/camerabtn.js) works the same way, with its own setting: Auto = from stage 3.
const cameraButtonShown = (p) => p.cameraButton === "always" || (p.cameraButton !== "never" && p.stage >= 3);
// True while the Words menu or any page opened from it is showing.
const onWordsPage = (pageId = state.page) => {
  const profile = getCurrent();
  return pathToCore(modelNow(), profile, pageId).includes("words");
};

const $ = (id) => document.getElementById(id);

// ---------- Everyday recording (Beta 2.2, js/everyday.js) ----------
// Every call comes AFTER the word has been spoken, only changes memory (the writing to disk happens later) and can never throw
// into a tap: speech is never delayed or stopped by recording.
// mode: "model" (an adult tapped in Model mode), "session" (during a teaching session) or "learner".
const recMode = () => (state.modeling ? "model" : teach.isActive() ? "session" : "learner");
// Record one selected word. `how` is "board" | "page" | "forms" | "dial" | "keyboard" | "numberpad"; the board and page cases are
// told apart here: a word chosen on any page other than the main board is "page", with the page ids that lead to it.
function recordTap({ id, label, spoken, how, form, base, sceneId }) {
  try {
    const profile = getCurrent();
    if (!everyday.isRecording(profile.id)) return;
    let pages;
    if (how === "board" && state.page !== "core") {
      how = "page";
      pages = pathToCore(modelNow(), profile, state.page).reverse().slice(1);     // pages after the main board, ending at this page
    }
    const ids = teach.recordIds();
    everyday.recordWord(profile.id, { wordId: id || null, label, spoken, how, pages, form, base, mode: recMode(),
      gridSize: profile.gridSize, stage: profile.stage, sessionId: ids && ids.sessionId, trialId: ids && ids.trialId, sceneId });
  } catch (e) { console.warn("Could not record a tap:", e); }
}
// The chips in the message bar changed (added = a chip was added or replaced, false = deleted): the utterance tracker
// decides what to record from the chips left in the bar.
function chipsChanged(added) {
  try { const p = getCurrent(); everyday.sentenceChanged(p.id, state.sentence, { gridSize: p.gridSize, stage: p.stage }, added); } catch (e) { /* never break a tap */ }
}
// The bar is spoken ("barSpeak"), cleared ("clear"), or left alone for 20 s ("idle", by the tracker itself).
function utteranceEnds(source) { try { everyday.endUtterance(source); } catch (e) { /* ignore */ } }

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
  $("target-banner").hidden = !state.choosing;
  $("app").classList.toggle("choosing", state.choosing);
  if (state.choosing) markTargets();

  // Learner's first name, small, in the message-bar corner. ("Learner 1" stays whole.)
  const m = profile.name.trim().match(/^\S+(?:\s+\d+)?/);
  $("learner-name").textContent = m ? m[0] : profile.name;

  setVoiceSettings(profile.voice);
  // The adult turned the keyboard off while it was open (the adult menu closes it first, so this is a safety net).
  if (typing && typing.isOpen() && typing.mode() === "letters" && !keyboardButtonShown(profile)) typing.close({ speak: false });
  updateBar();
  teach.onRender();                     // a running teaching trial re-draws its prompt on the new page
  scenes.onRender(!state.editing && !state.choosing);     // the scene strip shows on the child's board only
}

// The Words, Forms and ABC buttons in the top bar. They only change themselves (and the message text's width):
// the grid below never moves.
function updateBar() {
  const profile = getCurrent();
  const shown = wordsButtonShown(profile);
  $("words-btn").hidden = !shown;
  $("forms-btn").hidden = !shown;
  $("abc-btn").hidden = !keyboardButtonShown(profile);
  const cam = cameraButtonShown(profile) && !state.editing && !state.choosing;    // in the context strip (Beta 3.3), child's board only
  $("camera-btn").hidden = !cam;
  $("app").classList.toggle("cam-on", cam);
  $("camera-btn").classList.toggle("off", teach.isActive());       // disabled during a teaching session
  $("words-btn").textContent = shown && onWordsPage() ? "Close" : "Words";
  const ew = $("edit-words");
  ew.hidden = !shown;
  ew.textContent = shown && onWordsPage() ? "Close Words" : "Words";
  const tw = $("target-words");
  tw.hidden = !shown;
  tw.textContent = shown && onWordsPage() ? "Close Words" : "Words";
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
  // What is being typed right now: a dashed "draft" chip. It becomes a normal chip when it is finalized.
  if (state.draft && state.draft.text) {
    const chip = document.createElement("span");
    chip.className = "chip draft";
    chip.textContent = state.draft.text;
    chipsEl.appendChild(chip);
  }
  const box = $("message-text");
  box.scrollLeft = box.scrollWidth;   // keep the newest word in view
  updateFormsButton();
}

// ---------- Playing the message bar ----------
// Pause between words OFF: the whole sentence is one utterance at the learner's Sentence speed.
// Pause ON: each chip is its own utterance (a chip of several words is one chunk) with a gap between.
// Either way, tapping the bar while the sentence is playing STOPS it; a tap when nothing is playing
// starts it. Typed drafts are not part of the sentence.
function highlightChip(i) {
  document.querySelectorAll("#message-chips .chip:not(.draft)").forEach((c, n) => c.classList.toggle("speaking", n === i));
}
function playMessage() {
  const chunks = state.sentence.map((w) => w.spoken).filter(Boolean);
  if (!chunks.length) return;
  if (isMessagePlaying()) { stopSpeech(); return; }
  const gap = pauseMs();
  if (gap > 0) speakSequence(chunks, gap, { onChunk: highlightChip, onEnd: () => highlightChip(-1) });
  else speakMessage(chunks.join(" "));
  utteranceEnds("barSpeak");               // (after the speech has started)
}

// ---------- Scenes: a tap on a strip button or on the scene photo ----------
// The same rules as a board word: speak first, then the chip, the event list and the everyday record (how: "scene" for a strip
// button, "photo scene" for the full-screen photo; the record also keeps the scene id). In Model mode an adult's tap rings the strip button.
// The word's board spot glows (js/scenestrip.js) after this returns.
function onSceneItem(item, { how, sceneId, el }) {
  if (returning || previewing) return;
  lastSelectAt = performance.now();
  const spoken = item.spoken || item.label;
  speak(spoken);
  const id = item.wordId || null;
  state.sentence.push({ label: item.label, spoken, base: item.label, id: id || undefined, mode: recMode() });
  drawMessage();
  logWord(item.label, state.modeling ? "model" : "learner", state.modeling ? promptInfo() : undefined, { id, source: how, scene: sceneId });
  recordTap({ id, label: item.label, spoken, how, sceneId });
  chipsChanged(true);
  if (state.modeling && how === "scene" && el) runPrompt(el, getCurrent().model, getPhotoUrl("critter"), RING_MS);
}

// ---------- Keyboard and number pad ----------
// ABC toggles the keyboard. The number pad opens from the keyboard's 123 key or from the Number pad
// button on the Numbers page. See js/keyboard.js for how typing and finalizing work.
function toggleKeyboard() {
  if (returning || previewing) return;
  if (typing.isOpen()) { typing.close(); return; }
  closeForms();
  if (state.modeling) runPrompt($("abc-btn"), getCurrent().model, getPhotoUrl("critter"), RING_MS);
  typing.open("letters");
}
// The Number pad button on the Numbers page. In Model mode its ring is shown first, so the child can see
// where the button is before the pad covers the grid.
function openNumberPad(d) {
  if (state.modeling) {
    promptCell(d.key, RING_MS);
    returning = true;                    // ignore taps for a moment
    setTimeout(() => { returning = false; typing.open("number", { fromPage: true }); }, 900);
  } else {
    typing.open("number", { fromPage: true });
  }
}
// A typed word or number is finalized: it becomes a normal chip, is spoken and (if it came from the
// Numbers page) the board goes back to the main page, like any other word chosen on a page.
function onTyped({ label, spoken, kind, speak: say, context }) {
  state.sentence.push({ label, spoken, base: label, mode: recMode() });
  drawMessage();
  if (say) speak(spoken);
  logWord(label, state.modeling ? "model" : "learner", state.modeling ? promptInfo() : undefined,
    kind === "number" ? { source: "numberpad", spoken } : { source: "keyboard" });
  recordTap({ id: null, label, spoken, how: kind === "number" ? "numberpad" : "keyboard" });
  chipsChanged(true);
  if (context && context.fromPage && kind === "number" && state.page !== "core") goTo("core");
}

// ---------- Forms ----------
// On only when the last word in the message bar has other forms (go: went, going...).
function lastWordForms() {
  const last = state.sentence[state.sentence.length - 1];
  // (noForms: the season "fall" and the month "May" are not the verb "fall" or the word "may": no Forms for them)
  return last && !last.noForms ? formsFor(last.label) || formsFor(last.spoken) : null;
}
function updateFormsButton() {
  $("forms-btn").disabled = !lastWordForms();
}
function closeForms() { if (state.forms) { state.forms.close(); state.forms = null; } }

// ---------- The word-forms dial (press and hold a word) ----------
// "Auto" turns the dial on from stage 3, like the Words and ABC buttons; "always" and "never" are the adult's choice.
const wordDialOn = (p) => p.wordDial.mode === "always" || (p.wordDial.mode !== "never" && p.stage >= 3);
function closeDial() { if (state.dial) state.dial.close(); }

// The dial this board button can show, or null (then it is an ordinary button: holding it behaves like a tap).
// Only the word a family starts with has one (go, eat, big, dog, I), and only on the child's board:
// not in Edit mode, not while the Forms popover, the keyboard or a Model-mode walk back is on screen.
function dialSpecFor(cellEl) {
  if (!wordDialOn(getCurrent()) || state.editing || state.choosing || state.dial || state.forms || returning || previewing) return null;
  if (typing && typing.isOpen()) return null;
  const d = state.cells.get(cellEl.dataset.key);
  if (!d || d.kind !== "word" || !d.visible || d.loadBoard || d.action || d.noForms || d.sentence) return null;
  return dialFor(d.label);
}

// How long this button must be held before its dial opens (0 = no dial here).
// With "Hold to select" on, the word is selected after the hold-to-select time as usual; the dial then
// opens 0.8 s later if the finger is still down (releasing between the two times is just a selection).
function dialMs(cellEl) {
  if (!dialSpecFor(cellEl)) return 0;
  const hold = holdMs();
  return hold > 0 ? hold + 800 : Math.round(getCurrent().wordDial.holdSec * 1000);
}

// Open the dial around this button. `pointer` is the finger still down; `afterSelect` is true when Hold to
// select already selected the word during this press (the chosen form then replaces that chip).
// Nothing is spoken and nothing is added when the dial opens.
function openWordDial(cellEl, { pointer, afterSelect }) {
  const spec = dialSpecFor(cellEl);
  const d = state.cells.get(cellEl.dataset.key);
  const r = cellEl.getBoundingClientRect();
  // (If Hold to select already took the child back to the main board, this button is gone: no dial.)
  if (!spec || !d || !cellEl.isConnected || !r.width) return false;
  const profile = getCurrent();
  const id = d.wordId || d.key;
  const img = cellEl.querySelector(".cell-image img");
  state.dial = openDial({
    anchor: { rect: { left: r.left, top: r.top, width: r.width, height: r.height }, label: d.label,
              bg: getComputedStyle(cellEl).backgroundColor, imgSrc: img ? img.src : null },
    entries: spec.entries,
    markers: profile.wordDial.markers,
    pointer,
    onClose: () => { state.dial = null; },
    // Same as choosing a form with the Forms button: it is spoken (one word: Speed), becomes the chip, and is logged
    // with the word that was held, its id and the form. (Hold to select already added the word: the form replaces it.)
    onChoose: (entry, chip) => {
      lastSelectAt = performance.now();      // choosing counts as a selection for "Ignore repeated taps" (opening did not)
      speak(entry.word);
      const item = { label: entry.word, spoken: entry.word, base: d.label, id, mode: recMode() };
      const last = state.sentence[state.sentence.length - 1];
      if (afterSelect && last && last.id === id) state.sentence[state.sentence.length - 1] = item; else state.sentence.push(item);
      drawMessage();
      logWord(d.label, state.modeling ? "model" : "learner", state.modeling ? promptInfo() : undefined, { form: entry.word, id });
      recordTap({ id, label: entry.word, spoken: entry.word, how: "dial", form: entry.word, base: d.label });
      chipsChanged(true);
      if (state.modeling) {
        // The adult's ring / critter shows on the chosen form for a moment, then the dial closes (and, from a
        // category page, the board steps back out one page at a time, as for any word).
        const dial = state.dial;
        runPrompt(chip, profile.model, getPhotoUrl("critter"), RING_MS);
        setTimeout(() => {
          if (state.dial === dial) closeDial();
          if (state.page !== "core") returnToMain(d);
        }, 700);
      } else {
        closeDial();
        if (state.page !== "core") goTo("core");     // standard behavior after a word chosen on a category page
      }
    },
  });
  return true;
}

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
      state.sentence[state.sentence.length - 1] = { label: form, spoken: form, base, id: last.id, mode: recMode() };
      drawMessage();
      logWord(base, state.modeling ? "model" : "learner", state.modeling ? promptInfo() : undefined, { form, id: last.id });
      recordTap({ id: last.id, label: form, spoken: form, how: "forms", form, base });
      chipsChanged(true);
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

// "Preview" on a step of a custom prompt ladder (adult menu > Teaching > Targets > Settings > Custom ladder): the step is shown on the
// same button as "Preview on board" for a few seconds, then stops. Nothing is spoken, added to the message bar or recorded.
const STEP_PREVIEW_MS = 3200;
setPreviewHook((step) => {
  const cell = document.querySelector('#board .cell[data-word="more"].tap:not(.ghost)') ||
               document.querySelector("#board .cell.tap:not(.ghost):not(.type-home)");
  if (!cell) return Promise.resolve();
  previewing = true;
  clearCritter();
  const stop = sustainStep(cell, step, getCurrent().model, getPhotoUrl("critter"));
  return new Promise((resolve) => setTimeout(() => { stop(); previewing = false; resolve(); }, STEP_PREVIEW_MS));
});

// ---------- Taps on the board ----------
function onCellTap(cellEl) {
  const d = state.cells.get(cellEl.dataset.key);
  if (!d || returning || previewing) return;

  // Back button: up ONE level (a page opened from another page goes back to that
  // page; a page opened from the main board goes back to the main board). Never speaks.
  if (d.kind === "home") { teach.onSelect({ type: "back" }); goTo(currentPageDef().parent || "core"); return; }

  if (state.editing) { editCell(d); return; }

  // "Add targets" mode: a tap on a word makes it a target (or removes it); a category button still opens its page.
  if (state.choosing) { chooseCell(d); return; }

  // Category / page button: open its page. No speech, nothing added.
  if (d.loadBoard) {
    teach.onSelect({ type: "category", id: d.wordId || d.key, label: d.label, opens: d.loadBoard });
    goTo(d.loadBoard);
    return;
  }

  // The Number pad button: opens the number pad. No speech, nothing added until a number is finalized.
  if (d.action === "numberpad") { teach.onSelect({ type: "other" }); openNumberPad(d); return; }

  // A normal word: speak immediately, add to the message bar.
  lastSelectAt = performance.now();      // starts the "ignore repeated taps" wait, if it is on
  speak(d.spoken);
  const shown = d.sentence ? d.spoken : d.label;
  const id = d.wordId || d.key;           // a built-in word's id ("fall-season"), or the cell key of a word the adult added
  state.sentence.push({ label: shown, spoken: d.spoken, base: shown, noForms: d.noForms, id, mode: recMode() });
  drawMessage();
  logWord(d.label, state.modeling ? "model" : "learner", state.modeling ? promptInfo() : undefined, { id });
  recordTap({ id, label: d.label, spoken: d.spoken, how: "board" });
  chipsChanged(true);
  teach.onSelect({ type: "word", id, label: d.label });     // (a no-op unless a teaching trial is running)

  if (state.page !== "core") returnToMain(d);
  else if (state.modeling) promptCell(d.key, RING_MS);
}

// A word was chosen on a category / sub-page: go back to the main board automatically.
// (Used by a tap on the word, and by choosing one of its forms in the dial.)
function returnToMain(d) {
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
}

// ---------- Edit mode ----------
// Everything an adult changes is stored in one of two places (see js/profiles.js):
//   built-in word  -> profile.words[wordId]   (follows the word to either board)
//   added by adult -> profile.cells[position] (belongs to that cell on that board)
async function editCell(d) {
  const profile = getCurrent();
  const page = currentPageDef();
  // (Never on a built-in folder page: those may sit deeper than the limit, see js/boardmodel.js.)
  const canMakePage = d.kind === "empty" && page.depth < MAX_DEPTH && !page.folder;
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

function startEditing() { closeForms(); closeDial(); stopSpeech(); state.modeling = false; state.choosing = false; state.editing = true; renderAll(); }
function stopEditing() { state.editing = false; renderAll(); }
function startModeling() { closeForms(); closeDial(); stopSpeech(); state.editing = false; state.choosing = false; state.modeling = true; renderAll(); }
function stopModeling() { state.modeling = false; clearCritter(); renderAll(); }

// ---------- Teaching: choosing targets ----------
// Adult menu > Teaching > Targets > Add targets. The board (and its pages and folders) is shown as usual with a banner over the
// message bar; tapping a word makes it a target (tap again to remove it) and says nothing. Category and folder buttons open
// their pages and Back goes up, so a word on a folder page is chosen with the page chain it sits on.
function startChoosing() {
  closeForms(); closeDial(); stopSpeech(); clearCritter();
  state.editing = false; state.modeling = false; state.choosing = true;
  renderAll();
}
function stopChoosing() {
  state.choosing = false;
  renderAll();
  showAdultMenu("sec-teaching");        // back to the Teaching section (the adult is already signed in)
}
function markTargets() {
  for (const el of document.querySelectorAll("#board .cell")) {
    const d = state.cells.get(el.dataset.key);
    el.classList.toggle("is-target", !!d && d.kind === "word" && d.visible && !d.loadBoard && isTarget(d.wordId || d.key));
  }
  const n = getTargets().length;
  $("target-count").textContent = n === 1 ? "1 target" : n + " targets";
}
async function chooseCell(d) {
  if (d.loadBoard) { goTo(d.loadBoard); return; }
  if (d.kind !== "word" || !d.visible || d.action) return;
  const profile = getCurrent();
  const id = d.wordId || d.key;
  if (isTarget(id)) await removeTarget(id);
  else {
    const path = pathToCore(modelNow(), profile, state.page).reverse().slice(1);     // pages after the main board
    await addTarget(profile.id, { wordId: id, label: d.label, pageId: state.page, path });
  }
  markTargets();
}

// ---------- Teaching: sessions ----------
async function startTeachingSession(opts) {
  closeForms(); closeDial(); stopSpeech(); clearCritter();
  state.editing = false; state.modeling = false; state.choosing = false;     // model mode and sessions are separate
  utteranceEnds("clear"); state.sentence.length = 0; drawMessage();
  scenes.closePhotoScene(); scenes.clearGlow();
  await teach.startSession(opts);
  renderAll();
}
// A session cannot carry on when the learner or the board size changes: it is saved and closed.
function closeSessionQuietly() { if (teach.isActive()) teach.endSession(); }

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
      utteranceEnds("clear");               // (the old learner's message, if any, is closed before the bar is emptied)
      closeSessionQuietly();
      everyday.prepare(getCurrent().id);
      const scenesLoaded = scenes.load();   // the new learner's scenes (and their active one); the adult menu waits for this
      loadTeaching(getCurrent().id).then(() => renderAll());
      closeForms();
      closeDial();
      stopSpeech();
      state.sentence.length = 0;
      drawMessage();
      state.page = "core";
      clearCritter();
      renderAll();
      return scenesLoaded;
    },
    onVocabChanged: renderAll,
    onBoardSizeChanged: () => {
      utteranceEnds("clear");
      closeSessionQuietly();
      closeDial();
      // Different grid: word locations changed, so start clean on the main board.
      state.sentence.length = 0;
      drawMessage();
      state.page = "core";
      renderAll();
    },
    onEdit: startEditing,
    onModel: startModeling,
    teach: { sessionActive: teach.isActive, onChooseTargets: startChoosing, onStartSession: startTeachingSession },
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
    if (typing.isOpen()) typing.close({ speak: false });   // keep what was typed as a chip, but say nothing
    scenes.closePhotoScene(); scenes.clearGlow();
    teach.pauseForMenu();                                   // a teaching trial in progress is skipped
    showAdultMenu();
  } finally {
    adultBusy = false;
  }
}

// ---------- Start ----------
async function start() {
  initSpeech();
  // Beta copy only: a small "BETA" tag in the message-bar corner so adults can tell the copies apart.
  if (CHANNEL === "beta") {
    const tag = document.createElement("span");
    tag.id = "beta-tag";
    tag.textContent = "BETA";
    $("message-text").appendChild(tag);
  }
  // Registered first so a brand-new device caches the app even while the quick setup screen is open.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js", { scope: "./" }).catch((e) =>
      console.warn("Offline support unavailable:", e));
  }
  state.board = await loadBoardData();
  await loadForms();
  await initProfiles(state.board);
  if (!hasProfiles()) {
    // Very first open on this device: quick setup (or restore a backup), then start.
    const c = await showSetup({ first: true });
    if (!c.restored) await addProfile(c.name, c);
    await chooseCurrent();
  }
  preloadCritterArt();      // so the critter can appear instantly the first time

  // Everyday recording (Beta 2.2): read this learner's known words ahead of the first tap, write on hide, and a few seconds
  // after start prune raw events older than each learner's retention setting (one key-range delete per learner, off the tap path).
  everyday.initEveryday();
  everyday.prepare(getCurrent().id);
  setTimeout(() => everyday.maintain(listProfiles().map((p) => p.id)), 4000);

  // Teaching (beta): this learner's targets, and any session left open when the app was closed is closed now.
  for (const p of listProfiles()) await closeOrphanSessions(p.id);
  await loadTeaching(getCurrent().id);
  teach.initSession({
    strip: $("context-strip"), appEl: $("app"), boardEl: $("board"), wordsBtn: $("words-btn"),
    modelNow, getPageId: () => state.page, getCells: () => state.cells, goTo,
    wordsButtonAvailable: () => wordsButtonShown(getCurrent()),
    onSessionChange: () => renderAll(),
    runEndFlow: (result) => runEndFlow(result, { board: state.board, onVocabChanged: renderAll }),
  });

  // Scenes (Beta 3.0): only reads this learner's scenes from the device now; the recognition library is NOT loaded here.
  scenes.init({
    appEl: $("app"), stripEl: $("context-strip"), onTap: onSceneItem,
    holdMs, blocked: tapsBlocked, getPageId: () => state.page, wordsButtonShown: () => wordsButtonShown(getCurrent()),
    onActiveChanged: () => { if (started) renderAll(); },
  });
  await scenes.load();

  typing = createTyping({
    host: $("app"),
    speakLetters: () => getCurrent().speakLetters,
    allowLetters: () => keyboardButtonShown(getCurrent()),
    onDraft: (text, kind) => { state.draft = text ? { text, kind } : null; drawMessage(); },
    onCommit: onTyped,
    onLetter: (name) => speak(name, "word"),
    onKeyPress: (el) => { if (state.modeling) ringBriefly(el, getCurrent().model); },
    onOpenChange: (open) => { $("app").classList.toggle("typing", open); },
  });

  attachPressHandling($("board"), onCellTap, ".cell.tap", { holdMs, blocked: tapsBlocked, dialMs, openDial: openWordDial });

  // Message bar: tap text to speak the sentence; Delete / Clear
  attachPressHandling($("message-bar"), (el) => {
    if (el.disabled) return;
    if (el.id === "message-text") playMessage();
    else if (el.id === "delete-btn") { stopSpeech(); state.sentence.pop(); drawMessage(); chipsChanged(false); }   // removes a whole chip
    else if (el.id === "clear-btn") { stopSpeech(); utteranceEnds("clear"); state.sentence.length = 0; typing.clearDraft(); drawMessage(); }
    else if (el.id === "words-btn") {
      if (!returning && !previewing && !typing.isOpen()) {
        // (Opening the Words menu is a choice the teaching trial must classify before the page changes.)
        teach.onSelect(onWordsPage() ? { type: "back" } : { type: "category", id: "words-btn", label: "Words", opens: "words" });
        toggleWords();
      }
    }
    else if (el.id === "forms-btn") { if (!typing.isOpen()) openForms(); }
    else if (el.id === "abc-btn") toggleKeyboard();
  }, "#message-text, .bar-btn:not(#camera-btn)");     // (the camera button has its own 1-second hold: js/camerabtn.js)
  initCameraButton({
    button: $("camera-btn"),
    blocked: () => (teach.isActive() ? "Finish the session first" : null),   // no camera during a teaching session
  });

  fitLabelsOnResize($("board"));
  attachHold($("adult-hold"), HOLD_TO_OPEN_MS, openAdult);
  attachHold($("model-end"), HOLD_TO_END_MODEL_MS, stopModeling);
  $("edit-done").addEventListener("click", stopEditing);
  $("edit-words").addEventListener("click", toggleWords);   // so an adult can edit the Words pages too
  $("target-done").addEventListener("click", stopChoosing);
  $("target-words").addEventListener("click", toggleWords); // so an adult can choose targets on the Words pages too

  started = true;
  renderAll();

  // Block pinch/double-tap zoom and rubber-band scrolling on iOS
  // (but let the adult menus scroll).
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("touchmove", (e) => { if (!e.target.closest(".sheet")) e.preventDefault(); }, { passive: false });
  document.addEventListener("contextmenu", (e) => e.preventDefault());
}

start();
