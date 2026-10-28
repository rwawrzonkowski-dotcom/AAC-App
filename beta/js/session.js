// A teaching session while it is running (Phase 2, Round A, beta).
//
// WHAT THE ADULT SEES: a row of small controls in the context strip under the message bar (the strip is empty during a
// session, so no board button moves or changes size): the current target (hold to switch), Start trial, Opportunity,
// Skip, End session and a tiny trial counter. Every control needs a 1-second hold, with a filling ring, so a child
// cannot trigger one by accident. The board itself is the ordinary board and works exactly as usual.
//
// WHAT HAPPENS IN A TRIAL (rules in js/teaching.js):
//   - the adult gives the verbal cue and holds "Start trial" ("Opportunity" is the same but logged as type "NET")
//   - the app shows visual prompts on the NEXT button the child needs (for a word on a category page that is first the
//     category button, then the folder button, then the word: forward chaining)
//   - the trial ends when the child selects the target word (correct), when the adult holds Skip, or when the longest
//     trial time runs out ("no response")
//   - any other button the child chooses still talks as usual, is logged as an error and makes the prompt stronger
// The app never speaks during a trial except for the child's own taps. Prompts never block a tap and never move a cell.
import { h, openOverlay, askConfirm } from "./ui.js";
import { attachHold } from "./hold.js";
import { getCurrent, getPhotoUrl } from "./profiles.js";
import { getPage, pathToCore, resolvePage, posKey } from "./boardmodel.js";
import { sustainPrompt } from "./modelprompt.js";
import * as T from "./teaching.js";
import * as data from "./teachdata.js";
import { openInstructionsCard } from "./instrcard.js";

export const HOLD_MS = 1000;        // every control in the strip
const REWARD_MS = 2000;             // how long a reward picture is shown

let hooks = null;                   // set by initSession(): what this file needs from app.js
let S = null;                       // the running session, or null

// hooks: { strip, appEl, boardEl, wordsBtn, modelNow(), getPageId(), getCells(), goTo(pageId), wordsButtonAvailable(),
//          onSessionChange(), runEndFlow(result) }
export function initSession(h2) { hooks = h2; }
export const isActive = () => !!S;
export const trialRunning = () => !!(S && S.trial);
export function liveInfo() { return S ? { trials: S.scored(), targets: S.targets.length } : null; }

// ---------- Starting and ending ----------
export async function startSession({ who, where, wordIds }) {
  if (S) return;
  const learner = getCurrent();
  const targets = wordIds.map((id) => data.getTarget(id)).filter(Boolean);
  if (!targets.length) return;
  const rec = { id: data.newId("s"), learnerId: learner.id, start: Date.now(), end: null, who, where,
    targets: targets.map((t) => t.wordId), notes: "", levelChanges: [] };
  await data.putSession(rec);
  S = {
    rec, targets, idx: 0, trials: [], trial: null, levelChanges: [], pending: Promise.resolve(), stopVisual: null,
    maxTrialMs: data.getMaxTrialSec(learner.id, T.DEFAULT_MAX_TRIAL_SEC) * 1000, last: "",
    scored() { return this.trials.filter((t) => t.result !== "skipped").length; },
  };
  buildStrip();
  hooks.appEl.classList.add("in-session");
  hooks.onSessionChange();
  paintBar();
}

// The adult opened the adult menu in the middle of a trial: that trial is skipped (not scored).
export function pauseForMenu() { if (S && S.trial) endTrial("skipped"); }

// Finish: skip any running trial, save the session, take the controls away and hand everything to the summary screens.
export async function endSession() {
  if (!S) return null;
  const s = S;
  if (s.trial) endTrial("skipped");
  await s.pending;
  s.rec.end = Date.now();
  s.rec.levelChanges = s.levelChanges;
  await data.putSession(s.rec);
  teardown();
  hooks.onSessionChange();
  return { session: s.rec, trials: s.trials, targets: s.targets };
}

function teardown() {
  if (S && S.trial) endTrial("skipped");
  clearVisual();
  if (S && S.card) S.card.close();
  const bar = document.getElementById("session-bar");
  if (bar) bar.remove();
  hooks.appEl.classList.remove("in-session");
  S = null;
}

// ---------- The controls in the strip ----------
const RING = '<svg class="hold-ring" viewBox="0 0 40 40" aria-hidden="true"><circle class="ring-bg" cx="20" cy="20" r="16"/>' +
  '<circle class="ring-fg" cx="20" cy="20" r="16" pathLength="100"/></svg>';

