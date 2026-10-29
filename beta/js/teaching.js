// Teaching rules (Phase 2, Round A, beta): the plain rules for targets, prompt levels, automatic fading and
// mastery. Nothing in this file draws anything or touches the screen or the database, so every rule can be
// read (and tested) on its own. The screens are in js/teachui.js, the running session in js/session.js and
// the saving in js/teachdata.js.
//
// PROMPT LADDERS (Beta 2.3). Prompts are visual only; the app never speaks during a trial.
// A ladder is an ordered list of prompt STEPS from MOST help (index 0, the top) to LEAST help, each step = { type, opacity }:
//   model     the learner's Model prompt (critter and/or ring, as set in Model prompt), at the step's opacity
//   critter   the critter only          ring   the ring only
//   glow      the next button pulses softly (amber)        path   the Model-mode ring (path highlight)
// Opacity is 1 to 100 percent. After the last step comes INDEPENDENT (no prompt): its position is the ladder's length.
// The time delay is not a step: it is the wait before the next, stronger step appears (and, in least-to-most, before the first).
// The default ladder only fades the Model prompt: 100, 75, 50, 25 percent, then Independent (stimulus fading: every move is
// to a weaker version of the same prompt). Glow and path highlight exist only as steps in a CUSTOM ladder.
//
// A target keeps its place in the ladder as `pos`: 0 = top step ... length-1 = faintest step, length = Independent.
//
// OLD LEVELS (Beta 2.0 to 2.2) 0 independent, 1 time delay, 2 glow, 3 path, 4-7 model 25/50/75/100 percent are only read from old
// targets, trials, sessions and backups. Every trial still carries a numeric `promptLevel` (best mapping, see legacyLevelOfStep) so
// older readers keep working, and a normalized `help` value from 0 (independent) to 1 for graphs.

export const STEP_TYPES = ["model", "critter", "ring", "glow", "path"];
export const STEP_TYPE_NAMES = { model: "Model", critter: "Critter", ring: "Ring", glow: "Glow", path: "Path highlight" };
export const STEP_SIZES = { standard: 25, medium: 10, fine: 5 };           // percent between steps in the default ladder
export const STEP_SIZE_IDS = ["standard", "medium", "fine"];
export const STEP_SIZE_LABELS = { standard: "Standard (25% steps)", medium: "Medium (10% steps)", fine: "Fine (5% steps)" };
export const INDEPENDENT_NAME = "Independent";
export const MAX_STEPS = 30;

// The default ladder for a step size: 100, then down by the step size while still above zero.
export function defaultLadder(size = "standard") {
  const by = STEP_SIZES[size] || 25, out = [];
  for (let o = 100; o >= by; o -= by) out.push({ type: "model", opacity: o });
  return out;
}

const cloneLadder = (l) => l.map((s) => ({ type: s.type, opacity: s.opacity }));
// Anything -> a valid list of 1 to MAX_STEPS steps, or null.
export function cleanLadder(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const s of raw.slice(0, MAX_STEPS)) {
    if (s && typeof s === "object" && STEP_TYPES.includes(s.type) && typeof s.opacity === "number" && isFinite(s.opacity)) {
      out.push({ type: s.type, opacity: Math.min(100, Math.max(1, Math.round(s.opacity))) });
    }
  }
  return out.length ? out : null;
}

export const isCustom = (t) => t.ladderMode === "custom" && !!cleanLadder(t.customLadder);
// The ladder a target uses now (a copy, most help first).
export const ladderOf = (t) => (isCustom(t) ? cloneLadder(cleanLadder(t.customLadder)) : defaultLadder(t.stepSize));
export const posIndependent = (t) => ladderOf(t).length;      // the pos that means "Independent"

