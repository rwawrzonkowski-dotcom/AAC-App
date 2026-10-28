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

const levelOptions = (min, max) => { const out = []; for (let n = min; n <= max; n++) out.push(h("option", { value: n, text: `${n}  ${T.levelName(n)}` })); return out; };

// ---------- The Teaching section of the adult menu ----------
// ctx: { refresh, closeMenu, sessionActive(), onChooseTargets(), onStartSession(opts), onResume() }
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
  const start = startText(t);
  const last = t.history.length ? t.history[t.history.length - 1] : null;
  return `Starts at: ${start}  |  ${T.DIRECTION_LABELS[t.direction]}` + (last ? `  |  ${T.changeText(last.from, last.to)}` : "");
}

export function openTargetsList(ctx) {
  const list = h("div", { class: "tgt-list", id: "tgt-list" });
  const o = openOverlay([
    h("h2", { text: "Targets" }),
    h("p", { class: "muted", text: "Targets are the words you are teaching. Prompt levels from least to most help: independent, time delay, glow, path highlight, then the model prompt at 25, 50, 75 and 100 percent." }),
    list,
    h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn primary", id: "tgt-add", text: "Add targets",
        onclick: () => { o.close(); ctx.closeMenu(); ctx.onChooseTargets(); } }),
      h("button", { type: "button", class: "btn", id: "tgt-close", text: "Close", onclick: () => { o.close(); ctx.refresh(); } })),
  ], { sheetClass: "editor tall" });

  function paint() {
    const targets = data.getTargets();
    list.replaceChildren(...(targets.length ? targets.map((t) =>
      h("div", { class: "tgt-row", "data-word": t.wordId },
        h("div", { class: "tgt-main" },
          h("div", { class: "tgt-name" }, h("span", { class: "tgt-label", text: t.label }), statusPill(t)),
          h("div", { class: "muted tgt-detail", text: targetDetail(t) }),
          t.path.length ? h("div", { class: "muted tgt-detail", text: "Path: " + t.path.join(" > ") + " > " + t.label }) : null),
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
  const levelSel = h("select", { id: "ts-level", class: "text-input", onchange: () => {
    const to = Number(levelSel.value);
    if (to !== t.level) { log(t.history, t.level, to, "changed by adult"); t.level = to; t.streakHits = 0; t.streakMisses = 0; save(); }
  } }, levelOptions(0, 7));
  levelSel.value = String(t.level);
  const ceilSel = h("select", { id: "ts-ceiling", class: "text-input", onchange: () => {
    t.ceiling = Number(ceilSel.value);
    if (t.level > t.ceiling) { log(t.history, t.level, t.ceiling, "above the most help allowed"); t.level = t.ceiling; levelSel.value = String(t.level); }
    save();
  } }, levelOptions(2, 7));
  ceilSel.value = String(t.ceiling);
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
      h("p", { class: "muted", text: "Most-to-least starts each trial with help and fades it automatically. Least-to-most starts with none and adds help step by step." })),
    h("div", { class: "field" }, h("label", { for: "ts-level", text: "Starting prompt level (most-to-least)" }), levelSel),
    h("div", { class: "field" }, h("label", { for: "ts-ceiling", text: "Most help allowed" }), ceilSel),
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
      h("thead", {}, h("tr", {}, ["Target", "Trials", "Independent", "Prompt level"].map((c) => h("th", { text: c })))),
      h("tbody", {}, rows.map((r) => {
        const t = targets.find((x) => x.wordId === r.wordId);
        const level = r.changes.length ? r.changes.map((c) => T.changeText(c.from, c.to)).join(", ")
          : t && T.isProbe(t) ? "No prompts used" : t && t.direction === "ltm" ? "Least-to-most" : "Stayed at " + T.levelShort(t ? t.level : 0);
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
