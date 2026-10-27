// Teaching rules (Phase 2, Round A, beta): the plain rules for targets, prompt levels, automatic fading and
// mastery. Nothing in this file draws anything or touches the screen or the database, so every rule can be
// read (and tested) on its own. The screens are in js/teachui.js, the running session in js/session.js and
// the saving in js/teachdata.js.
//
// PROMPT LEVELS (least to most help). Prompts are visual only; the app never speaks during a trial.
//   0 Independent      no prompt
//   1 Time delay       wait N seconds, nothing shown
//   2 Glow             the next button pulses softly
//   3 Path highlight   the next button gets the Model-mode ring
//   4-7 Model          the learner's Model prompt (critter and/or ring) at 25 / 50 / 75 / 100 percent
// Levels 0 and 1 look the same on the screen (nothing is shown); level 1 just means "the child answered while
// we were still waiting out the time delay".

export const LEVELS = [
  { n: 0, name: "Independent", short: "independent" },
  { n: 1, name: "Time delay", short: "time delay" },
  { n: 2, name: "Glow", short: "glow" },
  { n: 3, name: "Path highlight", short: "path highlight" },
  { n: 4, name: "Model 25%", short: "25% model" },
  { n: 5, name: "Model 50%", short: "50% model" },
  { n: 6, name: "Model 75%", short: "75% model" },
  { n: 7, name: "Model 100%", short: "100% model" },
];
export const MAX_LEVEL = 7;
export const levelName = (n) => (LEVELS[n] || LEVELS[0]).name;
export const levelShort = (n) => (LEVELS[n] || LEVELS[0]).short;
// How strong the Model prompt is at a level (percent). Levels below 4 have none.
export const levelOpacity = (n) => (n >= 4 ? (n - 3) * 25 : 0);