// "Model 50%"; in a custom ladder "Custom: Glow 25%".
export const stepName = (step, custom) => (custom ? "Custom: " : "") + STEP_TYPE_NAMES[step.type] + " " + step.opacity + "%";
// The name of a place in a target's ladder (pos = ladder length means Independent).
export function posName(t, pos = t.pos) {
  const l = ladderOf(t);
  return pos >= l.length || pos < 0 ? INDEPENDENT_NAME : stepName(l[pos], isCustom(t));
}
// A short fingerprint of a ladder, saved with every trial so a graph knows which ladder the step belongs to.
export function ladderId(t) {
  if (!isCustom(t)) return "default-" + (STEP_SIZES[t.stepSize] || 25);
  let x = 5381;
  for (const ch of ladderOf(t).map((s) => s.type + ":" + s.opacity).join(";")) x = ((x * 33) ^ ch.charCodeAt(0)) >>> 0;
  return "custom-" + x.toString(36);
}
// The ladder in one line: "Model 100% → 75% → 50% → 25% → Independent" (a repeated prompt type is named once).
export function ladderSummary(t) {
  const l = ladderOf(t), parts = [];
  l.forEach((s, i) => parts.push(i && l[i - 1].type === s.type ? s.opacity + "%" : STEP_TYPE_NAMES[s.type] + " " + s.opacity + "%"));
  return (isCustom(t) ? "Custom: " : "") + parts.concat(INDEPENDENT_NAME).join(" → ");
}
// How much help a step gives, 0 to 1 (opacity-weighted: Model 25% = 0.25; Independent = 0).
export const helpOfStep = (step) => (step ? step.opacity / 100 : 0);

// When the ladder changes (step size, default <-> custom, an edit) the target keeps its place by opacity: the nearest step to
// the old one, never jumping back to the top. A step never turns into Independent, and Independent stays Independent.
// On a tie the step with more help wins (it comes first).
export function remapPos(oldLadder, oldPos, newLadder) {
  if (oldPos >= oldLadder.length) return newLadder.length;
  const o = oldLadder[Math.max(0, oldPos)].opacity;
  let best = 0, bestD = Infinity;
  newLadder.forEach((s, i) => { const d = Math.abs(s.opacity - o); if (d < bestD) { best = i; bestD = d; } });
  return best;
}

// ----- Old numeric levels (see the note at the top) -----
export const LEGACY_NAMES = ["Independent", "Time delay", "Glow", "Path highlight", "Model 25%", "Model 50%", "Model 75%", "Model 100%"];
export const legacyName = (n) => LEGACY_NAMES[n] || LEGACY_NAMES[0];
// Old level -> opacity of the new default ladder it becomes (null = Independent): 7 100, 6 75, 5 50, 4 25, 3 and 2 25, 1 and 0 none.
export const legacyOpacity = (n) => (n >= 4 ? (n - 3) * 25 : n >= 2 ? 25 : null);
export const legacyHelp = (n) => (legacyOpacity(n) || 0) / 100;
// A step -> the old number: Independent 0, Glow 2, Path highlight 3, anything else 4 to 7 by its nearest 25 / 50 / 75 / 100 percent.
export function legacyLevelOfStep(step) {
  if (!step || step.type === "independent") return 0;
  if (step.type === "glow") return 2;
  if (step.type === "path") return 3;
  return 3 + Math.min(4, Math.max(1, Math.round(step.opacity / 25)));
}

export const STATUSES = ["baseline", "teaching", "mastered", "maintenance"];
export const STATUS_LABELS = { baseline: "Baseline", teaching: "Teaching", mastered: "Mastered", maintenance: "Maintenance" };
export const DIRECTIONS = ["mtl", "ltm"];
export const DIRECTION_LABELS = { mtl: "Most-to-least", ltm: "Least-to-most" };
export const WHO_CHOICES = ["Parent", "RBT", "Teacher", "BCBA", "Other"];
export const WHERE_CHOICES = ["Home", "Clinic", "School", "Community"];

// A target that is not in "Teaching" is probed without prompts (baseline, mastered, maintenance).
export const isProbe = (t) => t.status !== "teaching";

export const DEFAULT_SETTINGS = {
  direction: "mtl", ladderMode: "default", stepSize: "standard", delaySec: 3,
  fadeAfter: 3, backUpAfter: 2,
  mastery: { pct: 80, sessions: 3, minTrials: 3, differentTags: 2 },
};
export const DEFAULT_MAX_TRIAL_SEC = 30;
export const SETTLE_MS = 500;           // most-to-least: the prompt appears this long after the trial starts

const clampInt = (v, lo, hi, d) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const ID = /^[A-Za-z0-9_:,@.|-]{1,80}$/;
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

