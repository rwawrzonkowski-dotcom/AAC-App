// The adult menu: a large overlay for learners, board size, vocabulary stage, edit mode,
// model prompt (ring / critter), voice settings, touch supports, backup and model mode. Adult-styled so it looks different from the
// child's board.
import { h, openOverlay, askText, askConfirm } from "./ui.js";
import {
  listProfiles, getCurrent, switchTo, addProfile, renameProfile, deleteProfile,
  saveProfile, CHILD_VOICE, ADULT_VOICE, DIAL_HOLD_MIN, DIAL_HOLD_MAX,
} from "./profiles.js";
import { setVoiceSettings, speak, speakSequence, stopSpeech, pauseMs, PAUSE_MS } from "./speech.js";
import { createVoicePicker, newPickerState } from "./voicepicker.js";
import { saveBackup, restoreFromFile } from "./backup.js";
import { showSetup } from "./setup.js";
import { buildModel } from "./boardmodel.js";
import { modelSection } from "./modelsettings.js";
import { VERSION_LABEL } from "./channel.js";
import { openAbout } from "./about.js";
import { volumeTestBlock, looksLikePhone, PHONE_BOARD_TIP, moreVoicesHelp } from "./devicetips.js";
import { teachingSection } from "./teachui.js";
import { dataSection } from "./datapanel.js";
import { openReports } from "./reports.js";
import { scenesSection } from "./sceneadult.js";

const PREVIEW_TEXT = "I want more bubbles please";   // "Hear a sample sentence"
const PREVIEW_WORD = "bubbles";                      // "Preview a word"

