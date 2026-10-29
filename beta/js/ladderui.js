// The adult screens for prompt ladders (Beta 2.3): the "Prompt ladder" part of a target's settings (Default | Custom, the fading step
// size, the starting step) and the custom ladder editor (add, remove, reorder, preview). The rules for ladders are in js/teaching.js;
// what a step looks like on the board is in js/modelprompt.js (sustainStep).
import { h, openOverlay } from "./ui.js";
import * as T from "./teaching.js";

// ---------- Preview a step on a board button ----------
// app.js supplies the function that shows a step on a board button for a few seconds, without speech and without touching the message
// bar (like "Preview on board" in the Model prompt section). While it runs, every adult screen is hidden (body class "peeking").
let previewHook = null;
export function setPreviewHook(fn) { previewHook = fn; }
let previewBusy = false;
async function previewStep(step) {
  if (!previewHook || previewBusy) return;
  previewBusy = true;
  document.body.classList.add("peeking");
  try { await previewHook({ type: step.type, opacity: step.opacity }); }
  finally { document.body.classList.remove("peeking"); previewBusy = false; }
}

// ---------- Changing a target's ladder ----------
// Applies { mode?, stepSize?, custom? } to the target: the target keeps its place by opacity (T.remapPos), its streaks start again and
// the move is written into its history. The caller saves the target.
export function changeLadder(t, next) {
  const oldLadder = T.ladderOf(t), oldPos = t.pos, oldName = T.posName(t);
  if (next.mode) t.ladderMode = next.mode;
  if (next.stepSize) t.stepSize = next.stepSize;
  if (next.custom) t.customLadder = next.custom.map((s) => ({ type: s.type, opacity: s.opacity }));
  t.pos = T.remapPos(oldLadder, oldPos, T.ladderOf(t));
  t.streakHits = 0; t.streakMisses = 0;
  const newName = T.posName(t);
  if (newName !== oldName) t.history.push({ time: Date.now(), from: oldName, to: newName, reason: "ladder changed by adult", dir: "" });
}

// ---------- In a target's settings ----------
// save(): saves the target (teachui.js has it). Every change of the ladder or the starting step is written into the target's history.
export function ladderSection(t, { save }) {
  const box = h("div", { class: "field", id: "ts-ladder" });
  function paint() {
    const custom = T.isCustom(t);
    const summary = h("p", { class: "lad-summary", id: "ts-ladder-summary", text: T.ladderSummary(t) });
    const startSel = h("select", { id: "ts-start", class: "text-input", "aria-label": "Starting step", onchange: () => {
      const to = Number(startSel.value);
      if (to !== t.pos) {
        t.history.push({ time: Date.now(), from: T.posName(t), to: T.posName(t, to), reason: "changed by adult", dir: to > t.pos ? "less" : "more" });
        t.pos = to; t.streakHits = 0; t.streakMisses = 0; save(); paint();
      }
    } });
    const ladder = T.ladderOf(t);
    ladder.forEach((s, i) => startSel.append(h("option", { value: i, text: `${i + 1}. ${T.stepName(s, custom)}` })));
    startSel.append(h("option", { value: ladder.length, text: T.INDEPENDENT_NAME }));
    startSel.value = String(t.pos);

    box.replaceChildren(
      h("label", { text: "Prompt ladder" }),
      h("div", { class: "seg-row seg-wrap" },
        h("button", { type: "button", class: "seg" + (custom ? "" : " on"), id: "ts-ladder-default", "data-value": "default", text: "Default",
          onclick: () => { if (custom) { changeLadder(t, { mode: "default" }); save(); paint(); } } }),
        h("button", { type: "button", class: "seg" + (custom ? " on" : ""), id: "ts-ladder-custom", "data-value": "custom", text: "Custom",
          onclick: () => openLadderEditor(t, { save, onSaved: paint }) })),
      h("p", { class: "muted", text: custom
        ? "A custom ladder: you choose each step's prompt and strength, most help first. After the last step comes Independent."
        : "Default: the Model prompt fades step by step (100%, then weaker), then Independent. Glow and path highlight are only available in a custom ladder." }),
      custom ? null : h("div", { class: "field lad-sub" }, h("label", { text: "Fading step size" }),
        h("div", { class: "seg-row seg-wrap" }, T.STEP_SIZE_IDS.map((id) =>
          h("button", { type: "button", class: "seg" + (t.stepSize === id ? " on" : ""), id: "ts-size-" + id, "data-value": id, text: T.STEP_SIZE_LABELS[id],
            onclick: () => { if (t.stepSize !== id) { changeLadder(t, { stepSize: id }); save(); paint(); } } })))),
      h("div", { class: "lad-sumrow" }, summary,
        custom ? h("button", { type: "button", class: "btn", id: "ts-ladder-edit", text: "Edit ladder", onclick: () => openLadderEditor(t, { save, onSaved: paint }) }) : null),
      h("div", { class: "field lad-sub" }, h("label", { for: "ts-start", text: "Starting step (most-to-least; the app moves it by itself)" }), startSel),
      h("p", { class: "muted", text: "Changing the ladder keeps this target at the nearest step by strength; it does not jump back to the top." }));
  }
  paint();
  return box;
}