function holdButton(id, cls, onDone, ...kids) {
  const b = h("button", { type: "button", class: "sb-btn " + cls, id }, h("span", { class: "sb-ring" }), ...kids);
  b.firstChild.innerHTML = RING;
  attachHold(b, HOLD_MS, () => { if (!b.classList.contains("off")) onDone(); });
  return b;
}

function buildStrip() {
  const bar = h("div", { id: "session-bar" },
    holdButton("sb-picker", "sb-picker", openPicker, h("span", { class: "sb-name", id: "sb-name" }), h("span", { class: "sb-level", id: "sb-level" })),
    holdButton("sb-start", "sb-start", () => startTrial("planned"), h("span", { class: "sb-label", text: "Start trial" })),
    holdButton("sb-net", "sb-net", () => startTrial("NET"), h("span", { class: "sb-label", text: "Opportunity" })),
    holdButton("sb-skip", "sb-skip", () => { if (S && S.trial) endTrial("skipped"); }, h("span", { class: "sb-label", text: "Skip" })),
    holdButton("sb-instr", "sb-instr", openInstructions, h("span", { class: "sb-label", text: "Instructions" })),
    holdButton("sb-end", "sb-end", askEnd, h("span", { class: "sb-label", text: "End session" })),
    h("div", { class: "sb-count", id: "sb-count", role: "status" },
      h("span", { id: "sb-trials", text: "Trials 0" }), h("small", { id: "sb-last", text: "" })));
  hooks.strip.appendChild(bar);
}

// Hold "Instructions": the current target's teaching instructions, on a card over the board. Adults only see them when they
// ask. While a trial is running the card cannot be opened; while the card is open no trial can start.
function openInstructions() {
  if (!S || S.cardOpen) return;
  if (S.trial) { flashBrief("Finish or skip the trial first"); return; }
  S.cardOpen = true;
  const t = S.targets[S.idx];
  S.card = openInstructionsCard(t, getCurrent().name, { onClose: () => { if (S) { S.cardOpen = false; S.card = null; } } });
}
// A short note in the counter's small line; it goes back to the last result after a moment.
function flashBrief(text, ms = 2500) {
  const before = S.last;
  S.last = text; paintBar();
  setTimeout(() => { if (S && S.last === text) { S.last = before; paintBar(); } }, ms);
}

async function askEnd() {
  if (!S) return;
  const sure = await askConfirm("End this teaching session? The trials so far are saved. A trial in progress is skipped, not scored.", "End session");
  if (!sure || !S) return;
  const result = await endSession();
  if (result) hooks.runEndFlow(result);
}

// Hold the target name: choose which of the session's targets the next trial is for.
function openPicker() {
  if (!S || S.trial) return;
  const o = openOverlay([
    h("h2", { text: "Choose the target" }),
    h("div", { class: "pick-list" }, S.targets.map((t, i) =>
      h("button", { type: "button", class: "seg pick-item" + (i === S.idx ? " on" : ""), "data-word": t.wordId,
        text: t.label + " (" + startText(t) + ")",
        onclick: () => { S.idx = i; o.close(); paintBar(); } }))),
    h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn", text: "Cancel", onclick: () => o.close() })),
  ], { sheetClass: "small" });
}

// What the prompt starts as for this target, in a few words.
export function startText(t) {
  if (T.isProbe(t)) return "no prompts";
  return t.direction === "ltm" ? "least-to-most" : T.levelShort(t.level);
}

function paintBar() {
  const bar = document.getElementById("session-bar");
  if (!bar || !S) return;
  const t = S.targets[S.idx], running = !!S.trial;
  bar.dataset.trial = running ? "running" : "";
  bar.dataset.level = running ? String(S.trial.shown) : "";
  document.getElementById("sb-name").textContent = t.label;
  document.getElementById("sb-level").textContent = startText(t);
  document.getElementById("sb-trials").textContent = "Trials " + S.scored();
  document.getElementById("sb-last").textContent = S.last;
  const off = (id, v) => document.getElementById(id).classList.toggle("off", v);
  off("sb-start", running); off("sb-net", running); off("sb-skip", !running); off("sb-picker", running || S.targets.length < 2);
}

