// The adult screens for teaching instructions (Phase 2, Round A.1, beta):
//   - instructionsSection(target): the "Teaching instructions" part of a target's settings (template picker, the six fields with a
//     Clinical / Parent switch, "Reset field to template", "Copy instructions to other targets...", "Copy to another learner...")
//   - openTemplatesList(): adult menu > Teaching > Teaching templates (edit the wording of the 10 templates for this device)
// The wording, tokens and storage are in js/templates.js; the card shown during a session is in js/instrcard.js.
import { h, openOverlay } from "./ui.js";
import { getCurrent, listProfiles } from "./profiles.js";
import * as T from "./teaching.js";
import * as tpl from "./templates.js";
import * as data from "./teachdata.js";
import { getVoice, voiceSwitch } from "./instrcard.js";

// Make a textarea as tall as its text (it is inside a scrolling sheet, so the sheet scrolls instead of the box).
function autosize(ta) { ta.style.height = "auto"; ta.style.height = Math.max(ta.scrollHeight + 2, 56) + "px"; }
const autosizeAll = (root) => root.querySelectorAll("textarea").forEach(autosize);

// A choice among a few labelled buttons. Resolves to the id of the button tapped, or null for Cancel.
function askChoice(title, text, buttons) {
  return new Promise((resolve) => {
    const done = (v) => { o.close(); resolve(v); };
    const o = openOverlay([
      h("h2", { text: title }),
      h("p", { class: "confirm-text", text }),
      h("div", { class: "btn-row" },
        h("button", { type: "button", class: "btn", id: "choice-cancel", text: "Cancel", onclick: () => done(null) }),
        buttons.map((b) => h("button", { type: "button", class: "btn " + (b.primary ? "primary" : ""), id: "choice-" + b.id, text: b.label, onclick: () => done(b.id) }))),
    ], { sheetClass: "small" });
  });
}

// ---------- Inside a target's settings ----------
export function instructionsSection(t) {
  const learner = getCurrent();
  const status = h("p", { class: "muted instr-status", id: "ti-status", role: "status" });
  const tplName = h("span", { class: "pill instr-tpl", id: "ti-template", text: tpl.templateNameOf(t) });
  const fieldsBox = h("div", { class: "instr-fields", id: "ti-fields" });

  function paintFields() {
    const voice = getVoice();
    tplName.textContent = tpl.templateNameOf(t);
    fieldsBox.replaceChildren(...tpl.fieldList().map((f) => {
      const ta = h("textarea", { class: "text-input instr-edit", id: "ti-f-" + f.id, rows: 1, "aria-label": f.label });
      ta.value = tpl.instructionText(t, voice, f.id, learner.name);
      const reset = h("button", { type: "button", class: "btn instr-reset", id: "ti-reset-" + f.id, text: "Reset field to template",
        onclick: async () => { tpl.resetOverride(t, voice, f.id); await data.saveTarget(t); paintFields(); } });
      const edited = h("span", { class: "instr-edited", text: "Edited" });
      const refresh = () => { const on = tpl.overrideOf(t, voice, f.id) !== null; reset.hidden = !on; edited.hidden = !on; };
      ta.addEventListener("input", () => {
        autosize(ta);
        tpl.setOverride(t, voice, f.id, ta.value, learner.name);
        data.saveTarget(t);
        refresh();
      });
      refresh();
      return h("div", { class: "instr-field", "data-field": f.id },
        h("div", { class: "instr-label" }, h("label", { for: ta.id, text: f.label }), edited), ta, reset);
    }));
    requestAnimationFrame(() => autosizeAll(fieldsBox));
  }

  async function pickTemplate() {
    const chosen = await openTemplatePicker(t);
    if (chosen) { await data.saveTarget(t); paintFields(); status.textContent = `Template changed to ${tpl.templateNameOf(t)}.`; }
  }

  const sec = h("div", { class: "field", id: "ts-instructions" },
    h("h3", { text: "Teaching instructions" }),
    h("p", { class: "muted", text: "Shown only when an adult holds Instructions during a session. The word and the learner's name are filled in. " +
      "Change any box to write this target's own wording." }),
    h("div", { class: "instr-tplrow" },
      h("span", { class: "muted", text: "Template:" }), tplName,
      h("button", { type: "button", class: "btn", id: "ti-template-btn", text: "Change template", onclick: pickTemplate })),
    voiceSwitch("ti", paintFields),
    fieldsBox,
    h("div", { class: "btn-row left" },
      h("button", { type: "button", class: "btn", id: "ti-copy-targets", text: "Copy instructions to other targets…", onclick: async () => {
        const n = await openCopyToTargets(t);
        if (n !== null) status.textContent = n === 1 ? "Copied to 1 target." : `Copied to ${n} targets.`;
      } }),
      h("button", { type: "button", class: "btn", id: "ti-copy-learner", text: "Copy to another learner…", onclick: async () => {
        const r = await openCopyToLearner(t);
        if (r) status.textContent = r;
      } })),
    status);
  paintFields();
  return sec;
}

