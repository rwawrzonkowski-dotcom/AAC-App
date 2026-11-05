// The adult screens for teaching (Phase 2, Round A, beta): the "Teaching" section of the adult menu, the list of targets and
// each target's settings, the "Start a session" form, and the screens at the end of a session (summary, "Mark as mastered?"
// and "Move to the next stage?"). The rules themselves are in js/teaching.js; saving is in js/teachdata.js.
import { h, openOverlay, askConfirm } from "./ui.js";
import { getCurrent, saveProfile, getPhotoUrl, setPhoto, removePhoto } from "./profiles.js";
import { buildModel } from "./boardmodel.js";
import { downscaleImage } from "./editor.js";
import * as T from "./teaching.js";
import * as data from "./teachdata.js";
import { startText } from "./session.js";
import { instructionsSection, openTemplatesList } from "./instrui.js";
import { ladderSection } from "./ladderui.js";

// A row "label  [-]  value  [+]" for a number setting. `fmt` turns the number into text.
function stepper(id, label, { min, max, step = 1, value, fmt = (n) => String(n), onChange }) {
  let v = value;
  const val = h("span", { class: "step-val", id: id + "-val", text: fmt(v) });
  const set = (n) => {
    v = Math.min(max, Math.max(min, n));
    val.textContent = fmt(v);
    minus.disabled = v <= min; plus.disabled = v >= max;
    onChange(v);
  };
  const minus = h("button", { type: "button", class: "btn step-btn", id: id + "-minus", "aria-label": "Less", text: "−", onclick: () => set(v - step) });
  const plus = h("button", { type: "button", class: "btn step-btn", id: id + "-plus", "aria-label": "More", text: "+", onclick: () => set(v + step) });
  minus.disabled = v <= min; plus.disabled = v >= max;
  return h("div", { class: "step-row" }, h("span", { class: "step-label", text: label }), minus, val, plus);
}

function segRow(idPrefix, values, current, label, onPick) {
  const row = h("div", { class: "seg-row seg-wrap" });
  const paint = (cur) => row.querySelectorAll(".seg").forEach((b) => b.classList.toggle("on", b.dataset.value === cur));
  for (const v of values) {
    row.append(h("button", { type: "button", class: "seg" + (v === current ? " on" : ""), id: `${idPrefix}-${v}`, "data-value": v, text: label(v),
      onclick: () => { paint(v); onPick(v); } }));
  }
  return row;
}

// ---------- The Teaching section of the adult menu ----------
// ctx: { refresh, closeMenu, sessionActive(), onChooseTargets(), onChooseSentence(), onStartSession(opts), onResume() }
export function teachingSection(ctx) {
  const cur = getCurrent();
  const n = data.getTargets().length;
  const active = ctx.sessionActive();
  const maxSec = data.getMaxTrialSec(cur.id, T.DEFAULT_MAX_TRIAL_SEC);
  return h("section", { class: "panel", id: "sec-teaching" },
    h("h2", { text: "Teaching (for this learner)" }),
    h("p", { class: "muted", text: "Choose the words to teach (targets), then run a session. During a session the board stays exactly as it is; " +
      "small adult controls appear in the strip under the message bar, and the app shows prompts and fades them automatically. " +
      "Sessions are opt-in: no teaching data is recorded unless you start one. (Everyday use is recorded separately: see Data below.)" }),
    active ? h("p", { class: "teach-active", id: "teach-active", text: "A teaching session is running. End it from the strip under the message bar (hold End session)." }) : null,
    h("div", { class: "btn-row left" },
      h("button", { type: "button", class: "btn primary", id: "teach-targets-open", text: `Targets (${n})`, onclick: () => openTargetsList(ctx) }),
      h("button", { type: "button", class: "btn primary", id: "teach-start-open", text: "Start a session", disabled: active, onclick: () => openStartSession(ctx) }),
      h("button", { type: "button", class: "btn", id: "teach-templates-open", text: "Teaching templates", onclick: () => openTemplatesList() })),
    h("div", { class: "field touch-setting" },
      stepper("teach-max", "Longest a trial can run", { min: 5, max: 120, step: 5, value: maxSec, fmt: (v) => v + " s",
        onChange: (v) => data.setMaxTrialSec(cur.id, v) }),
      h("p", { class: "muted", text: "After this long with no correct answer, a trial ends as \"no response\"." })));
}

