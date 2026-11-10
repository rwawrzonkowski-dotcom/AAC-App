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
import { askConfirm, toast } from "./ui.js";
import { MAX_CHAIN } from "./teaching.js";
import { showSetup } from "./setup.js";
import { requestPersistence, maybeShowNotice } from "./keepdata.js";
import { initAdultHint, maybeShowCoach } from "./adulthint.js";
import { openCellEditor } from "./editor.js";
import {
  runPrompt, sustainStep, clearCritter, stepPauseMs, usesCritter, ringBriefly, RING_MS, RING_PATH_MS, CRITTER_TOTAL_MS,
} from "./modelprompt.js";
import { setPreviewHook } from "./ladderui.js";
import { preloadCritterArt } from "./critters.js";
import { CHANNEL } from "./channel.js";
import * as teach from "./session.js";
import { runEndFlow } from "./teachui.js";
import { loadTeaching, getTargets, isTarget, addTarget, addChainTarget, removeTarget, closeOrphanSessions } from "./teachdata.js";
import { loadForms, formsFor, dialFor, openFormsPopover } from "./forms.js";
import { openDial } from "./dial.js";
import * as everyday from "./everyday.js";
import * as scenes from "./scenestrip.js";
import * as little from "./littlewords.js";
import { openModelSentence } from "./modelsentence.js";
import { openToneWheel } from "./tonewheel.js";
import { toneById } from "./tones.js";
import { wordInfo } from "./scenewords.js";
import { MODEL_STEP_MS as STEP_MS_BY_SPEED } from "./critters.js";
import { initCameraButton } from "./camerabtn.js";
import { checkOpenProblem, showNotSavingTag, watchWriteProblems } from "./datawarning.js";

const HOLD_TO_OPEN_MS = 3000;   // adult corner target
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
  chooseKind: "words", // "words" (each tap adds or removes a word target) or "sentence" (taps build one sentence target, Beta 3.12)
  chainDraft: [],     // the sentence being built: [{ wordId, label, pageId, path }]
  modeling: false,    // Model mode
  sentence: [],       // words in the message bar: {label, spoken, base} (base = the word tapped on the board)
  cells: new Map(),   // key -> description of each cell currently drawn
  forms: null,        // the open Forms popover, if any
  dial: null,         // the open press-and-hold word-forms dial, if any (js/dial.js); also the tone wheel (js/tonewheel.js)
  mood: null,         // the learner's mood (a tone id from js/tones.js) or null; kept only while VOICE is open (Beta 3.16)
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
// The little-word strip (Beta 3.7): Auto shows it from stage 3, like the camera and ABC.
const littleStripShown = (p) => p.littleStrip === "always" || (p.littleStrip !== "never" && p.stage >= 3);
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
function utteranceEnds(source, extra) { try { everyday.endUtterance(source, extra); } catch (e) { /* ignore */ } }

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
  placeModelEnd();
  $("target-banner").hidden = !state.choosing;
  $("edit-actions").hidden = !state.editing;       // (the buttons sit in the strip under the banners, Beta 3.14)
  $("target-actions").hidden = !state.choosing;
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
  updateLittle();                                           // the little-word strip (Beta 3.7), unless a scene has the strip
  drawMoodBadge();                                          // the mood face in the message bar (Beta 3.16)
  if (hintsReady) setTimeout(coachCheck, 600);           // "This is the adult menu", once per learner (js/adulthint.js)
}

