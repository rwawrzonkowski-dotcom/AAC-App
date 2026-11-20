// FCT mode: functional communication training (Beta 3.48, Richard approved Nov 19).
//
// A clinician turns it on for a learner (Adult menu > Teaching > FCT mode, Clinician view) and picks the learner's REPLACEMENT
// REQUEST: a board word such as "break", "help" or "all done". Then, during everyday use:
//   - the request button keeps its spot (motor planning) and can wear a highlight ring, on every copy of the word;
//   - when the LEARNER chooses it, V.O.I.C.E. starts a visible "wait" countdown in the context strip (the board stays usable);
//     the wait comes from a list of steps (default 0, 5, 10, 20, 30, 60 s);
//   - at the end of the wait the strip turns green: "Time for break! Give it now." The ADULT delivers the break or item;
//   - a wait with no problem behavior is a "calm wait": after 3 calm waits in a row the next wait is one step longer;
//     after 2 waits in a row with problem behavior it goes back one step (both numbers are clinician settings);
//   - adults tally problem behavior with a 1-second hold in the strip (any time while FCT mode is on). A tally during a wait
//     restarts the countdown, so the wait never ends right after problem behavior;
//   - asking again during a wait is recorded but changes nothing (the countdown keeps going).
// Everything is recorded as everyday events with how "fct" (not counted as words): request, repeat request, wait done (calm or not),
// behavior, stopped. Nothing runs during a teaching session, Model mode, Edit mode or Add targets.
import { h } from "./ui.js";
import { attachHold } from "./hold.js";

import { DEFAULT_STEPS, cleanFct } from "./fctdata.js";
export { DEFAULT_STEPS, cleanFct };
const HOLD_MS = 1000;
const DELIVER_MS = 8000;           // how long the green "give it now" stays up

export const fmtSec = (s) => (s >= 60 && s % 60 === 0 ? (s / 60) + " min" : s + " s");

// hooks: { appEl, stripEl, getProfile(), saveProfile(p), record(label, extra), canRun() }
let H = null;
let run = null;          // { phase: "wait" | "give", started, ms, hadBehavior, timer }
export function init(hooks) {
  H = hooks;
  const bar = h("div", { id: "fct-bar", hidden: true });
  H.stripEl.appendChild(bar);
  return api;
}

const settings = () => { const p = H.getProfile(); return p && p.fct && p.fct.on && p.fct.wordId ? p.fct : null; };
const word = (f) => f.label || "break";

function save(mutate) {
  const p = H.getProfile();
  if (!p || !p.fct) return;
  mutate(p.fct);
  try { H.saveProfile(p); } catch (e) { /* never break the board */ }
}

// The learner chose a word. Returns true when it was the FCT request (the caller has already spoken it and added it to the bar).
function onWord(id, mode) {
  const f = settings();
  if (!f || id !== f.wordId || mode !== "learner" || !H.canRun()) return false;
  if (run && run.phase === "wait") { H.record("fct repeat request", { wait: run.ms / 1000 }); return true; }
  const wait = f.steps[f.step] || 0;
  H.record("fct request", { wait, step: f.step });
  if (wait <= 0) finishWait(f, true, 0);
  else startWait(wait);
  return true;
}

function startWait(sec) {
  stopTimers();
  run = { phase: "wait", started: performance.now(), ms: sec * 1000, hadBehavior: false, timer: null };
  run.timer = setInterval(tick, 200);
  paint();
}

function tick() {
  if (!run || run.phase !== "wait") return;
  const left = run.ms - (performance.now() - run.started);
  if (left <= 0) { const f = settings(); if (f) finishWait(f, !run.hadBehavior, run.ms / 1000); else stop(false); return; }
  paintClock(left);
}

// The wait is over (or there was none): record it, move the step, show "give it now".
function finishWait(f, calm, waited) {
  stopTimers();
  let moved = 0;
  save((x) => {
    if (calm) { x.calm++; x.rough = 0; if (x.calm >= x.upAfter && x.step < x.steps.length - 1) { x.step++; x.calm = 0; moved = 1; } }
    else { x.rough++; x.calm = 0; if (x.rough >= x.downAfter && x.step > 0) { x.step--; x.rough = 0; moved = -1; } }
  });
  H.record(calm ? "fct calm wait" : "fct wait with behavior", { wait: waited, calm });
  const g = settings() || f;
  run = { phase: "give", moved, next: g.steps[g.step] || 0, timer: setTimeout(() => stop(false), DELIVER_MS) };
  paint();
}