// ---------- Targets ----------
// A target (one per word, per learner; stored in IndexedDB "targets" under "<learnerId>|<wordId>"):
//   { wordId, learnerId, label, pageId, path: [page ids from the main board], added,
//     status, direction, delaySec, fadeAfter, backUpAfter,
//     ladderVersion: 1, ladderMode: "default" | "custom", stepSize: "standard" | "medium" | "fine" (the default ladder's steps),
//     customLadder: null | [{ type, opacity }] (most help first), pos (the starting step: 0 = top ... ladder length = Independent),
//     mastery: { pct, sessions, minTrials, differentTags },
//     reward: false (a picture is stored in the photos under "reward:<wordId>"),
//     instructions: { templateId, overrides: { clinical: {field: text}, parent: {field: text} } }   (see "Teaching instructions" below),
//     streakHits, streakMisses,
//     history: [{ time, from, to, reason, dir }]     every change of the starting step (from / to are step names, or old level
//                                                    numbers in entries made before Beta 2.3; dir = "less" | "more" | "")
//     statusHistory: [{ time, from, to, reason }]    every change of status
//     removed: null | time }                         removed targets keep their history
export function newTarget(learnerId, info, now = Date.now()) {
  const s = DEFAULT_SETTINGS;
  return {
    wordId: info.wordId, learnerId, label: info.label, pageId: info.pageId || "core", path: info.path || [], added: now,
    status: "teaching", direction: s.direction, ladderVersion: 1, ladderMode: s.ladderMode, stepSize: s.stepSize, customLadder: null, pos: 0,
    delaySec: s.delaySec, fadeAfter: s.fadeAfter, backUpAfter: s.backUpAfter, mastery: { ...s.mastery },
    reward: false, streakHits: 0, streakMisses: 0, history: [], statusHistory: [], removed: null,
    instructions: info.instructions || null,       // (filled in by teachdata.addTarget; null only until the migration gives one)
  };
}

// ---------- Teaching instructions ----------
// Each target shows instructions for the adult from a wording template (data/teaching-templates.json, js/templates.js).
// The target keeps only WHICH template and the fields the adult changed; everything else is read from the template.
export const VOICES = ["clinical", "parent"];
export const VOICE_LABELS = { clinical: "Clinical", parent: "Parent" };
export const FIELD_IDS = ["cue", "setup", "when", "reinforcement", "errorCorrection", "notes"];
export const FALLBACK_TEMPLATE = "general";
const MAX_INSTR_TEXT = 3000;

export const newInstructions = (templateId) => ({ templateId, overrides: { clinical: {}, parent: {} } });

// null when there is nothing usable (the template is then assigned by js/templates.js ensureInstructions).
export function cleanInstructions(raw) {
  if (!isObj(raw) || typeof raw.templateId !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(raw.templateId)) return null;
  const out = newInstructions(raw.templateId);
  const o = isObj(raw.overrides) ? raw.overrides : {};
  for (const v of VOICES) {
    const src = isObj(o[v]) ? o[v] : {};
    for (const f of FIELD_IDS) if (typeof src[f] === "string") out.overrides[v][f] = src[f].slice(0, MAX_INSTR_TEXT);
  }
  return out;
}

// {word} = the target word's label, {name} = the learner's name. One pass, so a name that contains "{word}" is not filled again.
export const fillTokens = (text, word, name) => String(text).replace(/\{(word|name)\}/g, (_, k) => (k === "word" ? word : name));
// The reverse, used when the adult edits the text they see: the word and the name go back to tokens so the text can be copied to
// another target or learner. Whole words only, and labels shorter than 3 characters are left alone ("I" would match too much).
export function unfillTokens(text, word, name) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = [];
  if (word && word.length >= 3) parts.push([word, "{word}"]);
  if (name && name.length >= 3) parts.push([name, "{name}"]);
  if (!parts.length) return String(text);
  parts.sort((a, b) => b[0].length - a[0].length);
  const map = new Map(parts);
  const re = new RegExp("(?<![A-Za-z0-9])(" + parts.map((p) => esc(p[0])).join("|") + ")(?![A-Za-z0-9])", "g");
  return String(text).replace(re, (m) => map.get(m) || m);
}

// History entries. from / to are step names ("Model 50%") or, in entries made before Beta 2.3, old level numbers (0 to 7).
function cleanChanges(list, max = 500) {
  const out = [];
  for (const c of Array.isArray(list) ? list.slice(-max) : []) {
    if (!isObj(c)) continue;
    out.push({ time: clampInt(c.time, 0, 4e12, 0), from: typeof c.from === "number" ? clampInt(c.from, 0, 99, 0) : str(c.from, 40),
      to: typeof c.to === "number" ? clampInt(c.to, 0, 99, 0) : str(c.to, 40), reason: str(c.reason, 120),
      dir: c.dir === "less" || c.dir === "more" ? c.dir : "" });
  }
  return out;
}