// The adult-menu pointer shows once per learner, only on the child's plain board (no menu, session, edit, Model mode or keyboard open).
let hintsReady = false;      // set after the start-up Home Screen notice (if any) is closed, so the two never stack
function coachCheck() {
  maybeShowCoach(getCurrent().id, () => !state.editing && !state.choosing && !state.modeling && !teach.isActive()
    && !(typing && typing.isOpen()) && !document.querySelector(".overlay"));
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
// toneId (Beta 3.16): undefined = the learner's mood (if any); a tone id = that tone, once (from the tone wheel); null = Normal.
function playMessage(toneId, from = "wheel") {
  const chunks = state.sentence.map((w) => w.spoken).filter(Boolean);
  if (!chunks.length) return;
  const fromWheel = toneId !== undefined;
  if (isMessagePlaying() && !fromWheel) { stopSpeech(); return; }
  const tone = toneById(fromWheel ? toneId : state.mood);
  const gap = pauseMs();
  if (gap > 0) speakSequence(chunks, gap, { onChunk: highlightChip, onEnd: () => highlightChip(-1), tone });
  else speakMessage(chunks.join(" "), tone);
  if (tone) recordTap({ id: tone.wordId, label: tone.label, spoken: tone.label, how: "tone" });   // (not counted as a word)
  utteranceEnds("barSpeak", tone ? { tone: tone.id, toneFrom: fromWheel ? from : "mood" } : null);   // (after the speech has started)
}

// ---------- Tone wheel and mood (Beta 3.16, js/tones.js + js/tonewheel.js) ----------
// Press and hold the message bar (learners at stage 4 with "Tone wheel" on): 8 feelings around the finger. A pick says the message
// once in that tone; resting 1 second on a feeling first sets it as the learner's MOOD (every message in that tone until changed;
// a small face shows in the message bar); the centre, "Normal", clears the mood. The mood lasts while VOICE is open.
const toneWheelOn = (p) => p.toneWheel === "on" && p.stage >= 4;
function toneDialMs(el) {
  if (el.id !== "message-text" || !toneWheelOn(getCurrent()) || !state.sentence.length) return 0;
  if (state.dial || state.editing || state.choosing || returning || previewing || teach.isActive() || (typing && typing.isOpen())) return 0;
  return Math.round(getCurrent().wordDial.holdSec * 1000);
}
function openToneWheelAt(el, { pointer }) {
  const r = el.getBoundingClientRect();
  stopSpeech();
  state.dial = openToneWheel({
    x: pointer ? pointer.x : r.left + r.width / 2, y: pointer ? pointer.y : r.top + r.height / 2, pointer, mood: state.mood,
    iconOf: (t) => (wordInfo(t.wordId) || {}).image || null,
    onPick: (t, { lock }) => { if (lock) setMood(t.id); playMessage(t.id, lock ? "mood" : "wheel"); },
    onNormal: () => { setMood(null); playMessage(null); },
    onClose: () => { state.dial = null; },
  });
  return true;
}
function setMood(id) {
  const before = state.mood;
  state.mood = id || null;
  drawMoodBadge();
  if (before !== state.mood) {
    const t = toneById(state.mood);
    recordTap({ id: t ? t.wordId : null, label: t ? t.label : "normal", spoken: t ? t.label : "normal", how: "mood" });   // (not counted as a word)
  }
}
function drawMoodBadge() {
  const b = $("mood-badge"), t = toneById(state.mood);
  if (t && !toneWheelOn(getCurrent())) { state.mood = null; }
  const tone = toneById(state.mood);
  b.hidden = !tone;
  b.replaceChildren();
  if (!tone) return;
  const src = (wordInfo(tone.wordId) || {}).image;
  if (src) { const img = document.createElement("img"); img.src = src; img.alt = ""; b.append(img); }
  else b.textContent = tone.id === "question" ? "?" : tone.label[0];
  b.title = "Mood: " + tone.label;
  b.setAttribute("aria-label", "Mood: " + tone.label);
}

// ---------- Scenes: a tap on a strip button or on the scene photo ----------
// The same rules as a board word: speak first, then the chip and the everyday record (how: "scene" for a strip
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
  recordTap({ id, label: item.label, spoken, how, sceneId });
  chipsChanged(true);
  if (state.modeling && how === "scene" && el) runPrompt(el, getCurrent().model, getPhotoUrl("critter"), RING_MS);
}

// ---------- The little-word strip (Beta 3.7, js/littlewords.js) ----------
// It shows only on the child's board: not while a scene has the strip, a teaching session runs, or the adult edits or chooses targets.
let littleKey = "";
function updateLittle() {
  const p = getCurrent();
  const on = littleStripShown(p) && !state.editing && !state.choosing && !teach.isActive() && !$("app").classList.contains("scene-on");
  $("app").classList.toggle("little-on", on);
  if (!on) return;
  // Redraw the buttons when the learner (or their stage) changed, so a renamed word shows its new label.
  const key = p.id + "|" + p.stage + "|" + JSON.stringify(p.words || {}).length;
  if (key !== littleKey) { littleKey = key; little.refresh(); } else little.layout();
}