// ---------- Targets ----------
function statusPill(t) { return h("span", { class: "pill st-" + t.status, text: T.STATUS_LABELS[t.status] }); }

function targetDetail(t) {
  if (T.isChain(t)) {
    return `Sentence of ${t.links.length} words  |  ${T.chainPhaseText(t)}` + (t.speakStep ? "  |  then say the sentence" : "") +
      `  |  ${T.DIRECTION_LABELS[t.direction]}`;
  }
  const start = startText(t);
  const last = t.history.length ? t.history[t.history.length - 1] : null;
  const ladder = T.isCustom(t) ? `Custom ladder (${T.ladderOf(t).length} steps)` : `Default ladder (${T.STEP_SIZES[t.stepSize]}% steps)`;
  return `Starts at: ${start}  |  ${T.DIRECTION_LABELS[t.direction]}  |  ${ladder}` + (last ? `  |  ${T.changeText(last)}` : "");
}

export function openTargetsList(ctx) {
  const list = h("div", { class: "tgt-list", id: "tgt-list" });
  const o = openOverlay([
    h("h2", { text: "Targets" }),
    h("p", { class: "muted", text: "Targets are the words and sentences you are teaching. Each target has a prompt ladder: by default the Model prompt at 100, 75, 50 and 25 percent, then Independent; a custom ladder can also use critter, ring, glow and path highlight steps. " +
      "A sentence target is a chain of 2 to 6 words taught in order, by total task, forward or backward chaining; each word fades on its own." }),
    list,
    h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn primary", id: "tgt-add", text: "Add targets",
        onclick: () => { o.close(); ctx.closeMenu(); ctx.onChooseTargets(); } }),
      h("button", { type: "button", class: "btn primary", id: "tgt-add-sentence", text: "Add a sentence",
        onclick: () => { o.close(); ctx.closeMenu(); ctx.onChooseSentence(); } }),
      h("button", { type: "button", class: "btn", id: "tgt-close", text: "Close", onclick: () => { o.close(); ctx.refresh(); } })),
  ], { sheetClass: "editor tall" });

  function paint() {
    const targets = data.getTargets();
    list.replaceChildren(...(targets.length ? targets.map((t) =>
      h("div", { class: "tgt-row", "data-word": t.wordId },
        h("div", { class: "tgt-main" },
          h("div", { class: "tgt-name" }, h("span", { class: "tgt-label", text: t.label }), statusPill(t)),
          h("div", { class: "muted tgt-detail", text: targetDetail(t) }),
          T.isChain(t) ? h("div", { class: "muted tgt-detail tgt-steps", text: T.chainStepsText(t) }) : null,
          !T.isChain(t) && t.path.length ? h("div", { class: "muted tgt-detail", text: "Path: " + t.path.join(" > ") + " > " + t.label }) : null),
        h("div", { class: "tgt-btns" },
          h("button", { type: "button", class: "btn tgt-settings", text: "Settings", onclick: () => openTargetSettings(t, paint) }),
          h("button", { type: "button", class: "btn danger tgt-remove", text: "Remove", onclick: async () => {
            const sure = await askConfirm(`Remove "${t.label}" as a target? Its sessions and trials are kept.`, "Remove");
            if (!sure) return;
            await data.removeTarget(t.wordId);
            paint();
          } })))) :
      [h("p", { class: "muted", id: "tgt-empty", text: "No targets yet. Tap Add targets, then tap the words you want to teach." })]));
  }
  paint();
}