// The list of templates; changing the template of a target that has its own wording asks whether to keep that wording.
// Resolves to true if the template was changed (the target object is updated, the caller saves it).
function openTemplatePicker(t) {
  return new Promise((resolve) => {
    const finish = (v) => { o.close(); resolve(v); };
    const cur = tpl.templateIdOf(t);
    const list = tpl.templateList().map((x) =>
      h("button", { type: "button", class: "seg pick-item tpl-item" + (x.id === cur ? " on" : ""), id: "tp-" + x.id, "data-template": x.id,
        onclick: async () => {
          if (x.id === cur) return finish(false);
          let keep = true;
          if (tpl.hasOverrides(t)) {
            const n = tpl.overrideCount(t);
            const c = await askChoice("Change to " + x.name + "?",
              `This target has ${n} ${n === 1 ? "box" : "boxes"} with your own wording. Keep your wording with the new template, or start over with the new template's wording?`,
              [{ id: "reset", label: "Use the new template's wording" }, { id: "keep", label: "Keep my wording", primary: true }]);
            if (c === null) return;
            keep = c === "keep";
          }
          if (!keep) tpl.clearOverrides(t);
          t.instructions.templateId = x.id;
          finish(true);
        } },
        h("span", { class: "tpl-name", text: x.name }),
        x.id === cur ? h("span", { class: "tpl-cur", text: "current" }) : null));
    const o = openOverlay([
      h("h2", { text: "Choose a template" }),
      h("p", { class: "muted", text: "A template is the starting wording for a kind of word. You can still change any box afterwards." }),
      h("div", { class: "pick-list", id: "tp-list" }, list),
      h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn", id: "tp-cancel", text: "Cancel", onclick: () => finish(false) })),
    ], { sheetClass: "editor tall" });
  });
}

// Copy this target's template and wording onto other targets of this learner. Resolves to how many, or null if cancelled.
function openCopyToTargets(t) {
  return new Promise((resolve) => {
    const others = data.getTargets().filter((x) => x.wordId !== t.wordId);
    const finish = (v) => { o.close(); resolve(v); };
    const boxes = new Map();
    const go = h("button", { type: "button", class: "btn primary", id: "ct-go", text: "Copy", disabled: true });
    const refresh = () => { go.disabled = ![...boxes.values()].some((b) => b.checked); };
    const rows = others.map((x, i) => {
      const box = h("input", { type: "checkbox", id: "ct-" + i, "data-word": x.wordId, onchange: refresh });
      boxes.set(x.wordId, box);
      return h("label", { class: "ss-target", for: box.id }, box, h("span", { class: "ss-name", text: x.label }),
        h("span", { class: "muted", text: tpl.templateNameOf(x) }));
    });
    go.addEventListener("click", async () => {
      const ids = others.filter((x) => boxes.get(x.wordId).checked).map((x) => x.wordId);
      const n = await data.copyInstructionsToTargets(t, ids);
      finish(n);
    });
    const o = openOverlay([
      h("h2", { text: "Copy instructions" }),
      h("p", { class: "muted", text: `Copies the template (${tpl.templateNameOf(t)}) and any wording you changed for "${t.label}". ` +
        "It replaces the other targets' instructions. Their teaching settings and history are not changed." }),
      others.length ? h("div", { class: "ss-list", id: "ct-list" }, rows) : h("p", { class: "muted", id: "ct-none", text: "There are no other targets yet." }),
      h("div", { class: "btn-row" },
        others.length ? h("button", { type: "button", class: "btn", id: "ct-all", text: "Select all", onclick: () => { boxes.forEach((b) => (b.checked = true)); refresh(); } }) : null,
        h("button", { type: "button", class: "btn", id: "ct-cancel", text: "Cancel", onclick: () => finish(null) }), go),
    ], { sheetClass: "editor tall" });
  });
}