// A tap on a strip button: the group's head word, with the same rules as a board word (speak first, then the chip and the records).
function onLittleTap(el) {
  if (returning || previewing) return;
  const g = little.groupOf(el);
  if (!g) return;
  addLittleWord(little.info(g.head), { how: "little", el });
}
function addLittleWord(w, { how, el, afterSelect = false, base }) {
  lastSelectAt = performance.now();
  speak(w.spoken || w.label);
  const item = { label: w.label, spoken: w.spoken || w.label, base: w.label, id: w.id, mode: recMode() };
  const last = state.sentence[state.sentence.length - 1];
  // Hold to select already added the head word during this press: the dial word replaces it.
  if (afterSelect && last && base && last.id === base.id) state.sentence[state.sentence.length - 1] = item; else state.sentence.push(item);
  drawMessage();
  recordTap({ id: w.id, label: w.label, spoken: w.spoken || w.label, how, ...(base ? { base: base.label } : {}) });
  chipsChanged(true);
  if (state.modeling && el) runPrompt(el, getCurrent().model, getPhotoUrl("critter"), RING_MS);
}
// Press and hold a strip button: its group's dial (the same dial as word forms; the same hold time).
function littleDialMs(el) {
  if (!little.groupOf(el) || state.dial || state.forms || returning || previewing || (typing && typing.isOpen())) return 0;
  const hold = holdMs();
  return hold > 0 ? hold + 800 : Math.round(getCurrent().wordDial.holdSec * 1000);
}
function openLittleDial(el, { pointer, afterSelect }) {
  const g = little.groupOf(el);
  const r = el.getBoundingClientRect();
  if (!g || !el.isConnected || !r.width) return false;
  const head = little.info(g.head);
  state.dial = openDial({
    anchor: { rect: { left: r.left, top: r.top, width: r.width, height: r.height }, label: head.label,
              bg: getComputedStyle(el).backgroundColor, imgSrc: null },
    entries: little.entriesFor(g),
    markers: false,
    pointer,
    onClose: () => { state.dial = null; },
    onChoose: (entry, chip) => {
      addLittleWord({ id: entry.id, label: entry.word, spoken: entry.spoken }, { how: "little dial", afterSelect, base: head });
      if (state.modeling) {
        const dial = state.dial;
        runPrompt(chip, getCurrent().model, getPhotoUrl("critter"), RING_MS);
        setTimeout(() => { if (state.dial === dial) closeDial(); }, 700);
      } else closeDial();
    },
  });
  return true;
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

// End modeling (Beta 3.11). A large button over the right end of the message bar, away from the screen's top edge (iPadOS keeps that
// edge for its swipe-down gesture and delays or cancels touches there). Two ordinary taps: the first asks "Tap again to end"
// for 3 seconds, the second ends Model mode. (The adult menu's "Stop modeling" quick action is a second way out.)
const END_CONFIRM_MS = 3000;
let endTimer = null;
function placeModelEnd() {
  const btn = $("model-end");
  btn.hidden = !state.modeling;
  $("model-type").hidden = !state.modeling;
  if (!state.modeling) { resetModelEnd(); return; }
  const r = $("message-text").getBoundingClientRect();
  // Always below the purple banner (so never at the screen's top edge), as tall as the room left in the message bar, at least 44 px.
  const top = Math.round(Math.max(r.top + (r.height * 0.19), $("model-banner").getBoundingClientRect().bottom + 6));
  const hgt = Math.max(44, Math.round(Math.min(r.height * 0.62, r.bottom - 4 - top)));
  btn.style.height = hgt + "px";
  btn.style.top = top + "px";
  btn.style.right = Math.round(window.innerWidth - r.right + 8) + "px";
  // "Model a sentence" sits just left of End modeling, same height (Beta 3.15).
  const mt = $("model-type");
  mt.hidden = false;
  mt.style.height = hgt + "px";
  mt.style.top = top + "px";
  mt.style.right = Math.round(window.innerWidth - r.right + 8 + btn.getBoundingClientRect().width + 8) + "px";
}
function resetModelEnd() {
  clearTimeout(endTimer); endTimer = null;
  const btn = $("model-end");
  btn.classList.remove("confirm");
  btn.textContent = "End modeling";
}
function initModelEnd() {
  const btn = $("model-end");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!state.modeling) return;
    if (btn.classList.contains("confirm")) { resetModelEnd(); stopModeling(); return; }
    btn.classList.add("confirm");
    btn.textContent = "Tap again to end";
    clearTimeout(endTimer);
    endTimer = setTimeout(resetModelEnd, END_CONFIRM_MS);
  });
  window.addEventListener("resize", placeModelEnd);
  $("model-type").addEventListener("click", (e) => {
    e.stopPropagation();
    if (!state.modeling || modelingSentence) return;
    resetModelEnd();
    openModelSentence({ wordsButtonShown: wordsButtonShown(getCurrent()), onModel: modelTypedSentence });
  });
}