// The next level up (more help). Levels 0 and 1 both go to Glow, so a wait is never spent twice on "nothing".
export function nextLevel(level, ceiling = MAX_LEVEL) {
  const c = Math.max(2, Math.min(MAX_LEVEL, ceiling));
  if (level < 2) return c >= 2 ? 2 : level;
  return Math.min(c, level + 1);
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
  direction: "mtl", level: MAX_LEVEL, ceiling: MAX_LEVEL, delaySec: 3,
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
//     status, direction, level (the starting prompt level), ceiling, delaySec, fadeAfter, backUpAfter,
//     mastery: { pct, sessions, minTrials, differentTags },
//     reward: false (a picture is stored in the photos under "reward:<wordId>"),
//     streakHits, streakMisses,
//     history: [{ time, from, to, reason }]          every change of the starting level
//     statusHistory: [{ time, from, to, reason }]    every change of status
//     removed: null | time }                         removed targets keep their history
export function newTarget(learnerId, info, now = Date.now()) {
  const s = DEFAULT_SETTINGS;
  return {
    wordId: info.wordId, learnerId, label: info.label, pageId: info.pageId || "core", path: info.path || [], added: now,
    status: "teaching", direction: s.direction, level: s.level, ceiling: s.ceiling, delaySec: s.delaySec,
    fadeAfter: s.fadeAfter, backUpAfter: s.backUpAfter, mastery: { ...s.mastery },
    reward: false, streakHits: 0, streakMisses: 0, history: [], statusHistory: [], removed: null,
  };
}

function cleanChanges(list, max = 500) {
  const out = [];
  for (const c of Array.isArray(list) ? list.slice(-max) : []) {
    if (!isObj(c)) continue;
    out.push({ time: clampInt(c.time, 0, 4e12, 0), from: typeof c.from === "number" ? clampInt(c.from, 0, 99, 0) : str(c.from, 20),
      to: typeof c.to === "number" ? clampInt(c.to, 0, 99, 0) : str(c.to, 20), reason: str(c.reason, 120) });
  }
  return out;
}

// Turn anything (from the database or from a backup file) into a complete, valid target, or null.
export function cleanTarget(raw, learnerId) {
  if (!isObj(raw) || typeof raw.wordId !== "string" || !ID.test(raw.wordId)) return null;
  const s = DEFAULT_SETTINGS, m = isObj(raw.mastery) ? raw.mastery : {};
  const ceiling = clampInt(raw.ceiling, 2, MAX_LEVEL, s.ceiling);
  return {
    wordId: raw.wordId, learnerId, label: str(raw.label, 60) || raw.wordId,
    pageId: ID.test(raw.pageId || "") ? raw.pageId : "core",
    path: (Array.isArray(raw.path) ? raw.path : []).filter((p) => typeof p === "string" && ID.test(p)).slice(0, 8),
    added: clampInt(raw.added, 0, 4e12, 0),
    status: STATUSES.includes(raw.status) ? raw.status : "teaching",
    direction: DIRECTIONS.includes(raw.direction) ? raw.direction : s.direction,
    level: clampInt(raw.level, 0, ceiling, s.level), ceiling,
    delaySec: clampInt(raw.delaySec, 1, 30, s.delaySec),
    fadeAfter: clampInt(raw.fadeAfter, 1, 20, s.fadeAfter), backUpAfter: clampInt(raw.backUpAfter, 1, 20, s.backUpAfter),
    mastery: {
      pct: clampInt(m.pct, 10, 100, s.mastery.pct), sessions: clampInt(m.sessions, 1, 20, s.mastery.sessions),
      minTrials: clampInt(m.minTrials, 1, 50, s.mastery.minTrials), differentTags: clampInt(m.differentTags, 1, 5, s.mastery.differentTags),
    },
    reward: raw.reward === true,
    streakHits: clampInt(raw.streakHits, 0, 1000, 0), streakMisses: clampInt(raw.streakMisses, 0, 1000, 0),
    history: cleanChanges(raw.history), statusHistory: cleanChanges(raw.statusHistory),
    removed: typeof raw.removed === "number" ? clampInt(raw.removed, 0, 4e12, 0) : null,
  };
}

// ---------- Sessions and trials ----------
// session: { id, learnerId, start, end, who, where, targets: [wordId], notes: "", levelChanges: [...] }
export function cleanSession(raw, learnerId) {
  if (!isObj(raw) || typeof raw.id !== "string" || !ID.test(raw.id)) return null;
  const changes = [];
  for (const c of Array.isArray(raw.levelChanges) ? raw.levelChanges.slice(0, 500) : []) {
    if (!isObj(c) || typeof c.wordId !== "string") continue;
    changes.push({ wordId: str(c.wordId, 80), label: str(c.label, 60), time: clampInt(c.time, 0, 4e12, 0),
      from: clampInt(c.from, 0, 7, 0), to: clampInt(c.to, 0, 7, 0), reason: str(c.reason, 120) });
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
//          result, promptLevel, startLevel, direction, errors: [{wordId,label,time}],
//          chainStepsPrompted: [{ step, label, level }], chain: [labels], promptTimeline: [{ level, time }] }
export function cleanTrial(raw, learnerId) {
  if (!isObj(raw) || typeof raw.id !== "string" || !ID.test(raw.id) || typeof raw.sessionId !== "string" || typeof raw.wordId !== "string") return null;
  const errors = [];
  for (const e of Array.isArray(raw.errors) ? raw.errors.slice(0, 200) : []) {
    if (isObj(e)) errors.push({ wordId: str(e.wordId, 80), label: str(e.label, 60), time: clampInt(e.time, 0, 4e12, 0) });
  }
  const steps = [];
  for (const c of Array.isArray(raw.chainStepsPrompted) ? raw.chainStepsPrompted.slice(0, 20) : []) {
    if (isObj(c)) steps.push({ step: clampInt(c.step, -1, 20, 0), label: str(c.label, 60), level: clampInt(c.level, 0, 7, 0) });
  }
  const timeline = [];
  for (const c of Array.isArray(raw.promptTimeline) ? raw.promptTimeline.slice(0, 200) : []) {
    if (isObj(c)) timeline.push({ level: clampInt(c.level, 0, 7, 0), time: clampInt(c.time, 0, 4e12, 0) });
  }
  return {
    id: raw.id, sessionId: str(raw.sessionId, 80), learnerId, wordId: str(raw.wordId, 80), label: str(raw.label, 60),
    type: raw.type === "NET" ? "NET" : "planned", start: clampInt(raw.start, 0, 4e12, 0), end: clampInt(raw.end, 0, 4e12, 0),
    latencyMs: typeof raw.latencyMs === "number" ? clampInt(raw.latencyMs, 0, 1e9, 0) : null,
    result: RESULTS.includes(raw.result) ? raw.result : "noResponse",
    promptLevel: clampInt(raw.promptLevel, 0, 7, 0), startLevel: clampInt(raw.startLevel, 0, 7, 0),
    direction: DIRECTIONS.includes(raw.direction) ? raw.direction : "mtl",
    errors, chainStepsPrompted: steps, chain: (Array.isArray(raw.chain) ? raw.chain : []).map((x) => str(x, 60)).slice(0, 10), promptTimeline: timeline,
  };
}

// ---------- Scoring ----------
// A trial is INDEPENDENT when the child selected the target having seen no more than "time delay" and made no error first.
export const isIndependent = (t) => t.result === "correct" && t.promptLevel <= 1 && (!t.errors || t.errors.length === 0);
// A "hit" for fading: correct, no errors, and no more help than the level the trial started at.
export const isHit = (t) => t.result === "correct" && (!t.errors || t.errors.length === 0) && t.promptLevel <= t.startLevel;

// After a trial: update a target's counters and (most-to-least only) its starting level.
// Returns { from, to, reason } when the starting level changed, otherwise null. Skipped trials change nothing.
export function applyTrialToTarget(target, trial, now = Date.now()) {
  if (trial.result === "skipped" || target.status !== "teaching" || target.direction !== "mtl") return null;
  let change = null;
  if (isHit(trial)) {
    target.streakHits++; target.streakMisses = 0;
    if (target.streakHits >= target.fadeAfter && target.level > 0) {
      change = { time: now, from: target.level, to: target.level - 1, reason: `faded after ${target.fadeAfter} correct in a row` };
    }
  } else {
    target.streakMisses++; target.streakHits = 0;
    if (target.streakMisses >= target.backUpAfter && target.level < target.ceiling) {
      change = { time: now, from: target.level, to: target.level + 1, reason: `backed up after ${target.backUpAfter} misses in a row` };
    }
  }
  if (change) { target.level = change.to; target.history.push(change); target.streakHits = 0; target.streakMisses = 0; }
  return change;
}

export const changeText = (from, to) => (to < from ? "Faded to " : "Backed up to ") + levelShort(to);

// ---------- Session summary ----------
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
      changes, startLevel: changes.length ? changes[0].from : (t ? t.level : null), endLevel: changes.length ? changes[changes.length - 1].to : (t ? t.level : null),
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