// Copy this target's instructions to another learner on this device. Resolves to a sentence for the status line, or "".
function openCopyToLearner(t) {
  return new Promise((resolve) => {
    const cur = getCurrent();
    const others = listProfiles().filter((p) => p.id !== cur.id);
    const finish = (v) => { o.close(); resolve(v); };
    let pick = null;
    const go = h("button", { type: "button", class: "btn primary", id: "cl-go", text: "Copy", disabled: true });
    const row = h("div", { class: "seg-row seg-wrap", id: "cl-list" }, others.map((p) =>
      h("button", { type: "button", class: "seg", id: "cl-" + p.id, "data-learner": p.id, text: p.name,
        onclick: (e) => { pick = p; row.querySelectorAll(".seg").forEach((b) => b.classList.toggle("on", b === e.currentTarget)); go.disabled = false; } })));
    go.addEventListener("click", async () => {
      const how = await data.copyTargetToLearner(t, pick);
      finish(how === "added" ? `Added "${t.label}" as a target for ${pick.name} with these instructions.` : `Updated the instructions of "${t.label}" for ${pick.name}.`);
    });
    const o = openOverlay([
      h("h2", { text: "Copy to another learner" }),
      h("p", { class: "muted", text: `Adds "${t.label}" as a target for the learner you choose, or updates its instructions if it is already a target there. ` +
        "Only the instructions are copied: not the teaching history, sessions or settings." }),
      others.length ? row : h("p", { class: "muted", id: "cl-none", text: "There are no other learners on this device." }),
      h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn", id: "cl-cancel", text: "Cancel", onclick: () => finish("") }), go),
    ], { sheetClass: "editor" });
  });
}

// ---------- Adult menu > Teaching > Teaching templates ----------
export function openTemplatesList() {
  const list = h("div", { class: "pick-list", id: "tt-list" });
  const paint = () => list.replaceChildren(...tpl.templateList().map((x) =>
    h("button", { type: "button", class: "seg pick-item tpl-item", id: "tt-" + x.id, "data-template": x.id,
      onclick: () => openTemplateEditor(x.id, paint) },
      h("span", { class: "tpl-name", text: x.name }),
      tpl.isTemplateEdited(x.id) ? h("span", { class: "tpl-cur", text: "edited" }) : null)));
  const o = openOverlay([
    h("h2", { text: "Teaching templates" }),
    h("p", { class: "muted", text: "The starting wording for each kind of word, in a Clinical and a Parent version. Changes are kept on this device and apply " +
      "to every learner's targets, except boxes a target has changed for itself." }),
    list,
    h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn primary", id: "tt-close", text: "Close", onclick: () => o.close() })),
  ], { sheetClass: "editor tall" });
  paint();
}

function openTemplateEditor(id, onDone) {
  const tmpl = tpl.getTemplate(id);
  const fieldsBox = h("div", { class: "instr-fields", id: "te-fields" });
  const restore = h("button", { type: "button", class: "btn danger", id: "te-restore", text: "Restore original wording" });
  const paint = () => {
    const voice = getVoice();
    restore.disabled = !tpl.isTemplateEdited(id);
    fieldsBox.replaceChildren(...tpl.fieldList().map((f) => {
      const ta = h("textarea", { class: "text-input instr-edit", id: "te-f-" + f.id, rows: 1, "aria-label": f.label });
      ta.value = tpl.templateRaw(id, voice, f.id);
      const reset = h("button", { type: "button", class: "btn instr-reset", id: "te-reset-" + f.id, text: "Reset field to original",
        onclick: () => { tpl.resetTemplateField(id, voice, f.id); paint(); } });
      const edited = h("span", { class: "instr-edited", text: "Edited" });
      const refresh = () => { const on = tpl.isTemplateFieldEdited(id, voice, f.id); reset.hidden = !on; edited.hidden = !on; restore.disabled = !tpl.isTemplateEdited(id); };
      ta.addEventListener("input", () => { autosize(ta); tpl.setTemplateField(id, voice, f.id, ta.value); refresh(); });
      refresh();
      return h("div", { class: "instr-field", "data-field": f.id },
        h("div", { class: "instr-label" }, h("label", { for: ta.id, text: f.label }), edited), ta, reset);
    }));
    requestAnimationFrame(() => autosizeAll(fieldsBox));
  };
  restore.addEventListener("click", async () => {
    const c = await askChoice("Restore original wording?", `The Clinical and Parent wording of "${tmpl.name}" goes back to the original on this device. Targets that changed a box for themselves keep their own wording.`,
      [{ id: "yes", label: "Restore", primary: true }]);
    if (c === "yes") { tpl.restoreTemplate(id); paint(); }
  });
  const o = openOverlay([
    h("h2", { id: "te-title", text: tmpl.name }),
    h("p", { class: "muted", text: "{word} becomes the target word and {name} the learner's name. Keep them in the text so it works for every word and learner." }),
    voiceSwitch("te", paint),
    fieldsBox,
    h("div", { class: "btn-row" }, restore, h("button", { type: "button", class: "btn primary", id: "te-done", text: "Done", onclick: () => { o.close(); onDone(); } })),
  ], { sheetClass: "editor tall" });
  paint();
}