// A target made before Beta 2.3 has a numeric level (0 to 7) and a "most help" ceiling instead of a ladder. It becomes the default
// ladder with the position the level maps to: 7 -> Model 100%, 6 -> 75%, 5 -> 50%, 4 -> 25%, 3 (path) and 2 (glow) -> 25% (the
// faintest default step), 1 and 0 -> Independent. A target whose "most help allowed" was lowered keeps that limit as a custom
// ladder of only the Model steps up to it. The change is written into the level history (reason "ladder update").
function migrateLegacyLadder(raw, now) {
  const level = clampInt(raw.level, 0, 7, 7), ceiling = clampInt(raw.ceiling, 2, 7, 7);
  const op = legacyOpacity(level);
  let ladderMode = "default", customLadder = null;
  if (ceiling < 7) {
    ladderMode = "custom";
    customLadder = [];
    for (let o = Math.max(1, Math.min(4, ceiling - 3)) * 25; o >= 25; o -= 25) customLadder.push({ type: "model", opacity: o });
  }
  const l = ladderMode === "custom" ? customLadder : defaultLadder("standard");
  const pos = op === null ? l.length : remapPos([{ type: "model", opacity: op }], 0, l);
  const to = op === null ? INDEPENDENT_NAME : stepName(l[pos], ladderMode === "custom");
  return { ladderMode, customLadder, pos,
    entry: { time: now, from: `Old level ${level} (${legacyName(level)})`, to, reason: "ladder update", dir: "" } };
}

// Turn anything (from the database or from a backup file) into a complete, valid target, or null.
export function cleanTarget(raw, learnerId) {
  if (!isObj(raw) || typeof raw.wordId !== "string" || !ID.test(raw.wordId)) return null;
  const s = DEFAULT_SETTINGS, m = isObj(raw.mastery) ? raw.mastery : {};
  const history = cleanChanges(raw.history);
  let ladderMode, customLadder, pos, stepSize = STEP_SIZES[raw.stepSize] ? raw.stepSize : s.stepSize;
  if (raw.ladderVersion === 1) {
    customLadder = cleanLadder(raw.customLadder);
    ladderMode = raw.ladderMode === "custom" && customLadder ? "custom" : "default";
    pos = clampInt(raw.pos, 0, (ladderMode === "custom" ? customLadder.length : defaultLadder(stepSize).length), 0);
  } else {
    const mig = migrateLegacyLadder(raw, Date.now());
    ({ ladderMode, customLadder, pos } = mig);
    history.push(mig.entry);
  }
  return {
    wordId: raw.wordId, learnerId, label: str(raw.label, 60) || raw.wordId,
    pageId: ID.test(raw.pageId || "") ? raw.pageId : "core",
    path: (Array.isArray(raw.path) ? raw.path : []).filter((p) => typeof p === "string" && ID.test(p)).slice(0, 8),
    added: clampInt(raw.added, 0, 4e12, 0),
    status: STATUSES.includes(raw.status) ? raw.status : "teaching",
    direction: DIRECTIONS.includes(raw.direction) ? raw.direction : s.direction,
    ladderVersion: 1, ladderMode, stepSize, customLadder, pos,
    delaySec: clampInt(raw.delaySec, 1, 30, s.delaySec),
    fadeAfter: clampInt(raw.fadeAfter, 1, 20, s.fadeAfter), backUpAfter: clampInt(raw.backUpAfter, 1, 20, s.backUpAfter),
    mastery: {
      pct: clampInt(m.pct, 10, 100, s.mastery.pct), sessions: clampInt(m.sessions, 1, 20, s.mastery.sessions),
      minTrials: clampInt(m.minTrials, 1, 50, s.mastery.minTrials), differentTags: clampInt(m.differentTags, 1, 5, s.mastery.differentTags),
    },
    reward: raw.reward === true,
    streakHits: clampInt(raw.streakHits, 0, 1000, 0), streakMisses: clampInt(raw.streakMisses, 0, 1000, 0),
    history, statusHistory: cleanChanges(raw.statusHistory),
    removed: typeof raw.removed === "number" ? clampInt(raw.removed, 0, 4e12, 0) : null,
    instructions: cleanInstructions(raw.instructions),
  };
}