// ---------- A trial ----------
// The board's route to the target word: pages = [core, ..., page the word is on]; steps = the button to choose on each page.
function buildChain(target) {
  const profile = getCurrent(), model = hooks.modelNow();
  const pages = pathToCore(model, profile, target.pageId).reverse();
  if (pages[0] !== "core") return null;
  const steps = [];
  for (let i = 0; i < pages.length; i++) {
    if (i < pages.length - 1) {
      const child = getPage(model, profile, pages[i + 1]);
      if (!child) return null;
      steps.push({ pageId: pages[i], opens: pages[i + 1], label: child.name || pages[i + 1],
        key: child.at ? posKey(model.size, pages[i], child.at.row, child.at.col) : null, bar: !child.at });
    } else {
      steps.push({ pageId: pages[i], word: true, label: target.label });
    }
  }
  if (steps.some((s) => s.bar) && !hooks.wordsButtonAvailable()) return null;
  const last = getPage(model, profile, pages[pages.length - 1]);
  const here = resolvePage(last, profile, model);
  if (!here.some((d) => d.kind === "word" && d.visible && (d.wordId || d.key) === target.wordId)) return null;
  return { pages, steps };
}

function flash(text) { S.last = text; paintBar(); }

function startTrial(type) {
  if (!S || S.trial || S.cardOpen) return;
  const target = S.targets[S.idx];
  const chain = buildChain(target);
  if (!chain) { flash(`"${target.label}" is not on this board`); return; }
  // A planned trial starts from the main board, like a verbal cue from the top of the chain. A natural-environment
  // opportunity starts wherever the board happens to be.
  if (type === "planned" && hooks.getPageId() !== "core") hooks.goTo("core");
  const probe = T.isProbe(target);
  const base = probe ? 0 : target.direction === "mtl" ? target.level : 0;
  const tr = {
    id: data.newId("t"), type, target, chain, t0: Date.now(), probe, base, cur: base, shown: -1, maxShown: 0, maxStep: 0,
    errors: [], firstResponse: null, steps: new Map(), timeline: [], ended: false,
    settleTimer: null, delayTimer: null, maxTimer: null,
  };
  S.trial = tr;
  tr.maxTimer = setTimeout(() => { if (S && S.trial === tr) endTrial(tr.errors.length ? "error" : "noResponse"); }, S.maxTrialMs);
  // Unprompted probes (baseline, mastered, maintenance) never show a prompt. Teaching targets show their first level after a
  // half-second settle (most-to-least) or start by waiting (least-to-most), then step up as the rules say.
  if (!probe) tr.settleTimer = setTimeout(() => { if (S && S.trial === tr) showLevel(tr, tr.cur); }, T.SETTLE_MS);
  paintBar();
}

// Show a level on the next button, remember it, and start the time delay before the next step up.
function showLevel(tr, level) {
  tr.shown = level;
  tr.maxShown = Math.max(tr.maxShown, level);
  tr.timeline.push({ level, time: Date.now() });
  const info = stepInfo(tr);
  if (level >= 2) {
    const old = tr.steps.get(info.index);
    tr.steps.set(info.index, { step: info.index, label: info.step.label, level: Math.max(level, old ? old.level : 0) });
  }
  clearTimeout(tr.delayTimer);
  if (!tr.probe && !(level >= 2 && level >= tr.target.ceiling)) {
    tr.delayTimer = setTimeout(() => { if (S && S.trial === tr) escalate(tr); }, tr.target.delaySec * 1000);
  }
  applyVisual();
  paintBar();
}

// One step more help (after the time delay, or right away after an error).
function escalate(tr) {
  clearTimeout(tr.settleTimer);
  const next = T.nextLevel(tr.cur, tr.target.ceiling);
  tr.cur = next;
  if (next !== tr.shown) showLevel(tr, next);
}

// Where the child is on the route: index of the current page in the chain, or -1 when off the route (then "Back" is next).
function stepInfo(tr) {
  const i = tr.chain.pages.indexOf(hooks.getPageId());
  return i >= 0 ? { index: i, step: tr.chain.steps[i] } : { index: -1, step: { back: true, label: "Back" } };
}

const cellEl = (key) => hooks.boardEl.querySelector(`.cell[data-key="${key}"]`);

// The button the child needs to choose next, on the page showing now.
function nextElement(tr) {
  const info = stepInfo(tr);
  const cells = [...hooks.getCells().values()];
  if (info.index < 0) {
    const home = cells.find((d) => d.kind === "home");
    return home ? cellEl(home.key) : hooks.wordsBtn;      // the Words menu has no Back cell: its top-bar button reads "Close"
  }
  const st = info.step;
  if (st.word) {
    const d = cells.find((c) => c.kind === "word" && c.visible && (c.wordId || c.key) === tr.target.wordId);
    return d ? cellEl(d.key) : null;
  }
  return st.bar ? hooks.wordsBtn : cellEl(st.key);
}