// Model a sentence (Beta 3.15): the typed words the child can see, modeled in order along their real paths (js/modelsentence.js).
// A word that is a head of the little-word strip (and the strip is showing) is modeled right there, one tap. "End modeling" stops it.
let modelingSentence = false;
async function modelTypedSentence(words) {
  const stripOn = $("app").classList.contains("little-on");
  const heads = new Set(little.GROUPS.map((g) => g.head));
  const items = [];
  for (const w of words) {
    if (stripOn && heads.has(w.wordId)) { items.push({ wordId: w.wordId, label: w.label, spoken: w.spoken, chipLabel: w.text, steps: [{ strip: true, word: true }] }); continue; }
    const route = teach.routeTo(w.wordId, w.label, w.pageId);
    if (route) items.push({ wordId: w.wordId, label: w.label, spoken: w.spoken, chipLabel: w.viaForm ? w.text : null, steps: route.steps });
  }
  if (!items.length) return;
  modelingSentence = true;
  $("model-type").disabled = true;
  try {
    await modelChainWords(items, { stepMs: STEP_MS_BY_SPEED[getCurrent().model.speed] || STEP_MS_BY_SPEED.medium, keepGoing: () => state.modeling });
  } finally { modelingSentence = false; $("model-type").disabled = false; }
}

// ---------- Teaching: choosing targets ----------
// Adult menu > Teaching > Targets > Add targets. The board (and its pages and folders) is shown as usual with a banner over the
// message bar; tapping a word makes it a target (tap again to remove it) and says nothing. Category and folder buttons open
// their pages and Back goes up, so a word on a folder page is chosen with the page chain it sits on.
// Beta 3.12, "Add a sentence": the same mode, but each word tapped is ADDED to a sentence in order (2 to 6 words); Undo takes the last
// one off; Done saves the sentence as one target (js/teaching.js "Sentence targets"). After a word on a page, the board goes back to the
// main page, ready for the next word.
function startChoosing(kind = "words") {
  closeForms(); closeDial(); stopSpeech(); clearCritter();
  state.editing = false; state.modeling = false; state.choosing = true;
  state.chooseKind = kind; state.chainDraft = [];
  if (state.page !== "core") state.page = "core";
  renderAll();
}
// Leaving always finishes (Beta 3.13): the mode is switched off first, whatever happens after (saving, the menu). reopenMenu = false
// when the adult menu is being opened anyway (the gear was held while choosing).
async function stopChoosing({ reopenMenu = true } = {}) {
  if (!state.choosing) return;
  const kind = state.chooseKind, draft = state.chainDraft || [];
  state.choosing = false; state.chooseKind = "words"; state.chainDraft = [];
  if (state.page !== "core") state.page = "core";
  try { renderAll(); } catch (e) { console.warn("Redraw after choosing targets:", e); }
  try {
    if (kind === "sentence") {
      if (draft.length >= 2) {
        const t = await addChainTarget(getCurrent().id, draft);
        toast(`Sentence target added: “${t.label}”. Choose its chaining in Targets > Settings.`, 4000);
      } else if (draft.length === 1) toast("A sentence needs at least 2 words. Nothing was saved.", 3500);
    }
  } catch (e) { console.warn("Could not save the sentence target:", e); toast("Sorry, the sentence could not be saved.", 3500); }
  if (reopenMenu) showAdultMenu("sec-teaching");        // back to the Teaching section (the adult is already signed in)
}