// ---------- Sessions and trials ----------
// session: { id, learnerId, start, end, who, where, targets: [wordId], notes: "", levelChanges: [{ wordId, label, time, from, to, reason, dir }] }
//   (from / to are step names; sessions made before Beta 2.3 have old level numbers 0 to 7)
export function cleanSession(raw, learnerId) {
  if (!isObj(raw) || typeof raw.id !== "string" || !ID.test(raw.id)) return null;
  const changes = [];
  for (const c of Array.isArray(raw.levelChanges) ? raw.levelChanges.slice(0, 500) : []) {
    if (!isObj(c) || typeof c.wordId !== "string") continue;
    changes.push({ wordId: str(c.wordId, 80), label: str(c.label, 60), time: clampInt(c.time, 0, 4e12, 0),
      from: typeof c.from === "number" ? clampInt(c.from, 0, 7, 0) : str(c.from, 40), to: typeof c.to === "number" ? clampInt(c.to, 0, 7, 0) : str(c.to, 40),
      reason: str(c.reason, 120), dir: c.dir === "less" || c.dir === "more" ? c.dir : "" });
  }
  return {
    id: raw.id, learnerId, start: clampInt(raw.start, 0, 4e12, 0), end: typeof raw.end === "number" ? clampInt(raw.end, 0, 4e12, 0) : null,
    who: str(raw.who, 30), where: str(raw.where, 30),
    targets: (Array.isArray(raw.targets) ? raw.targets : []).filter((w) => typeof w === "string" && ID.test(w)).slice(0, 200),
    notes: str(raw.notes, 2000), levelChanges: changes,
  };
}

export const RESULTS = ["correct", "error", "noResponse", "skipped"];
// trial: { id, sessionId, learnerId, wordId, label, type: "planned"|"NET", start, end, latencyMs,
//          result, direction, errors: [{wordId,label,time}],
//          promptStep: { index, type, opacity, ladderLength, ladderId }   the MOST help shown (type "independent" and index = ladderLength
//                                                                         when no prompt was shown), startStep: the same for where the trial started,
//          help (0 to 1: opacity of promptStep, 0 = independent), startHelp,
//          promptLevel, startLevel   the old 0-7 numbers (best mapping, see legacyLevelOfStep; kept for older readers),
//          chainStepsPrompted: [{ step, label, level, index?, type?, opacity? }], chain: [labels],
//          promptTimeline: [{ level, time, index?, type?, opacity? }] }
// A trial from before Beta 2.3 has no promptStep: its `help` is computed from promptLevel (legacyHelp) when it is read.
function cleanStepRec(v) {
  if (!isObj(v) || !(v.type === "independent" || STEP_TYPES.includes(v.type))) return null;
  return { index: clampInt(v.index, 0, MAX_STEPS, 0), type: v.type, opacity: v.type === "independent" ? 0 : clampInt(v.opacity, 1, 100, 100),
    ladderLength: clampInt(v.ladderLength, 0, MAX_STEPS, 0), ladderId: str(v.ladderId, 40) };
}
const unit = (v, d) => (typeof v === "number" && isFinite(v) ? Math.min(1, Math.max(0, Math.round(v * 1000) / 1000)) : d);
// The help value of a trial (0 to 1): saved, or worked out from the step, or from the old level.
export const trialHelp = (t) => (typeof t.help === "number" ? t.help : t.promptStep ? t.promptStep.opacity / 100 : legacyHelp(t.promptLevel));