export function openTargetSettings(t, onDone) {
  const save = () => data.saveTarget(t);
  const log = (list, from, to, reason) => list.push({ time: Date.now(), from, to, reason });
  const rewardState = h("p", { class: "pic-state", id: "ts-reward-state" });
  const thumb = h("div", { class: "photo-thumb", id: "ts-reward-thumb" });
  const paintReward = () => {
    const url = t.reward ? getPhotoUrl("reward:" + t.wordId) : null;
    thumb.replaceChildren(url ? h("img", { src: url, alt: "" }) : "None");
    rewardState.textContent = url ? "A reward picture shows for 2 seconds after a correct trial." : "Off. No reward picture.";
  };
  const fileIn = h("input", { type: "file", accept: "image/*", id: "ts-reward-file", class: "file-hidden",
    onchange: async () => {
      const f = fileIn.files && fileIn.files[0];
      fileIn.value = "";
      if (!f) return;
      try {
        await setPhoto("reward:" + t.wordId, await downscaleImage(f, 1024, 0.85));
        t.reward = true; await save(); paintReward();
      } catch (e) { rewardState.textContent = "That picture could not be read."; }
    } });
  const m = t.mastery;

  const o = openOverlay([
    h("h2", {}, "Settings: ", h("span", { id: "ts-title", text: t.label })),
    h("div", { class: "field" }, h("label", { text: "Status" }),
      segRow("ts-status", T.STATUSES, t.status, (v) => T.STATUS_LABELS[v], (v) => {
        if (v !== t.status) { log(t.statusHistory, t.status, v, "changed by adult"); t.status = v; save(); }
      }),
      h("p", { class: "muted", text: "Only Teaching targets get prompts. Baseline, Mastered and Maintenance are tried with no prompts." })),
    h("div", { class: "field" }, h("label", { text: "Prompt direction" }),
      segRow("ts-dir", T.DIRECTIONS, t.direction, (v) => T.DIRECTION_LABELS[v], (v) => { t.direction = v; save(); }),
      h("p", { class: "muted", text: "Most-to-least starts each trial at the target's step in the ladder and fades it automatically. Least-to-most starts with no prompt and adds help one step at a time, from the faintest step up." })),
    T.isChain(t) ? chainSection(t, { save }) : null,
    ladderSection(t, { save, hideStart: T.isChain(t) }),
    stepper("ts-delay", "Time delay", { min: 1, max: 15, value: t.delaySec, fmt: (v) => v + " s", onChange: (v) => { t.delaySec = v; save(); } }),
    stepper("ts-fade", "Fade after correct in a row", { min: 1, max: 10, value: t.fadeAfter, onChange: (v) => { t.fadeAfter = v; save(); } }),
    stepper("ts-back", "Back up after misses in a row", { min: 1, max: 10, value: t.backUpAfter, onChange: (v) => { t.backUpAfter = v; save(); } }),
    h("h3", { text: "Mastery rule" }),
    stepper("ts-m-pct", "Independent", { min: 50, max: 100, step: 5, value: m.pct, fmt: (v) => v + "%", onChange: (v) => { m.pct = v; save(); } }),
    stepper("ts-m-sessions", "Across this many sessions", { min: 1, max: 10, value: m.sessions, onChange: (v) => { m.sessions = v; save(); } }),
    stepper("ts-m-min", "At least this many trials per session", { min: 1, max: 20, value: m.minTrials, onChange: (v) => { m.minTrials = v; save(); } }),
    stepper("ts-m-tags", "Different people or settings", { min: 1, max: 4, value: m.differentTags, onChange: (v) => { m.differentTags = v; save(); } }),
    h("h3", { text: "Reward picture (optional)" }),
    h("div", { class: "photo-row" }, thumb,
      h("div", { class: "photo-btns" }, rewardState,
        h("label", { class: "btn", for: "ts-reward-file", text: "Take or choose photo" }), fileIn,
        h("button", { type: "button", class: "btn", id: "ts-reward-remove", text: "Remove picture", onclick: async () => {
          await removePhoto("reward:" + t.wordId); t.reward = false; await save(); paintReward();
        } }))),
    instructionsSection(t),
    h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn primary", id: "ts-done", text: "Done", onclick: () => { o.close(); onDone(); } })),
  ], { sheetClass: "editor tall" });
  paintReward();
}