function clearVisual() {
  if (S && S.stopVisual) { S.stopVisual(); S.stopVisual = null; }
}

// Draw the prompt for the level showing now. Called after a level changes and after every redraw of the board.
function applyVisual() {
  clearVisual();
  const tr = S && S.trial;
  if (!tr || tr.probe || tr.shown < 2) return;
  const el = nextElement(tr);
  if (!el) return;
  const lvl = tr.shown;
  if (lvl === 2) {
    el.classList.add("teach-glow");
    S.stopVisual = () => el.classList.remove("teach-glow");
  } else if (lvl === 3) {
    el.style.setProperty("--ring-a", "1");
    el.classList.add("teach-ring");
    S.stopVisual = () => { el.classList.remove("teach-ring"); el.style.removeProperty("--ring-a"); };
  } else {
    S.stopVisual = sustainPrompt(el, getCurrent().model, getPhotoUrl("critter"), T.levelOpacity(lvl));
  }
}

// app.js calls this after every redraw of the board (a page change, for instance).
export function onRender() {
  const tr = S && S.trial;
  if (!tr) return;
  const info = stepInfo(tr);
  if (!tr.probe && info.index > tr.maxStep) {
    // New progress along the route: the next button starts again at the trial's first level.
    tr.maxStep = info.index;
    clearTimeout(tr.settleTimer);
    tr.cur = tr.base;
    showLevel(tr, tr.base);
  } else {
    if (info.index > tr.maxStep) tr.maxStep = info.index;
    applyVisual();
  }
}

// app.js calls this for each choice the child makes on the board (before the board changes page):
//   { type: "word" | "category" | "back" | "other", id, label, opens }
export function onSelect(ev) {
  const tr = S && S.trial;
  if (!tr || ev.type === "back" || ev.type === "other") return;
  const now = Date.now();
  if (tr.firstResponse === null) tr.firstResponse = now;
  if (ev.type === "word" && ev.id === tr.target.wordId) { endTrial("correct"); return; }
  if (ev.type === "category") {
    const i = tr.chain.pages.indexOf(hooks.getPageId());
    if (i >= 0 && i < tr.chain.pages.length - 1 && tr.chain.pages[i + 1] === ev.opens) return;    // the right button: progress
  }
  tr.errors.push({ wordId: ev.id, label: ev.label, time: now });
  if (!tr.probe) escalate(tr);
}

function endTrial(result) {
  const tr = S && S.trial;
  if (!tr || tr.ended) return;
  tr.ended = true;
  for (const k of ["settleTimer", "delayTimer", "maxTimer"]) clearTimeout(tr[k]);
  clearVisual();
  S.trial = null;
  const now = Date.now(), target = tr.target;
  const rec = {
    id: tr.id, sessionId: S.rec.id, learnerId: S.rec.learnerId, wordId: target.wordId, label: target.label, type: tr.type,
    start: tr.t0, end: now, latencyMs: tr.firstResponse === null ? null : tr.firstResponse - tr.t0, result,
    promptLevel: tr.maxShown, startLevel: tr.base, direction: target.direction,
    errors: tr.errors, chainStepsPrompted: [...tr.steps.values()].sort((a, b) => a.step - b.step),
    chain: tr.chain.steps.map((s) => s.label), promptTimeline: tr.timeline,
  };
  S.trials.push(rec);
  const change = T.applyTrialToTarget(target, rec, now);
  if (change) S.levelChanges.push({ wordId: target.wordId, label: target.label, ...change });
  S.rec.levelChanges = S.levelChanges;
  const word = target.label;
  S.last = result === "correct" ? `${word}: correct (${T.levelShort(rec.promptLevel)})` :
    result === "skipped" ? `${word}: skipped` : result === "error" ? `${word}: error` : `${word}: no response`;
  const sessionRec = S.rec;
  S.pending = S.pending.then(() => Promise.all([data.putTrial(rec), data.saveTarget(target), data.putSession(sessionRec)]))
    .catch((e) => console.warn("Could not save a trial:", e));
  if (result === "correct" && target.reward) showReward(getPhotoUrl("reward:" + target.wordId));
  paintBar();
}

// The reward picture (adult's choice, off by default): full screen for 2 seconds. It never catches a tap.
function showReward(url) {
  if (!url) return;
  const layer = h("div", { id: "reward-layer", "aria-hidden": "true" }, h("img", { src: url, alt: "" }));
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), REWARD_MS);
}