function behavior() {
  const f = settings();
  if (!f) return;
  H.record("fct behavior", { during: run && run.phase === "wait" ? "wait" : "other" });
  if (run && run.phase === "wait") { run.hadBehavior = true; run.started = performance.now(); paint(); }   // restart the countdown
  flash(`Recorded: ${f.behavior}`);
}

function stop(recordIt = true) {
  if (recordIt && run && run.phase === "wait") H.record("fct stopped", {});
  stopTimers();
  run = null;
  paint();
}
function stopTimers() { if (run) { clearInterval(run.timer); clearTimeout(run.timer); } }

let flashTimer = null;
function flash(text) {
  const el = document.getElementById("fct-note");
  if (!el) return;
  el.textContent = text; el.hidden = false;
  clearTimeout(flashTimer); flashTimer = setTimeout(() => { el.hidden = true; }, 1800);
}

function holdBtn(id, cls, label, onDone) {
  const b = h("button", { type: "button", class: "fct-btn " + cls, id }, h("span", { class: "fct-ring" }), h("span", { class: "fct-label", text: label }));
  b.firstChild.innerHTML = '<svg class="hold-ring" viewBox="0 0 40 40" aria-hidden="true"><circle class="ring-bg" cx="20" cy="20" r="16"/>' +
    '<circle class="ring-fg" cx="20" cy="20" r="16" pathLength="100"/></svg>';
  attachHold(b, HOLD_MS, onDone);
  return b;
}

// Draw the strip bar for the current state. Idle: only the small "Behavior" tally (hold 1 s) at the right.
function paint() {
  const bar = document.getElementById("fct-bar");
  if (!bar) return;
  const f = settings();
  const show = !!f && H.canRun();
  H.appEl.classList.toggle("fct-on", show);
  H.appEl.classList.toggle("fct-running", show && !!run);
  if (!show) { bar.hidden = true; bar.replaceChildren(); if (run) { stopTimers(); run = null; } return; }
  bar.hidden = false;
  bar.className = run ? "fct-" + run.phase : "fct-idle";
  const tally = holdBtn("fct-behavior", "fct-tally", "Behavior", behavior);
  const note = h("span", { id: "fct-note", class: "fct-note", hidden: true });
  if (!run) { bar.replaceChildren(note, tally); return; }
  if (run.phase === "wait") {
    bar.replaceChildren(
      h("div", { class: "fct-clock", role: "timer", "aria-live": "off" },
        h("span", { class: "fct-title", text: `Wait for ${word(f)}` }),
        h("span", { class: "fct-track" }, h("span", { class: "fct-fill", id: "fct-fill" })),
        h("span", { class: "fct-sec", id: "fct-sec" })),
      note, tally, holdBtn("fct-stop", "fct-stopbtn", "Stop", () => stop(true)));
    paintClock(run.ms - (performance.now() - run.started));
    return;
  }
  const change = run.moved > 0 ? ` Next wait: ${fmtSec(run.next)}.` : run.moved < 0 ? ` Next wait back to ${fmtSec(run.next)}.` : "";
  bar.replaceChildren(
    h("div", { class: "fct-give", role: "status" }, h("strong", { text: `Time for ${word(f)}!` }), h("span", { text: " Give it now." + change })),
    note, tally);
}
function paintClock(leftMs) {
  const fill = document.getElementById("fct-fill"), sec = document.getElementById("fct-sec");
  if (!fill || !run) return;
  const frac = Math.max(0, Math.min(1, leftMs / run.ms));
  fill.style.width = (frac * 100).toFixed(1) + "%";
  sec.textContent = Math.ceil(leftMs / 1000) + " s";
}

// Mark every visible copy of the request word with the highlight ring.
let lastLearner = null;
function onRender() {
  const p = H.getProfile();
  if (p && p.id !== lastLearner) { lastLearner = p.id; if (run) { stopTimers(); run = null; } }    // a different learner: no wait carries over
  const f = settings();
  document.querySelectorAll("#board .cell.fct-target").forEach((c) => c.classList.remove("fct-target"));
  if (f && f.highlight && H.canRun()) document.querySelectorAll(`#board .cell[data-word="${CSS.escape(f.wordId)}"]`).forEach((c) => c.classList.add("fct-target"));
  paint();
}

// The learner changed, FCT was switched off, or a session/Model mode began: drop any running wait without recording an outcome.
function reset() { stopTimers(); run = null; onRender(); }

const api = { onWord, onRender, reset, isRunning: () => !!run, behavior };