// ---------- A sentence target's own settings (Beta 3.12) ----------
// The chaining method, the "say the sentence" step, and each word's starting step (each word fades on its own).
function chainSection(t, { save }) {
  const box = h("div", { class: "field", id: "ts-chain" });
  function paint() {
    const n = T.ladderOf(t).length, taught = new Set(T.taughtLinks(t));
    const wordRows = t.links.map((l, i) => {
      const sel = h("select", { class: "text-input ts-link-start", "data-link": String(i), "aria-label": "Starting step for " + l.label, onchange: () => {
        const to = Number(sel.value);
        if (to === t.linkPos[i]) return;
        t.history.push({ time: Date.now(), from: `${l.label}: ${T.posName(t, t.linkPos[i])}`, to: `${l.label}: ${T.posName(t, to)}`, reason: "changed by adult", dir: to > t.linkPos[i] ? "less" : "more" });
        t.linkPos[i] = to; t.linkHits[i] = 0; t.linkMisses[i] = 0; save();
      } });
      T.ladderOf(t).forEach((s, k) => sel.append(h("option", { value: k, text: `${k + 1}. ${T.stepName(s, T.isCustom(t))}` })));
      sel.append(h("option", { value: n, text: T.INDEPENDENT_NAME }));
      sel.value = String(t.linkPos[i]);
      const role = taught.has(i) ? "learner" : t.method === "forward" ? "modeled by the app" : "filled in";
      return h("div", { class: "chain-word" + (taught.has(i) ? "" : " off") },
        h("span", { class: "chain-num", text: String(i + 1) }), h("span", { class: "chain-label", text: l.label }),
        h("small", { class: "muted chain-role", text: role }), sel);
    });
    box.replaceChildren(
      h("label", { text: "Sentence: " + t.label }),
      h("div", { class: "seg-row seg-wrap", id: "ts-method" }, T.CHAIN_METHODS.map((m) =>
        h("button", { type: "button", class: "seg" + (t.method === m ? " on" : ""), id: "ts-method-" + m, text: T.CHAIN_METHOD_LABELS[m],
          onclick: () => { if (t.method !== m) { T.setChainMethod(t, m); save(); paint(); } } }))),
      h("p", { class: "muted", id: "ts-phase", text: T.chainPhaseText(t) + "." }),
      h("p", { class: "muted", text: "Total task: the learner does every word on every trial. Forward: the learner does the first words and the app models the rest " +
        "(prompt on each button, the word is added and said). Backward: the first words are already in the message bar and the learner finishes the sentence. " +
        "When every word the learner does has been independent for the “Fade after” number of trials in a row, the end of the session asks whether to add the next word." }),
      t.method !== "total" ? h("div", { class: "btn-row left" },
        h("button", { type: "button", class: "btn", id: "ts-phase-back", text: "One word fewer", disabled: t.phase <= 1, onclick: () => {
          t.history.push({ time: Date.now(), from: T.chainPhaseText(t), to: "", reason: "changed by adult", dir: "" });
          t.phase--; t.phaseRun = 0; t.history[t.history.length - 1].to = T.chainPhaseText(t); save(); paint(); } }),
        h("button", { type: "button", class: "btn", id: "ts-phase-next", text: "Add the next word now", disabled: t.phase >= t.links.length, onclick: () => {
          T.advancePhase(t, "changed by adult"); save(); paint(); } })) : null,
      h("div", { class: "field lad-sub" }, h("label", { text: "Each word's starting step (most-to-least; each word fades on its own)" }),
        h("div", { class: "chain-words", id: "ts-chain-words" }, wordRows)),
      h("div", { class: "field lad-sub" }, h("label", { text: "Say the sentence at the end" }),
        h("div", { class: "seg-row touch-seg" },
          h("button", { type: "button", class: "seg" + (t.speakStep ? "" : " on"), id: "ts-speak-off", text: "Off", onclick: () => { t.speakStep = false; save(); paint(); } }),
          h("button", { type: "button", class: "seg" + (t.speakStep ? " on" : ""), id: "ts-speak-on", text: "On", onclick: () => { t.speakStep = true; save(); paint(); } })),
        h("p", { class: "muted", text: "On: after the last word, tapping the message bar to say the whole sentence is one more step (prompted like a word)." })));
  }
  paint();
  return box;
}