// The Done / Undo buttons on the Edit and Add-targets banners (Beta 3.13). The ordinary click does it; if iPad Safari lifts the finger on
// the button but sends no click, the lift does it a moment later instead. (Acting on the lift straight away would let that same tap's
// click land on whatever opens under the finger, such as the adult menu's Close button.)
const BANNER_FALLBACK_MS = 350;
function onBannerTap(btn, fn) {
  let downOn = false, last = 0, pending = null;
  const fire = () => {
    clearTimeout(pending); pending = null;
    const now = Date.now();
    if (now - last < 600 || btn.disabled) return;
    last = now; fn();
  };
  btn.addEventListener("pointerdown", () => { downOn = true; });
  btn.addEventListener("pointerup", (e) => {
    if (!downOn) return;
    downOn = false;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    if (under && btn.contains(under)) { clearTimeout(pending); pending = setTimeout(fire, BANNER_FALLBACK_MS); }
  });
  btn.addEventListener("pointercancel", () => { downOn = false; });
  btn.addEventListener("click", fire);
}
function undoSentenceWord() {
  if (state.chooseKind !== "sentence" || !state.chainDraft.length) return;
  state.chainDraft.pop();
  markTargets();
}
function markTargets() {
  const sentence = state.chooseKind === "sentence";
  const draftIds = new Set((state.chainDraft || []).map((l) => l.wordId));
  for (const el of document.querySelectorAll("#board .cell")) {
    const d = state.cells.get(el.dataset.key);
    const word = !!d && d.kind === "word" && d.visible && !d.loadBoard;
    el.classList.toggle("is-target", word && !sentence && isTarget(d.wordId || d.key));
    el.classList.toggle("in-sentence", word && sentence && draftIds.has(d.wordId || d.key));
  }
  $("target-undo").hidden = !sentence;
  $("target-undo").disabled = !sentence || !state.chainDraft.length;
  if (sentence) {
    const words = state.chainDraft.map((l) => l.label).join(" ");
    $("target-banner-text").textContent = words ? "Sentence: " + words : "Tap the words of the sentence in order";
    $("target-count").textContent = `${state.chainDraft.length} of ${MAX_CHAIN}`;
  } else {
    $("target-banner-text").textContent = "Tap words to add as targets";
    const n = getTargets().length;
    $("target-count").textContent = n === 1 ? "1 target" : n + " targets";
  }
}
async function chooseCell(d) {
  if (d.loadBoard) { goTo(d.loadBoard); return; }
  if (d.kind !== "word" || !d.visible || d.action) return;
  const profile = getCurrent();
  const id = d.wordId || d.key;
  if (state.chooseKind === "sentence") {
    if (state.chainDraft.length >= MAX_CHAIN) { toast(`A sentence can have up to ${MAX_CHAIN} words. Tap Done.`); return; }
    const path = pathToCore(modelNow(), profile, state.page).reverse().slice(1);
    state.chainDraft.push({ wordId: id, label: d.label, pageId: state.page, path });
    speak(d.spoken);                     // so the adult hears which word was added
    if (state.page !== "core") goTo("core"); else markTargets();
    return;
  }
  if (isTarget(id)) await removeTarget(id);
  else {
    const path = pathToCore(modelNow(), profile, state.page).reverse().slice(1);     // pages after the main board
    await addTarget(profile.id, { wordId: id, label: d.label, pageId: state.page, path });
  }
  markTargets();
}

