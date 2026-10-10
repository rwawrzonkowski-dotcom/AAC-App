// The adult menu: a large overlay for learners, board size, vocabulary stage, edit mode,
// voice settings, touch supports, backup and model mode. Adult-styled so it looks different from the
// child's board.
import { h, openOverlay, askText, askConfirm } from "./ui.js";
import {
  listProfiles, getCurrent, switchTo, addProfile, renameProfile, deleteProfile,
  saveProfile, CHILD_VOICE, ADULT_VOICE,
} from "./profiles.js";
import { setVoiceSettings, speak, listVoices, onVoicesChanged } from "./speech.js";
import { saveBackup, restoreFromFile } from "./backup.js";
import { buildModel } from "./boardmodel.js";

const PREVIEW_TEXT = "I want more bubbles please";

// callbacks:
//   board            the loaded word map (to list the words in each stage)
//   onLearnerChanged()  a different learner is now current (board must redraw)
//   onVocabChanged()    stage changed (board must redraw)
//   onBoardSizeChanged()  this learner's board size changed (45 <-> 84)
//   onEdit(), onModel() start those modes (the menu closes first)
export function openAdultMenu({ board, onLearnerChanged, onVocabChanged, onBoardSizeChanged, onEdit, onModel }) {
  const body = h("div", { class: "menu-body" });
  let stopVoiceListener = () => {};
  let backupMessage = "";   // result of the last save / restore, shown in the Backup section

  const o = openOverlay([
    h("div", { class: "menu-head" },
      h("h1", { text: "Adult menu" }),
      h("button", { type: "button", class: "btn primary", id: "menu-close-top", text: "Close", onclick: close })),
    body,
  ], { sheetClass: "menu" });

  function close() {
    stopVoiceListener();
    o.close();
  }

  // Rebuild the whole menu, keeping the scroll position.
  function refresh() {
    const top = body.scrollTop;
    stopVoiceListener();
    body.replaceChildren(learnerSection(), sizeSection(), stageSection(), actionSection(), voiceSection(),
      touchSection(), backupSection(),
      h("button", { type: "button", class: "btn wide", id: "menu-close", text: "Close", onclick: close }));
    body.scrollTop = top;
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
            onLearnerChanged();
            refresh();
          },
        }))),
      h("div", { class: "btn-row left" },
        h("button", { type: "button", class: "btn", id: "learner-add", text: "Add learner", onclick: async () => {
          const name = await askText("New learner's name", "", "Add");
          if (!name) return;
          const p = await addProfile(name);
          await switchTo(p.id);
          onLearnerChanged();
          refresh();
        } }),
        h("button", { type: "button", class: "btn", id: "learner-rename", text: "Rename", onclick: async () => {
          const name = await askText("Rename learner", cur.name, "Save");
          if (!name) return;
          await renameProfile(cur.id, name);
          onLearnerChanged();
          refresh();
        } }),
        h("button", { type: "button", class: "btn danger", id: "learner-delete", text: "Delete",
          disabled: list.length <= 1, onclick: async () => {
            const sure = await askConfirm(
              `Delete ${cur.name}? Their settings, changes and photos will be erased from this iPad. This cannot be undone.`,
              "Delete");
            if (!sure) return;
            if (await deleteProfile(cur.id)) { onLearnerChanged(); refresh(); }
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
      h("div", { class: "seg-row size-seg" }, btn(45, "45 locations"), btn(84, "84 locations")));
  }

  // ---------- Vocabulary stage ----------
  function stageSection() {
    const cur = getCurrent();
    const model = buildModel(board, cur.gridSize);
    const wordsFor = (n) => model.main.filter((b) => b.stage === n).map((b) => b.label).join(", ");
    const note = { 1: "Starting words", 2: "Adds", 3: "Adds", 4: "Adds" };
    return h("section", { class: "panel", id: "sec-stage" },
      h("h2", { text: "Vocabulary stage" }),
      h("p", { class: "muted", text: "Each stage reveals more words in their permanent spots. Nothing moves." }),
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
        h("span", { class: "stage-words", text: wordsFor(n) })))));
  }

  // ---------- Edit / Model ----------
  function actionSection() {
    return h("section", { class: "panel", id: "sec-actions" },
      h("div", { class: "action-row" },
        h("button", { type: "button", class: "btn big", id: "menu-edit", text: "Edit board",
          onclick: () => { close(); onEdit(); } }),
        h("button", { type: "button", class: "btn big", id: "menu-model", text: "Start modeling",
          onclick: () => { close(); onModel(); } })));
  }

  // ---------- Voice ----------
  function voiceSection() {
    const cur = getCurrent();
    const v = cur.voice;
    const persist = () => { setVoiceSettings(v); return saveProfile(cur); };

    const select = h("select", { id: "voice-select", class: "text-input",
      onchange: () => { v.voiceURI = select.value; persist(); } });
    function fillVoices() {
      const voices = listVoices();
      select.replaceChildren(
        h("option", { value: "", text: "Automatic (best English voice)" }),
        voices.map((x) => h("option", { value: x.voiceURI, text: `${x.name} (${x.lang})` })));
      select.value = voices.some((x) => x.voiceURI === v.voiceURI) ? v.voiceURI : "";
    }
    fillVoices();
    stopVoiceListener = onVoicesChanged(fillVoices);

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
      h("div", { class: "field" }, h("label", { for: "voice-select", text: "Voice" }), select),
      slider("pitch", "Pitch", 0.5, 2, 0.1, "pitch", 1),
      slider("rate", "Speed", 0.5, 1.5, 0.05, "rate", 2),
      h("div", { class: "btn-row left" },
        h("button", { type: "button", class: "btn primary", id: "voice-preview", text: "Preview",
          onclick: () => speak(PREVIEW_TEXT) }),
        h("button", { type: "button", class: "btn", id: "voice-child", text: "Reset to child default",
          onclick: resetTo(CHILD_VOICE) }),
        h("button", { type: "button", class: "btn", id: "voice-adult", text: "Reset to adult default",
          onclick: resetTo(ADULT_VOICE) })));
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
        if (msg) { backupMessage = msg; onLearnerChanged(); refresh(); }
      } });
    return h("section", { class: "panel", id: "sec-backup" },
      h("h2", { text: "Backup" }),
      h("p", { class: "muted", text:
        "A backup is one file with a learner's board size, stage, button changes, pages you made, voice, touch settings and photos. " +
        "On the iPad, a save sheet opens: choose Save to Files. The passcode is not included." }),
      h("div", { class: "btn-row left" },
        h("button", { type: "button", class: "btn primary", id: "backup-one", text: "Save backup of this learner",
          onclick: () => run(async () => "Saved " + await saveBackup([cur], cur.name) + ". Keep it somewhere safe.") }),
        h("button", { type: "button", class: "btn", id: "backup-all", text: "Save backup of all learners",
          onclick: () => run(async () => "Saved " + await saveBackup(listProfiles(), "all") + ". Keep it somewhere safe.") }),
        h("label", { class: "btn", for: "restore-file", id: "restore-btn", text: "Restore from backup" }),
        fileIn),
      status);
  }

  refresh();
}
