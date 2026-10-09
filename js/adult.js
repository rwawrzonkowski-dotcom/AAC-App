// The adult menu: a large overlay for learners, vocabulary stage, edit mode,
// voice settings and model mode. Adult-styled so it looks different from the
// child's board.
import { h, openOverlay, askText, askConfirm } from "./ui.js";
import {
  listProfiles, getCurrent, switchTo, addProfile, renameProfile, deleteProfile,
  saveProfile, CHILD_VOICE, ADULT_VOICE,
} from "./profiles.js";
import { setVoiceSettings, speak, listVoices, onVoicesChanged } from "./speech.js";

const PREVIEW_TEXT = "I want more bubbles please";

// callbacks:
//   board            the loaded word map (to list the words in each stage)
//   onLearnerChanged()  a different learner is now current (board must redraw)
//   onVocabChanged()    stage changed (board must redraw)
//   onEdit(), onModel() start those modes (the menu closes first)
export function openAdultMenu({ board, onLearnerChanged, onVocabChanged, onEdit, onModel }) {
  const body = h("div", { class: "menu-body" });
  let stopVoiceListener = () => {};

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
    body.replaceChildren(learnerSection(), stageSection(), actionSection(), voiceSection(),
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

  // ---------- Vocabulary stage ----------
  function stageSection() {
    const cur = getCurrent();
    const wordsFor = (n) => board.buttons.filter((b) => b.stage === n).map((b) => b.label).join(", ");
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

  refresh();
}