// Forward chaining (Beta 3.12): the app models the rest of the sentence. For each word it shows the learner's Model prompt (ring
// and/or critter) on each button along the word's route (category, folder, word), opens the pages, adds the word and says it, then
// goes back to the main board. items = [{ wordId, label, steps }] (steps = the route from js/session.js buildChain).
// Also used by "Model a sentence" (Beta 3.15): opts.stepMs (the learner's Model speed), opts.keepGoing() (false = stop now, e.g. the
// adult ended Model mode), item.spoken / item.chipLabel (what to say and show when it differs from the button, e.g. "wanted"), and
// steps [{ strip: true, word: true }] for a word modeled on the little-word strip.
const MODEL_STEP_MS = 900;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function modelChainWords(items, { stepMs = MODEL_STEP_MS, keepGoing = () => true } = {}) {
  returning = true;                                   // the child's taps are ignored while the app models
  try {
    outer: for (const it of items) {
      if (state.page !== "core") { goTo("core"); await wait(250); }
      for (const st of it.steps) {
        if (!keepGoing()) break outer;
        const cells = [...state.cells.values()];
        let el = null;
        if (st.strip) el = document.querySelector(`#little-bar .lw-item[data-id="${it.wordId}"]`);
        else if (st.word) { const d = cells.find((c) => c.kind === "word" && c.visible && (c.wordId || c.key) === it.wordId); el = d && document.querySelector(`#board .cell[data-key="${d.key}"]`); }
        else if (st.bar) el = $("words-btn");
        else el = document.querySelector(`#board .cell[data-key="${st.key}"]`);
        if (el) runPrompt(el, getCurrent().model, getPhotoUrl("critter"), stepMs);
        await wait(stepMs);
        if (!keepGoing()) break outer;
        if (st.word) {
          const d = cells.find((c) => c.kind === "word" && (c.wordId || c.key) === it.wordId);
          const spoken = it.spoken || (d && d.spoken) || it.label;
          speak(spoken);
          state.sentence.push({ label: it.chipLabel || (d && d.sentence ? spoken : it.label), spoken, base: it.label, id: it.wordId, mode: "model" });
          drawMessage(); chipsChanged(false);
          await wait(Math.round(stepMs * 0.55));
        } else if (st.opens) { if (st.bar) toggleWords(); else goTo(st.opens); await wait(300); }
      }
      clearCritter();
    }
    if (state.page !== "core") goTo("core");
  } finally { returning = false; clearCritter(); }
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
      state.mood = null;                    // (a mood belongs to the learner who set it)
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
    isModeling: () => state.modeling, onStopModel: stopModeling,      // the menu's quick action reads "Stop modeling" while modeling
    teach: { sessionActive: teach.isActive, onChooseTargets: () => startChoosing("words"), onChooseSentence: () => startChoosing("sentence"),
      onStartSession: startTeachingSession },
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
    if (state.choosing) await stopChoosing({ reopenMenu: false });   // the gear is a way out of Add targets / Add a sentence too (Beta 3.13)
    if (state.editing) stopEditing();                                 // ... and out of Edit mode
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
  requestPersistence();     // ask the browser to keep VOICE's data (quiet; js/keepdata.js)
  state.board = await loadBoardData();
  await loadForms();
  await initProfiles(state.board);
  // Beta 3.17: the saved data could not be opened. Warn first (Try again / Continue without saving) instead of showing the setup
  // screen as if the iPad were new (js/datawarning.js).
  if (await checkOpenProblem()) showNotSavingTag($("message-text"));
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
    // Sentence targets (Beta 3.12):
    clearMessage: () => { stopSpeech(); utteranceEnds("clear"); state.sentence.length = 0; drawMessage(); },
    addWords: (items) => {                        // backward chaining: the first words, put in the message bar silently
      for (const w of items) state.sentence.push({ label: w.label, spoken: w.spoken, base: w.label, id: w.wordId, mode: "model" });
      drawMessage(); chipsChanged(false);
    },
    modelWords: modelChainWords,                  // forward chaining: the app models the words after the learner's part
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
    if (el.id === "message-text") { playMessage(); teach.onSelect({ type: "speak" }); }   // (a sentence target's "say the sentence" step)
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
  }, "#message-text, .bar-btn:not(#camera-btn)",      // (the camera button has its own 1-second hold: js/camerabtn.js)
  { dialMs: toneDialMs, openDial: openToneWheelAt });  // press and hold the message: the tone wheel (Beta 3.16)
  initCameraButton({
    button: $("camera-btn"),
    blocked: () => (teach.isActive() ? "Finish the session first" : null),   // no camera during a teaching session
  });

  fitLabelsOnResize($("board"));
  // The little-word strip (Beta 3.7): tap = the head word, press and hold = its dial. Touch supports apply as on the board.
  attachPressHandling(little.init($("context-strip")), onLittleTap, ".lw-item",
    { holdMs, blocked: tapsBlocked, dialMs: littleDialMs, openDial: openLittleDial });
  attachHold($("adult-hold"), HOLD_TO_OPEN_MS, openAdult);
  initAdultHint($("adult-hold"));          // a quick tap shows "Adults: hold 3 seconds to open the menu"
  initModelEnd();                          // End modeling: two taps on a button inside the message bar (Beta 3.11)
  onBannerTap($("edit-done"), stopEditing);
  $("edit-words").addEventListener("click", toggleWords);   // so an adult can edit the Words pages too
  onBannerTap($("target-done"), () => stopChoosing());
  onBannerTap($("target-undo"), undoSentenceWord);
  $("target-words").addEventListener("click", toggleWords); // so an adult can choose targets on the Words pages too

  started = true;
  renderAll();
  // Beta 3.17: a save that fails later (for example the iPad is out of storage) gets a one-time adult notice, never during a session.
  watchWriteProblems({ busy: () => teach.isActive() || !!document.querySelector(".overlay"), tagHost: $("message-text") });

  // Block pinch/double-tap zoom and rubber-band scrolling on iOS
  // (but let the adult menus scroll).
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("touchmove", (e) => { if (!e.target.closest(".sheet")) e.preventDefault(); }, { passive: false });
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  // iPad / iPhone in a Safari tab: once a day, explain how to add VOICE to the Home Screen so Safari can't erase its data (js/keepdata.js).
  // Then (Beta 3.5) the once-per-learner "This is the adult menu" pointer.
  setTimeout(async () => {
    await maybeShowNotice({ busy: () => teach.isActive() || !!document.querySelector(".overlay") });
    hintsReady = true;
    coachCheck();
  }, 1500);
}

start();