// callbacks:
//   board            the loaded word map (to list the words in each stage)
//   onLearnerChanged()  a different learner is now current (board must redraw)
//   onVocabChanged()    stage changed (board must redraw)
//   onBoardSizeChanged()  this learner's board size changed (45 <-> 84)
//   onEdit(), onModel() start those modes (the menu closes first)
//   onPreviewPrompt()   "Preview on board" in the Model prompt section (the menu closes first;
//                       the app runs the prompt and then opens the menu again)
//   startAt             id of a section to scroll to when the menu opens (optional)
//   teach               the Teaching section (Phase 2): { sessionActive(), onChooseTargets(), onStartSession(opts) }
export function openAdultMenu({ board, startAt, onLearnerChanged, onVocabChanged, onBoardSizeChanged, onEdit, onModel,
  onPreviewPrompt, teach }) {
  const body = h("div", { class: "menu-body" });
  let stopVoiceListener = () => {};
  const pickerState = newPickerState();   // which voice groups are open; kept when the menu is rebuilt
  let backupMessage = "";   // result of the last save / restore, shown in the Backup section

  const o = openOverlay([
    h("div", { class: "menu-head" },
      h("h1", {}, "VOICE", h("small", { class: "version-label", id: "version-label", text: VERSION_LABEL })),
      h("button", { type: "button", class: "btn primary", id: "menu-close-top", text: "Close", onclick: close })),
    body,
  ], { sheetClass: "menu" });

  function close() {
    stopVoiceListener();
    stopSpeech();
    o.close();
  }

  // Rebuild the whole menu, keeping the scroll position.
  function refresh() {
    const top = body.scrollTop;
    stopVoiceListener();
    body.replaceChildren(...[noticeSection(), learnerSection(), sizeSection(), stageSection(), actionSection(),
      modelSection({ refresh, closeMenu: close, onPreviewPrompt }),
      teachingSection({ refresh, closeMenu: close, ...teach }), scenesSection({ refresh, closeMenu: close }), dataSection({ refresh, sessionActive: teach.sessionActive }), reportsSection(), voiceSection(),
      touchSection(), backupSection(), aboutSection(),
      h("button", { type: "button", class: "btn wide", id: "menu-close", text: "Close", onclick: close })].filter(Boolean));
    body.scrollTop = top;
  }

  // ---------- Reports (Beta 2.5) ----------
  // Opens the Reports screen over the menu. Everything is worked out only while that screen is open.
  function reportsSection() {
    return h("section", { class: "panel", id: "sec-reports" },
      h("h2", { text: "Reports" }),
      h("p", { class: "muted", text: "Progress graphs for teaching and everyday use, a printable summary, a plain-language summary for the family, and spreadsheet (CSV) files. " +
        "Nothing leaves this iPad unless you print a page or save a file." }),
      h("div", { class: "btn-row left" },
        h("button", { type: "button", class: "btn primary", id: "reports-open", text: "Open reports", onclick: () => openReports({ learnerId: getCurrent().id }) })));
  }

  // ---------- Notes about changes (only shown when there is something to tell the adult) ----------
  // For example: after an upgrade moved a word the adult had added (see js/migrate.js).
  function noticeSection() {
    const cur = getCurrent();
    if (!cur.notices || !cur.notices.length) return null;
    return h("section", { class: "panel notice", id: "sec-notice" },
      h("h2", { text: "Notes about " + cur.name + "'s board" }),
      h("p", { class: "muted", text: "The board was updated. A built-in word now uses a spot where you had added a word " +
        "(a new folder button was added, or the category pages were reorganized into rows of related words): that word was " +
        "kept and moved to a free spot. Some built-in words also moved into a folder. Here is what changed:" }),
      h("ul", { class: "notice-list" }, cur.notices.map((t) => h("li", { text: t }))),
      h("div", { class: "btn-row left" },
        h("button", { type: "button", class: "btn", id: "notice-ok", text: "Got it", onclick: async () => {
          cur.notices = [];
          await saveProfile(cur);
          refresh();
        } })));
  }

  // ---------- Learner ----------
  function learnerSection() {
    const cur = getCurrent();
    const list = listProfiles();
    return h("section", { class: "panel", id: "sec-learner" },
      h("h2", { text: "Learner" }),
      h("div", { class: "learner-list" }, list.map((p) =>
        h("button", {
          type: "button", class: "learner-item" + (p.id === cur.id ? " current" : ""),
          "data-id": p.id, text: (p.id === cur.id ? "✓ " : "") + p.name,
          onclick: async () => {
            if (p.id === cur.id) return;
            await switchTo(p.id);
            await onLearnerChanged();
            refresh();
          },
        }))),
      h("div", { class: "btn-row left" },
        h("button", { type: "button", class: "btn", id: "learner-add", text: "Add learner", onclick: async () => {
          const choice = await showSetup({ first: false });   // quick setup: board size, stage, name
          if (!choice) return;
          const p = await addProfile(choice.name, choice);
          await switchTo(p.id);
          await onLearnerChanged();
          refresh();
        } }),
        h("button", { type: "button", class: "btn", id: "learner-rename", text: "Rename", onclick: async () => {
          const name = await askText("Rename learner", cur.name, "Save");
          if (!name) return;
          await renameProfile(cur.id, name);
          await onLearnerChanged();
          refresh();
        } }),
        h("button", { type: "button", class: "btn danger", id: "learner-delete", text: "Delete",
          disabled: list.length <= 1, onclick: async () => {
            const sure = await askConfirm(
              `Delete ${cur.name}? Their settings, changes and photos will be erased from this iPad. This cannot be undone.`,
              "Delete");
            if (!sure) return;
            if (await deleteProfile(cur.id)) { await onLearnerChanged(); refresh(); }
          } })),
      list.length <= 1 ? h("p", { class: "muted", text: "The last learner cannot be deleted." }) : null);
  }

  // ---------- Board size (per learner) ----------
  // Switching the grid moves every word, so it is a RELEARNING event for the child.
  // The adult must confirm. The learner's stage is kept.
  function sizeSection() {
    const cur = getCurrent();
    const btn = (n, text) => h("button", {
      type: "button", class: "seg" + (cur.gridSize === n ? " on" : ""), id: `size-${n}`, "data-size": n, text,
      onclick: async () => {
        if (cur.gridSize === n) return;
        const sure = await askConfirm(
          `Switch ${cur.name} to the ${n}-location board? Word locations will change, so ${cur.name} will have to learn where ` +
          `words are again. This is a relearning event: only switch when ${cur.name} is ready. ` +
          `The stage (${cur.stage}) is kept. Photos, renamed labels and show/hide choices for built-in words move with each word. ` +
          `Words and pages you added to empty buttons stay with the ${cur.gridSize}-location board and come back if you switch back.`,
          `Switch to ${n}`);
        if (!sure) return;
        cur.gridSize = n;
        await saveProfile(cur);
        onBoardSizeChanged();
        refresh();
      },
    });
    return h("section", { class: "panel", id: "sec-size" },
      h("h2", { text: "Board size (for this learner)" }),
      h("p", { class: "muted", text: "45 locations (9 x 5) is the starting board. 84 locations (12 x 7) is a larger board with more words. " +
        "The first four rows are the same on both; the bottom row of the 45 board moves down to the bottom row of the 84 board." }),
      h("div", { class: "seg-row size-seg" }, btn(45, "45 locations"), btn(84, "84 locations")),
      // On a phone, nudge toward the smaller board while 84 is selected
      looksLikePhone() && cur.gridSize === 84 ? h("p", { class: "phone-size-tip", id: "size-phone-tip", text: PHONE_BOARD_TIP }) : null);
  }

  // ---------- Vocabulary stage ----------
  function stageSection() {
    const cur = getCurrent();
    const model = buildModel(board, cur.gridSize);
    const wordsFor = (n) => model.main.filter((b) => b.stage === n).map((b) => b.label).join(", ");
    const note = { 1: "Starting words", 2: "Adds", 3: "Adds", 4: "Adds" };
    return h("section", { class: "panel", id: "sec-stage" },
      h("h2", { text: "Vocabulary stage" }),
      h("p", { class: "muted", text: "Each stage reveals more words in their permanent spots. Nothing moves. " +
        "On the category pages the original words always show; the newer words on them appear from stage 3 (or use Always show on a word)." }),
      h("div", { class: "stage-grid" }, [1, 2, 3, 4].map((n) =>
        h("button", {
          type: "button", class: "stage-btn" + (cur.stage === n ? " on" : ""), "data-stage": n,
          onclick: async () => {
            cur.stage = n;
            await saveProfile(cur);
            onVocabChanged();
            refresh();
          },
        },
        h("span", { class: "stage-title", text: "Stage " + n }),
        h("span", { class: "stage-note", text: note[n] + ":" }),
        h("span", { class: "stage-words", text: wordsFor(n) })))),
      wordsButtonSetting(cur),
      wordDialSetting(cur),
      keyboardButtonSetting(cur),
      cameraButtonSetting(cur),
      speakLettersSetting(cur),
      wordsOnlySetting(cur));
  }

  // The top-bar Words button (and the Forms button next to it): Auto shows them from stage 3.
  function wordsButtonSetting(cur) {
    const btn = (value, text) => h("button", {
      type: "button", class: "seg" + (cur.wordsButton === value ? " on" : ""), id: `wordsbtn-${value}`, text,
      onclick: async () => { cur.wordsButton = value; await saveProfile(cur); onVocabChanged(); refresh(); },
    });
    return h("div", { class: "field touch-setting", id: "setting-words-button" },
      h("label", { text: "Show Words button" }),
      h("div", { class: "seg-row" }, btn("auto", "Auto (stage 3 and up)"), btn("always", "Always"), btn("never", "Never")),
      h("p", { class: "muted", text: "The Words button in the top bar opens pages of little words, actions, describing words, time, colors, " +
        "numbers, clothes, outside words and things (every Dolch sight word is on them, at most 3 taps away). " +
        "The Forms button next to it shows other forms of the last word (go: went, going...). " +
        "Both follow this setting. Words on these pages never move." }));
  }

  // Press-and-hold word-forms dial: hold a word to see its other forms around it (went / going / goes / gone).
  // Three settings, saved per learner (profile.wordDial, see js/profiles.js). They are read when a finger goes
  // down, so nothing on the board needs to be redrawn.
  function wordDialSetting(cur) {
    const d = cur.wordDial;
    const persist = () => saveProfile(cur);
    const modeBtn = (value, text) => h("button", {
      type: "button", class: "seg" + (d.mode === value ? " on" : ""), id: `dial-${value}`, text,
      onclick: async () => { d.mode = value; await persist(); refresh(); },
    });
    const holdNum = h("span", { class: "slider-num", id: "dial-hold-val", text: d.holdSec.toFixed(1) + " s" });
    const holdInput = h("input", { type: "range", id: "dial-hold-slider", min: DIAL_HOLD_MIN, max: DIAL_HOLD_MAX, step: 0.1, value: d.holdSec,
      oninput: () => { d.holdSec = parseFloat(holdInput.value); holdNum.textContent = d.holdSec.toFixed(1) + " s"; persist(); } });
    const markBtn = (value, text) => h("button", {
      type: "button", class: "seg" + (d.markers === value ? " on" : ""), id: `dial-markers-${value ? "on" : "off"}`, text,
      onclick: async () => { d.markers = value; await persist(); refresh(); },
    });
    return h("div", { class: "field touch-setting", id: "setting-word-dial" },
      h("label", { text: "Word forms dial (press and hold a word)" }),
      h("div", { class: "seg-row" }, modeBtn("auto", "Auto (stage 3 and up)"), modeBtn("always", "Always"), modeBtn("never", "Never")),
      h("p", { class: "muted", text: "Press and hold a word such as go, eat, big, dog or I: its other forms appear around it, always in the same " +
        "directions (past = up, -ing = right, -s = down, past participle = left). Lift on a form, or lift and then tap one, to say it and add it " +
        "to the message bar. Tap outside to cancel. A quick tap still just says the word, with no delay. Words with no forms act like a normal tap. " +
        "The Forms button works as before." }),
      h("div", { class: "slider-row touch-slider" },
        h("label", { for: "dial-hold-slider", text: "Hold time for dial" }), holdInput, holdNum),
      h("p", { class: "muted", text: "If Hold to select (Touch section) is on, the dial opens 0.8 s after the hold-to-select time instead " +
        "(releasing before that selects the word as usual), and this slider is not used." }),
      h("label", { text: "Show form markers" }),
      h("div", { class: "seg-row touch-seg" }, markBtn(true, "On"), markBtn(false, "Off")),
      h("p", { class: "muted", text: "A small picture on each form (arrow back = past, motion lines = -ing, + = -s, two dots = plural, bars = -er / -est, " +
        "a person = pronouns). Turn off for learners who read. This is separate from Show words only." }));
  }

  // The top-bar ABC button (keyboard overlay): Auto shows it from stage 3, like the Words button.
  function keyboardButtonSetting(cur) {
    const btn = (value, text) => h("button", {
      type: "button", class: "seg" + (cur.keyboardButton === value ? " on" : ""), id: `kbbtn-${value}`, text,
      onclick: async () => { cur.keyboardButton = value; await saveProfile(cur); onVocabChanged(); refresh(); },
    });
    return h("div", { class: "field touch-setting", id: "setting-keyboard-button" },
      h("label", { text: "Show keyboard button (ABC)" }),
      h("div", { class: "seg-row" }, btn("auto", "Auto (stage 3 and up)"), btn("always", "Always"), btn("never", "Never")),
      h("p", { class: "muted", text: "The ABC button in the top bar opens a large keyboard over the board. The child types a word; Space or Done " +
        "turns it into a chip and says it. The keyboard has a 123 key for the number pad (the Numbers page has its own Number pad button). " +
        "The keyboard uses ordinary taps: Hold to select and Ignore repeated taps do not apply to it." }));
  }

  // The top-bar camera button (Beta 3.1): hold 1 second to make a quick scene from a photo. Auto shows it from stage 3, like ABC.
  function cameraButtonSetting(cur) {
    const btn = (value, text) => h("button", {
      type: "button", class: "seg" + (cur.cameraButton === value ? " on" : ""), id: `cambtn-${value}`, text,
      onclick: async () => { cur.cameraButton = value; await saveProfile(cur); onVocabChanged(); refresh(); },
    });
    return h("div", { class: "field touch-setting", id: "setting-camera-button" },
      h("label", { text: "Show camera button" }),
      h("div", { class: "seg-row" }, btn("auto", "Auto (stage 3 and up)"), btn("always", "Always"), btn("never", "Never")),
      h("p", { class: "muted", text: "The camera button in the top bar (next to ABC) makes a scene from a photo in one step: hold it for 1 second until the ring is full, " +
        "then lift your finger. A quick tap does nothing. The camera opens, everything VOICE finds in the photo (and anything it remembers from My things) is ticked, " +
        "and “Use now” puts the scene on the strip. It needs no passcode and is switched off while a teaching session runs. " +
        "Scenes made this way are named with the date and time and can be renamed in Scenes." }));
  }

  // Say each letter's name as it is typed (default off).
  function speakLettersSetting(cur) {
    const btn = (value, text) => h("button", {
      type: "button", class: "seg" + (cur.speakLetters === value ? " on" : ""), id: `speakletters-${value ? "on" : "off"}`, text,
      onclick: async () => { cur.speakLetters = value; await saveProfile(cur); refresh(); },
    });
    return h("div", { class: "field touch-setting", id: "setting-speak-letters" },
      h("label", { text: "Speak each letter while typing" }),
      h("div", { class: "seg-row touch-seg" }, btn(false, "Off"), btn(true, "On")),
      h("p", { class: "muted", text: "On: every key says its letter name (\"bee\", \"oh\"...) as it is tapped." }));
  }

  // Reading stage: take away every picture so the learner reads the words.
  function wordsOnlySetting(cur) {
    const btn = (value, text) => h("button", {
      type: "button", class: "seg" + (!!cur.wordsOnly === value ? " on" : ""), id: `wordsonly-${value ? "on" : "off"}`, text,
      onclick: async () => { cur.wordsOnly = value; await saveProfile(cur); onVocabChanged(); refresh(); },
    });
    return h("div", { class: "field touch-setting", id: "setting-words-only" },
      h("label", { text: "Show words only (no pictures)" }),
      h("div", { class: "seg-row touch-seg" }, btn(false, "Off"), btn(true, "On")),
      h("p", { class: "muted", text: "Reading stage: hides pictures so the learner reads the words." }));
  }

  // ---------- Edit / Model ----------
  // (Edit and Model mode are off while a teaching session is running: model mode and sessions are separate.)
  function actionSection() {
    const busy = teach.sessionActive();
    return h("section", { class: "panel", id: "sec-actions" },
      h("div", { class: "action-row" },
        h("button", { type: "button", class: "btn big", id: "menu-edit", text: "Edit board", disabled: busy,
          onclick: () => { close(); onEdit(); } }),
        h("button", { type: "button", class: "btn big", id: "menu-model", text: "Start modeling", disabled: busy,
          onclick: () => { close(); onModel(); } })),
      busy ? h("p", { class: "muted", text: "Editing and modeling are off while a teaching session is running." }) : null);
  }

  // ---------- Voice ----------
  function voiceSection() {
    const cur = getCurrent();
    const v = cur.voice;
    const persist = () => { setVoiceSettings(v); return saveProfile(cur); };

    // The voice picker lists the voices installed on this device (js/voicepicker.js)
    const picker = createVoicePicker({ voice: v, persist, state: pickerState });
    stopVoiceListener = picker.stop;

    // A slider with its current number shown beside it
    function slider(id, label, min, max, step, key, decimals) {
      const num = h("span", { class: "slider-num", id: id + "-val", text: Number(v[key]).toFixed(decimals) });
      const input = h("input", { type: "range", id, min, max, step, value: v[key],
        oninput: () => {
          v[key] = parseFloat(input.value);
          num.textContent = v[key].toFixed(decimals);
          persist();
        } });
      return h("div", { class: "slider-row" }, h("label", { for: id, text: label }), input, num);
    }

    const resetTo = (preset) => () => {
      v.pitch = preset.pitch;
      v.rate = preset.rate;
      persist();
      refresh();
    };

    return h("section", { class: "panel", id: "sec-voice" },
      h("h2", { text: "Voice (for this learner)" }),
      h("div", { class: "field", id: "voice-field" }, picker.el, moreVoicesHelp()),
      slider("pitch", "Pitch", 0.5, 2, 0.1, "pitch", 1),
      slider("rate", "Speed", 0.5, 1.5, 0.05, "rate", 2),
      h("p", { class: "muted", text: "Speed is for a single word. Anything of two or more words (a phrase button, a phrase you added, " +
        "\"thank you\", a typed number) and the message bar use Sentence speed. Sentences sound faster than the same words said one at a time, " +
        "so Sentence speed is its own, slower setting (0.9 to start)." }),
      slider("sentence-rate", "Sentence speed", 0.5, 1.5, 0.05, "sentenceRate", 2),
      pauseSetting(v, persist),
      h("div", { class: "btn-row left" },
        h("button", { type: "button", class: "btn primary", id: "voice-preview", text: "Preview a word",
          onclick: () => speak(PREVIEW_WORD) }),
        h("button", { type: "button", class: "btn primary", id: "voice-sample", text: "Hear a sample sentence",
          onclick: () => playSample() }),
        h("button", { type: "button", class: "btn", id: "voice-child", text: "Reset to child default",
          onclick: resetTo(CHILD_VOICE) }),
        h("button", { type: "button", class: "btn", id: "voice-adult", text: "Reset to adult default",
          onclick: resetTo(ADULT_VOICE) })),
      // Uses this learner's voice (speak() reads the current learner's settings)
      volumeTestBlock({}));
  }

  // "Pause between words": Off plays the message bar as one sentence; otherwise chip by chip with a gap.
  function pauseSetting(v, persist) {
    const names = { off: "Off", short: "Short 0.25 s", medium: "Medium 0.5 s", long: "Long 0.8 s" };
    return h("div", { class: "field touch-setting", id: "setting-pause" },
      h("label", { text: "Pause between words" }),
      h("div", { class: "seg-row" }, Object.keys(PAUSE_MS).map((k) => h("button", {
        type: "button", class: "seg" + ((v.pause || "off") === k ? " on" : ""), id: `pause-${k}`, text: names[k],
        onclick: () => { v.pause = k; persist(); refresh(); },
      }))),
      h("p", { class: "muted", text: "Off: tapping the message bar says the whole sentence in one go. Short, Medium or Long: each chip is " +
        "said on its own with a pause after it (a chip such as \"thank you\" is said as one piece). Tap the message bar again to stop." }));
  }

  // The sample sentence is played exactly the way the message bar plays it, with the current settings.
  function playSample() {
    const gap = pauseMs();
    if (gap > 0) speakSequence(PREVIEW_TEXT.split(" "), gap);
    else speak(PREVIEW_TEXT, "sentence");
  }

  // ---------- Touch supports ----------
  // Two optional helps for children who tap too lightly, too often, or by accident.
  // They only affect the child's board (words, category buttons, Back) in normal
  // and modeling mode. Saved per learner.
  function touchSection() {
    const cur = getCurrent();
    const t = cur.touch;
    const persist = () => saveProfile(cur);

    // One setting = Off/On buttons + a slider (only usable when On) + an explanation.
    function setting({ id, title, onKey, secKey, min, max, step, decimals, help }) {
      const num = h("span", { class: "slider-num", id: `${id}-val`, text: Number(t[secKey]).toFixed(decimals) + " s" });
      const input = h("input", { type: "range", id: `${id}-slider`, min, max, step, value: t[secKey],
        disabled: !t[onKey],
        oninput: () => {
          t[secKey] = parseFloat(input.value);
          num.textContent = t[secKey].toFixed(decimals) + " s";
          persist();
        } });
      const offBtn = h("button", { type: "button", class: "seg" + (t[onKey] ? "" : " on"), id: `${id}-off`, text: "Off",
        onclick: () => { t[onKey] = false; persist(); refresh(); } });
      const onBtn = h("button", { type: "button", class: "seg" + (t[onKey] ? " on" : ""), id: `${id}-on`, text: "On",
        onclick: () => { t[onKey] = true; persist(); refresh(); } });
      return h("div", { class: "field touch-setting" },
        h("label", { text: title }),
        h("div", { class: "seg-row touch-seg" }, offBtn, onBtn),
        h("div", { class: "slider-row touch-slider" + (t[onKey] ? "" : " off") },
          h("label", { for: `${id}-slider`, text: "Time" }), input, num),
        h("p", { class: "muted", text: help }));
    }

    return h("section", { class: "panel", id: "sec-touch" },
      h("h2", { text: "Touch (for this learner)" }),
      setting({
        id: "touch-hold", title: "Hold to select", onKey: "holdOn", secKey: "holdSec",
        min: 0.1, max: 2, step: 0.1, decimals: 1,
        help: "The child must keep a finger on a button for this long before it speaks. A ring fills while they hold. " +
          "Lifting early or sliding off does nothing. Helps when a child brushes or swipes across buttons by accident.",
      }),
      setting({
        id: "touch-ignore", title: "Ignore repeated taps", onKey: "ignoreOn", secKey: "ignoreSec",
        min: 0.25, max: 3, step: 0.25, decimals: 2,
        help: "After a word is spoken, taps on any board button are ignored for this long (nothing is shown or said). " +
          "Helps when a child taps the same button again and again. Opening a category does not start the wait.",
      }),
      h("p", { class: "muted", text: "These do not affect the message bar, Delete, Clear or the adult screens." }));
  }

  // ---------- Backup and restore ----------
  function backupSection() {
    const cur = getCurrent();
    const status = h("p", { class: "backup-status", id: "backup-status", role: "status", text: backupMessage });
    const run = async (fn) => {
      try { backupMessage = await fn(); }
      catch (e) { backupMessage = "That did not work: " + (e && e.message ? e.message : "unknown problem"); }
      status.textContent = backupMessage;
    };
    const fileIn = h("input", { type: "file", accept: ".json,application/json", id: "restore-file", class: "file-hidden",
      onchange: async () => {
        const f = fileIn.files && fileIn.files[0];
        fileIn.value = "";                     // so choosing the same file again still works
        if (!f) return;
        const msg = await restoreFromFile(f);
        if (msg) { backupMessage = msg; await onLearnerChanged(); refresh(); }
      } });
    // Teaching data (targets, sessions and trials) is on by default; untick it to leave it out of the file.
    const teachBox = h("input", { type: "checkbox", id: "backup-teaching" });
    teachBox.checked = true;
    // Everyday use data (which words were used and when) is on by default too.
    const everydayBox = h("input", { type: "checkbox", id: "backup-everyday" });
    everydayBox.checked = true;
    // Scenes with their photos (Beta 3.0) are on by default too; the photos can make the file large, so it can be left out.
    const scenesBox = h("input", { type: "checkbox", id: "backup-scenes" });
    scenesBox.checked = true;
    const opts = () => ({ teaching: teachBox.checked, everyday: everydayBox.checked, scenes: scenesBox.checked });
    return h("section", { class: "panel", id: "sec-backup" },
      h("h2", { text: "Backup" }),
      h("p", { class: "muted", text:
        "A backup is one file with a learner's board size, stage, button changes, pages you made, voice and speech pacing, keyboard settings, touch settings, Model prompt settings and photos. " +
        "On the iPad, a save sheet opens: choose Save to Files. The passcode is not included. A backup of all learners also keeps the teaching templates you edited." }),
      h("label", { class: "check-line", for: "backup-teaching" }, teachBox,
        h("span", { text: "Include teaching data (targets, sessions and trials)" })),
      h("label", { class: "check-line", for: "backup-everyday" }, everydayBox,
        h("span", { text: "Include everyday use data (words used and when, for progress reports)" })),
      h("label", { class: "check-line", for: "backup-scenes" }, scenesBox,
        h("span", { text: "Include scenes and photos (the photos you took for Scenes; they stay in the file only)" })),
      h("div", { class: "btn-row left" },
        h("button", { type: "button", class: "btn primary", id: "backup-one", text: "Save backup of this learner",
          onclick: () => run(async () => "Saved " + await saveBackup([cur], cur.name, opts()) + ". Keep it somewhere safe.") }),
        h("button", { type: "button", class: "btn", id: "backup-all", text: "Save backup of all learners",
          onclick: () => run(async () => "Saved " + await saveBackup(listProfiles(), "all", { ...opts(), templates: true }) + ". Keep it somewhere safe.") }),
        h("label", { class: "btn", for: "restore-file", id: "restore-btn", text: "Restore from backup" }),
        fileIn),
      status);
  }

  // ---------- About ----------
  function aboutSection() {
    return h("section", { class: "panel", id: "sec-about" },
      h("h2", { text: "About" }),
      h("div", { class: "btn-row left" },
        h("button", { type: "button", class: "btn", id: "about-open", text: "About VOICE", onclick: () => openAbout() })));
  }

  refresh();
  if (startAt) {
    const sec = body.querySelector("#" + startAt);
    if (sec) body.scrollTop = sec.offsetTop - body.offsetTop - 8;
  }
}