// ---------- The custom ladder editor ----------
export function openLadderEditor(t, { save, onSaved }) {
  const start = T.isCustom(t) ? T.ladderOf(t) : T.cleanLadder(t.customLadder) || T.defaultLadder(t.stepSize);
  let steps = start.map((s) => ({ ...s }));
  const list = h("div", { class: "lad-list", id: "lad-list" });
  const error = h("p", { class: "form-error", id: "lad-error", role: "alert" });
  const saveBtn = h("button", { type: "button", class: "btn primary", id: "lad-save", text: "Save ladder" });

  function paint() {
    saveBtn.disabled = steps.length < 1;
    error.textContent = steps.length < 1 ? "A ladder needs at least one step." : "";
    list.replaceChildren(...steps.map((s, i) => {
      const num = h("span", { class: "slider-num lad-val", id: "lad-val-" + i, text: s.opacity + "%" });
      const slider = h("input", { type: "range", id: "lad-op-" + i, min: 1, max: 100, step: 1, value: s.opacity, "aria-label": `Step ${i + 1} strength`,
        oninput: () => { s.opacity = Number(slider.value); num.textContent = s.opacity + "%"; } });
      const type = h("select", { id: "lad-type-" + i, class: "text-input lad-type", "aria-label": `Step ${i + 1} prompt`,
        onchange: () => { s.type = type.value; } }, T.STEP_TYPES.map((k) => h("option", { value: k, text: T.STEP_TYPE_NAMES[k] })));
      type.value = s.type;
      const move = (d) => { const j = i + d; [steps[i], steps[j]] = [steps[j], steps[i]]; paint(); };
      return h("div", { class: "lad-row", "data-i": i },
        h("span", { class: "lad-num", text: String(i + 1) }),
        h("div", { class: "lad-main" }, type, h("div", { class: "lad-slider" }, slider, num)),
        h("div", { class: "lad-btns" },
          h("button", { type: "button", class: "btn lad-up", id: "lad-up-" + i, "aria-label": "Move up (more help)", text: "↑", disabled: i === 0, onclick: () => move(-1) }),
          h("button", { type: "button", class: "btn lad-down", id: "lad-down-" + i, "aria-label": "Move down (less help)", text: "↓", disabled: i === steps.length - 1, onclick: () => move(1) }),
          h("button", { type: "button", class: "btn lad-prev", id: "lad-prev-" + i, text: "Preview", onclick: () => previewStep(s) }),
          h("button", { type: "button", class: "btn danger lad-rm", id: "lad-rm-" + i, "aria-label": "Remove step", text: "Remove", disabled: steps.length <= 1,
            onclick: () => { steps.splice(i, 1); paint(); } })));
    }), h("div", { class: "lad-row lad-indep" }, h("span", { class: "lad-num", text: "·" }),
      h("span", { class: "lad-indep-name", text: T.INDEPENDENT_NAME + " (no prompt)" })));
  }

  const o = openOverlay([
    h("h2", { text: "Custom ladder: " + t.label }),
    h("p", { class: "muted", text: "Steps go from the MOST help (top) to the least. After the last step comes Independent. " +
      "The time delay is the wait before the next, stronger step appears. Model uses this learner's Model prompt (critter and/or ring); " +
      "Glow and Path highlight are only offered here." }),
    list, error,
    h("div", { class: "btn-row left" },
      h("button", { type: "button", class: "btn", id: "lad-add", text: "Add step", onclick: () => {
        if (steps.length >= T.MAX_STEPS) return;
        const last = steps[steps.length - 1];
        steps.push({ type: last ? last.type : "model", opacity: last ? Math.max(1, last.opacity - 25) : 100 });
        paint();
      } }),
      h("button", { type: "button", class: "btn", id: "lad-default", text: "Start from default ladder", onclick: () => { steps = T.defaultLadder(t.stepSize); paint(); } })),
    h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn", id: "lad-cancel", text: "Cancel", onclick: () => o.close() }), saveBtn),
  ], { sheetClass: "editor tall" });
  saveBtn.addEventListener("click", async () => {
    const clean = T.cleanLadder(steps);
    if (!clean) { error.textContent = "A ladder needs at least one step."; return; }
    changeLadder(t, { mode: "custom", custom: clean });
    await save();
    o.close();
    onSaved();
  });
  paint();
}
