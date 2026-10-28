// The teaching instructions as an adult reads them (Phase 2, Round A.1, beta): the card that opens over the board during a
// session (hold "Instructions" in the strip), and the pieces the target settings screen shares with it. The wording itself,
// its tokens and the templates are in js/templates.js.
//
// Instructions are shown only when an adult opens them. Nothing here appears by itself, and the card never starts a trial.
import { h, openOverlay } from "./ui.js";
import { load, save } from "./storage.js";
import * as T from "./teaching.js";
import * as tpl from "./templates.js";

// Clinical or Parent wording: one choice for the whole device, remembered ("teachVoice").
export const getVoice = () => { const v = load("teachVoice", "clinical"); return T.VOICES.includes(v) ? v : "clinical"; };
export const setVoice = (v) => { if (T.VOICES.includes(v)) save("teachVoice", v); };

// A Clinical / Parent switch. `onPick(voice)` is called after the choice is remembered.
export function voiceSwitch(idPrefix, onPick) {
  const row = h("div", { class: "seg-row instr-switch", id: idPrefix + "-voice" });
  const paint = () => row.querySelectorAll(".seg").forEach((b) => b.classList.toggle("on", b.dataset.value === getVoice()));
  for (const v of T.VOICES) {
    row.append(h("button", { type: "button", class: "seg", id: `${idPrefix}-voice-${v}`, "data-value": v, text: T.VOICE_LABELS[v],
      onclick: () => { setVoice(v); paint(); onPick(v); } }));
  }
  paint();
  return row;
}

// The card over the board: the current target's word, its template, the six fields, the Clinical / Parent switch and Close.
// `target` is the target on screen; `learnerName` fills {name}. Returns { close }.
export function openInstructionsCard(target, learnerName, { onClose = () => {} } = {}) {
  const fieldsBox = h("div", { class: "instr-fields", id: "ic-fields" });
  const paint = () => {
    const voice = getVoice();
    fieldsBox.replaceChildren(...tpl.fieldList().map((f) =>
      h("div", { class: "instr-field", "data-field": f.id },
        h("div", { class: "instr-label", text: f.label }),
        h("p", { class: "instr-text", text: tpl.instructionText(target, voice, f.id, learnerName) }))));
  };
  const o = openOverlay([
    h("div", { class: "instr-head" },
      h("h2", { id: "ic-word", text: target.label }),
      h("span", { class: "pill instr-tpl", id: "ic-template", text: tpl.templateNameOf(target) })),
    voiceSwitch("ic", paint),
    fieldsBox,
    h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn primary", id: "ic-close", text: "Close", onclick: close })),
  ], { sheetClass: "editor tall instr-card" });
  function close() { o.close(); onClose(); }
  paint();
  return { close };
}