// ---------- Start a session ----------
export function openStartSession(ctx) {
  const cur = getCurrent();
  const targets = data.getTargets();
  const last = data.getLastTags(cur.id);
  let who = T.WHO_CHOICES.includes(last.who) ? last.who : "";
  let where = T.WHERE_CHOICES.includes(last.where) ? last.where : "";
  const checks = new Map();
  const startBtn = h("button", { type: "button", class: "btn primary", id: "ss-start", text: "Start session" });
  const refreshBtn = () => { startBtn.disabled = !who || !where || ![...checks.values()].some((c) => c.checked); };

  const list = targets.length ? targets.map((t) => {
    const box = h("input", { type: "checkbox", id: "ss-t-" + checks.size, "data-word": t.wordId, onchange: refreshBtn });
    box.checked = t.status === "teaching" || t.status === "baseline";
    checks.set(t.wordId, box);
    return h("label", { class: "ss-target", for: box.id }, box, h("span", { class: "ss-name", text: t.label }), statusPill(t));
  }) : [h("p", { class: "muted", id: "ss-none", text: "There are no targets yet. Close this and add targets first." })];

  const o = openOverlay([
    h("h2", { text: "Start a session" }),
    h("div", { class: "field" }, h("label", { text: "Targets for this session" }), h("div", { class: "ss-list" }, list)),
    h("div", { class: "field" }, h("label", { text: "Who is running it?" }),
      segRow("ss-who", T.WHO_CHOICES, who, (v) => v, (v) => { who = v; refreshBtn(); })),
    h("div", { class: "field" }, h("label", { text: "Where?" }),
      segRow("ss-where", T.WHERE_CHOICES, where, (v) => v, (v) => { where = v; refreshBtn(); })),
    h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn", id: "ss-cancel", text: "Cancel", onclick: () => o.close() }), startBtn),
  ], { sheetClass: "editor tall" });
  startBtn.addEventListener("click", () => {
    const wordIds = targets.filter((t) => checks.get(t.wordId).checked).map((t) => t.wordId);
    data.setLastTags(cur.id, { who, where });
    o.close();
    ctx.closeMenu();
    ctx.onStartSession({ who, where, wordIds });
  });
  refreshBtn();
}

// ---------- The end of a session ----------
// result = { session, trials, targets } from endSession(). ctx = { board, onVocabChanged }.
export async function runEndFlow(result, ctx) {
  await showSummary(result);
  const cur = getCurrent();
  const [sessions, trials] = await Promise.all([data.listSessions(cur.id), data.listTrials(cur.id)]);
  // Sentence targets ready for the next word (Beta 3.12): suggested here, the adult confirms.
  for (const id of result.phaseReady || []) {
    const live = data.getTarget(id);
    if (live && T.isChain(live) && live.status === "teaching") await askPhase(live);
  }
  for (const t of result.targets) {
    const live = data.getTarget(t.wordId);
    if (!live || (live.status !== "teaching" && live.status !== "baseline")) continue;
    const check = T.masteryCheck(live, sessions, trials);
    if (check.met) await askMastery(live, check);
  }
  const model = buildModel(ctx.board, cur.gridSize);
  const stageIds = model.main.filter((b) => b.stage === cur.stage).map((b) => b.id);
  if (T.stageReady(cur.stage, stageIds, data.getTargets())) await askStage(cur, ctx);
}

function fmtDuration(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 1 ? "under a minute" : m === 1 ? "1 minute" : m + " minutes";
}

function showSummary({ session, trials, targets }) {
  const rows = T.summarizeSession(session, trials, targets);
  const when = new Date(session.start);
  return new Promise((resolve) => {
    const done = () => { o.close(); resolve(); };
    const table = h("table", { class: "sum-table", id: "sum-table" },
      h("thead", {}, h("tr", {}, ["Target", "Trials", "Independent", "Prompt step"].map((c) => h("th", { text: c })))),
      h("tbody", {}, rows.map((r) => {
        const t = targets.find((x) => x.wordId === r.wordId);
        const level = r.changes.length ? r.changes.map((c) => T.changeText(c)).join(", ")
          : t && T.isProbe(t) ? "No prompts used" : t && t.direction === "ltm" ? "Least-to-most"
          : t && T.isChain(t) ? "Each word stayed: " + T.chainStepsText(t) : "Stayed at " + (t ? T.posName(t) : T.INDEPENDENT_NAME);
        return h("tr", { "data-word": r.wordId },
          h("td", { class: "sum-name", text: r.label }),
          h("td", { class: "sum-trials", text: r.trials ? `${r.trials} (${r.planned} planned, ${r.net} NET)` : "0" + (r.skipped ? `, ${r.skipped} skipped` : "") }),
          h("td", { class: "sum-pct", text: r.pctIndependent === null ? "-" : `${r.pctIndependent}% (${r.independent} of ${r.trials})` }),
          h("td", { class: "sum-level", text: level }));
      })));
    const total = rows.reduce((n, r) => n + r.trials, 0), skipped = rows.reduce((n, r) => n + r.skipped, 0);
    const o = openOverlay([
      h("h2", { text: "Session summary" }),
      h("p", { class: "muted", id: "sum-meta", text: `${session.who}, ${session.where}  |  ${when.toLocaleDateString()}  |  ${fmtDuration((session.end || Date.now()) - session.start)}` }),
      table,
      h("p", { class: "muted", id: "sum-total", text: `${total} ${total === 1 ? "trial" : "trials"} scored` + (skipped ? `, ${skipped} skipped (not scored)` : "") + ". The session is saved." }),
      h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn primary", id: "sum-done", text: "Done", onclick: done })),
    ], { sheetClass: "editor tall" });
  });
}