export function cleanTrial(raw, learnerId) {
  if (!isObj(raw) || typeof raw.id !== "string" || !ID.test(raw.id) || typeof raw.sessionId !== "string" || typeof raw.wordId !== "string") return null;
  const errors = [];
  for (const e of Array.isArray(raw.errors) ? raw.errors.slice(0, 200) : []) {
    if (isObj(e)) errors.push({ wordId: str(e.wordId, 80), label: str(e.label, 60), time: clampInt(e.time, 0, 4e12, 0) });
  }
  const steps = [];
  for (const c of Array.isArray(raw.chainStepsPrompted) ? raw.chainStepsPrompted.slice(0, 20) : []) {
    if (isObj(c)) {
      const r = { step: clampInt(c.step, -1, 20, 0), label: str(c.label, 60), level: clampInt(c.level, 0, 7, 0) };
      if (STEP_TYPES.includes(c.type)) Object.assign(r, { index: clampInt(c.index, 0, MAX_STEPS, 0), type: c.type, opacity: clampInt(c.opacity, 1, 100, 100) });
      steps.push(r);
    }
  }
  const timeline = [];
  for (const c of Array.isArray(raw.promptTimeline) ? raw.promptTimeline.slice(0, 200) : []) {
    if (!isObj(c)) continue;
    const r = { level: clampInt(c.level, 0, 7, 0), time: clampInt(c.time, 0, 4e12, 0) };
    if (c.type === "independent" || STEP_TYPES.includes(c.type)) Object.assign(r, { index: clampInt(c.index, 0, MAX_STEPS, 0), type: c.type, opacity: clampInt(c.opacity, 0, 100, 0) });
    timeline.push(r);
  }
  const promptStep = cleanStepRec(raw.promptStep), startStep = cleanStepRec(raw.startStep);
  const promptLevel = clampInt(raw.promptLevel, 0, 7, 0), startLevel = clampInt(raw.startLevel, 0, 7, 0);
  return {
    id: raw.id, sessionId: str(raw.sessionId, 80), learnerId, wordId: str(raw.wordId, 80), label: str(raw.label, 60),
    type: raw.type === "NET" ? "NET" : "planned", start: clampInt(raw.start, 0, 4e12, 0), end: clampInt(raw.end, 0, 4e12, 0),
    latencyMs: typeof raw.latencyMs === "number" ? clampInt(raw.latencyMs, 0, 1e9, 0) : null,
    result: RESULTS.includes(raw.result) ? raw.result : "noResponse",
    promptLevel, startLevel, promptStep, startStep,
    help: unit(raw.help, promptStep ? promptStep.opacity / 100 : legacyHelp(promptLevel)),
    startHelp: unit(raw.startHelp, startStep ? startStep.opacity / 100 : legacyHelp(startLevel)),
    direction: DIRECTIONS.includes(raw.direction) ? raw.direction : "mtl",
    errors, chainStepsPrompted: steps, chain: (Array.isArray(raw.chain) ? raw.chain : []).map((x) => str(x, 60)).slice(0, 10), promptTimeline: timeline,
  };
}

// ---------- Scoring ----------
// A trial is INDEPENDENT when the child selected the target having been shown no prompt step (only the wait for the time delay)
// and made no error first. (promptLevel is 0 for such a trial; an old trial at level 0 or 1 counts the same way.)
export const isIndependent = (t) => t.result === "correct" && t.promptLevel <= 1 && (!t.errors || t.errors.length === 0);
// A "hit" for fading: correct, no errors, and no more help than the step the trial started at (a higher step number = less help).
export const isHit = (t) => t.result === "correct" && (!t.errors || t.errors.length === 0) &&
  (t.promptStep && t.startStep ? t.promptStep.index >= t.startStep.index : t.promptLevel <= t.startLevel);

// What a trial needed, as words: "Model 50%", "Custom: Glow 25%", "Independent". Old trials use the old level names.
export function trialStepName(t) {
  if (!t.promptStep) return legacyName(t.promptLevel);
  if (t.promptStep.type === "independent") return INDEPENDENT_NAME;
  return stepName(t.promptStep, t.promptStep.ladderId.startsWith("custom"));
}

// After a trial: update a target's counters and (most-to-least only) its starting step.
// Returns { time, from, to, reason, dir } when the starting step changed (from / to are step names), otherwise null.
// Skipped trials change nothing. Fading moves one step toward Independent, backing up one step toward more help.
export function applyTrialToTarget(target, trial, now = Date.now()) {
  if (trial.result === "skipped" || target.status !== "teaching" || target.direction !== "mtl") return null;
  const n = ladderOf(target).length;
  let change = null;
  if (isHit(trial)) {
    target.streakHits++; target.streakMisses = 0;
    if (target.streakHits >= target.fadeAfter && target.pos < n) {
      change = { time: now, from: posName(target, target.pos), to: posName(target, target.pos + 1), dir: "less", pos: target.pos + 1,
        reason: `faded after ${target.fadeAfter} correct in a row` };
    }
  } else {
    target.streakMisses++; target.streakHits = 0;
    if (target.streakMisses >= target.backUpAfter && target.pos > 0) {
      change = { time: now, from: posName(target, target.pos), to: posName(target, target.pos - 1), dir: "more", pos: target.pos - 1,
        reason: `backed up after ${target.backUpAfter} misses in a row` };
    }
  }
  if (change) {
    target.pos = change.pos; delete change.pos;
    target.history.push({ ...change }); target.streakHits = 0; target.streakMisses = 0;
  }
  return change;
}