function askMastery(t, check) {
  return new Promise((resolve) => {
    const finish = (yes) => { o.close(); resolve(yes); };
    const tags = (key) => [...new Set(check.sessions.map((s) => s[key]).filter(Boolean))].join(", ");
    const o = openOverlay([
      h("h2", { id: "mastery-title", text: `Mark ${t.label} as mastered?` }),
      h("p", { class: "confirm-text", id: "mastery-detail", text: `Its last ${check.sessions.length} sessions were ${check.sessions.map((s) => s.pct + "%").join(", ")} independent ` +
        `(${t.mastery.pct}% needed), with ${tags("who")} in ${tags("where")}.` }),
      h("div", { class: "btn-row" },
        h("button", { type: "button", class: "btn", id: "mastery-no", text: "Not yet", onclick: () => finish(false) }),
        h("button", { type: "button", class: "btn primary", id: "mastery-yes", text: "Mark as mastered", onclick: async () => {
          t.statusHistory.push({ time: Date.now(), from: t.status, to: "mastered", reason: "mastery rule met (confirmed by adult)" });
          t.status = "mastered";
          await data.saveTarget(t);
          finish(true);
        } })),
    ], { sheetClass: "small" });
  });
}

function askPhase(t) {
  return new Promise((resolve) => {
    const finish = () => { o.close(); resolve(); };
    const n = t.links.length, k = T.taughtLinks(t).length;
    const nextWord = t.method === "forward" ? t.links[k].label : t.links[n - k - 1].label;
    const o = openOverlay([
      h("h2", { id: "phase-title", text: `Add “${nextWord}” to “${t.label}”?` }),
      h("p", { class: "confirm-text", id: "phase-detail", text: `Every word the learner does was independent ${t.fadeAfter} trials in a row. ` +
        `${T.CHAIN_METHOD_LABELS[t.method]}: next, the learner also does “${nextWord}” (${k + 1} of ${n} words). It starts with the most help.` }),
      h("div", { class: "btn-row" },
        h("button", { type: "button", class: "btn", id: "phase-no", text: "Not yet", onclick: async () => { t.phaseRun = 0; await data.saveTarget(t); finish(); } }),
        h("button", { type: "button", class: "btn primary", id: "phase-yes", text: `Add “${nextWord}”`, onclick: async () => {
          T.advancePhase(t); await data.saveTarget(t); finish();
        } })),
    ], { sheetClass: "small" });
  });
}

function askStage(cur, ctx) {
  return new Promise((resolve) => {
    const next = cur.stage + 1;
    const finish = () => { o.close(); resolve(); };
    const o = openOverlay([
      h("h2", { id: "stage-title", text: `Move ${cur.name} to stage ${next}?` }),
      h("p", { class: "confirm-text", id: "stage-detail", text: `Every stage ${cur.stage} word you are teaching is mastered. ` +
        `Stage ${next} reveals more words in their permanent spots; nothing moves.` }),
      h("div", { class: "btn-row" },
        h("button", { type: "button", class: "btn", id: "stage-no", text: "Not yet", onclick: finish }),
        h("button", { type: "button", class: "btn primary", id: "stage-yes", text: `Move to stage ${next}`, onclick: async () => {
          cur.stage = next;
          await saveProfile(cur);
          ctx.onVocabChanged();
          finish();
        } })),
    ], { sheetClass: "small" });
  });
}