// "Faded to Model 25%", "Backed up to Model 50%". An old entry (numbers) uses the old level names.
export function changeText(c) {
  const less = c.dir ? c.dir === "less" : typeof c.from === "number" && typeof c.to === "number" ? c.to < c.from : null;
  const name = typeof c.to === "number" ? legacyName(c.to) : c.to;
  return (less === null ? "Changed to " : less ? "Faded to " : "Backed up to ") + name;
}

// ---------- Session summary ----------
const stepText = (v) => (typeof v === "number" ? legacyName(v) : v);
// One row per target: counts and percents. trials = the session's trials (any order); skipped trials are listed but not scored.
export function summarizeSession(session, trials, targets) {
  const rows = [];
  for (const wordId of session.targets) {
    const mine = trials.filter((t) => t.wordId === wordId);
    const scored = mine.filter((t) => t.result !== "skipped");
    const independent = scored.filter(isIndependent).length;
    const correct = scored.filter((t) => t.result === "correct").length;
    const t = targets.find((x) => x.wordId === wordId);
    const changes = (session.levelChanges || []).filter((c) => c.wordId === wordId);
    rows.push({
      wordId, label: (t && t.label) || (mine[0] && mine[0].label) || wordId,
      trials: scored.length, planned: scored.filter((x) => x.type === "planned").length, net: scored.filter((x) => x.type === "NET").length,
      skipped: mine.length - scored.length, correct, independent,
      errorTrials: scored.filter((x) => x.result === "error").length, noResponse: scored.filter((x) => x.result === "noResponse").length,
      pctIndependent: scored.length ? Math.round((independent / scored.length) * 100) : null,
      changes, startStep: changes.length ? stepText(changes[0].from) : (t ? posName(t) : null),
      endStep: changes.length ? stepText(changes[changes.length - 1].to) : (t ? posName(t) : null),
    });
  }
  return rows;
}

// ---------- Mastery ----------
// Rule (each target uses its own numbers): the target's last `sessions` sessions (those that had any scored trial of the
// word) must EACH have at least `minTrials` trials and at least `pct` percent independent, and those sessions must include
// at least `differentTags` different Who tags OR at least `differentTags` different Where tags.
// Returns { met, reason, sessions: [{ id, start, who, where, trials, pct }] }.
export function masteryCheck(target, sessions, trials) {
  const rule = target.mastery;
  const mine = trials.filter((t) => t.wordId === target.wordId && t.result !== "skipped");
  const bySession = new Map();
  for (const t of mine) {
    if (!bySession.has(t.sessionId)) bySession.set(t.sessionId, []);
    bySession.get(t.sessionId).push(t);
  }
  const used = sessions.filter((s) => bySession.has(s.id)).sort((a, b) => b.start - a.start).slice(0, rule.sessions);
  const info = used.map((s) => {
    const list = bySession.get(s.id);
    return { id: s.id, start: s.start, who: s.who, where: s.where, trials: list.length,
      pct: Math.round((list.filter(isIndependent).length / list.length) * 100) };
  });
  if (info.length < rule.sessions) return { met: false, reason: `only ${info.length} of ${rule.sessions} sessions so far`, sessions: info };
  if (info.some((s) => s.trials < rule.minTrials)) return { met: false, reason: `a session had fewer than ${rule.minTrials} trials`, sessions: info };
  if (info.some((s) => s.pct < rule.pct)) return { met: false, reason: `a session was under ${rule.pct}% independent`, sessions: info };
  const whos = new Set(info.map((s) => s.who).filter(Boolean)), wheres = new Set(info.map((s) => s.where).filter(Boolean));
  if (whos.size < rule.differentTags && wheres.size < rule.differentTags) {
    return { met: false, reason: `needs ${rule.differentTags} different people or settings`, sessions: info };
  }
  return { met: true, reason: "", sessions: info };
}

// The vocabulary stage is ready to move on when the learner has targets among the words of the current stage
// on the main board and every one of them is mastered (or in maintenance). `stageWordIds` = ids of that stage's words.
export function stageReady(stage, stageWordIds, activeTargets) {
  if (stage >= 4) return false;
  const set = new Set(stageWordIds);
  const mine = activeTargets.filter((t) => set.has(t.wordId));
  return mine.length > 0 && mine.every((t) => t.status === "mastered" || t.status === "maintenance");
}
