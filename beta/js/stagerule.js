// When is a learner ready for the next vocabulary stage? (Beta 3.22, Richard's rule.) A SUGGESTION to the adult, never automatic.
//
// The words that count are the MAIN-BOARD words revealed at the learner's current stage (on the 45 board: 6 at stage 1, 9 at stage 2...).
// A word is PROFICIENT when either:
//   - it is a mastered teaching target (status Mastered or Maintenance), or
//   - the learner used it on their own in everyday use (not modeled, not in a session) on at least `days` different days in the last
//     `weeks` weeks (default 3 days in 4 weeks). Word forms count for their word (wanted -> want).
// The clinician chooses ONE way to decide (Adult menu > Vocabulary stage, Clinician view):
//   percent  at least pct% of the stage's words are proficient (slider 10-100%, default 50%; at least one word)
//   words    every word the clinician ticked for this stage is proficient (a separate list for each stage)
// Settings live per learner in profile.stageRule = { mode, pct, words: { "1": [ids], "2": [...] }, days, weeks }.
import { listDaily, localDate } from "./everyday.js";
import { normSize, maxStageFor } from "./boardmodel.js";

export const DEFAULT_STAGE_RULE = { mode: "percent", pct: 50, words: {}, days: 3, weeks: 4, s5: null };
// STAGE 5 (Beta 3.26, Richard's numbers, Nov 11): stage 4 -> 5 is not about main-board words (stage 5 adds folders only). It is
// suggested when ALL of these are true (Clinician view can change each number):
//   targets    mastered targets (word and sentence targets; Mastered or Maintenance)            default 10
//   sentences  of which sentence targets                                                          default 1
//   words      different words used on their own (everyday use, learner taps) in the last weeks  default 100
//   multiPct   share of messages with 2 or more words in the same weeks                          default 30%
//   weeks      the everyday-use window                                                            default 4
export const DEFAULT_S5 = { targets: 10, sentences: 1, words: 100, multiPct: 30, weeks: 4 };
export const cleanS5 = (raw) => {
  const o = raw && typeof raw === "object" ? raw : {};
  const int = (v, d, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
  return { targets: int(o.targets, 10, 0, 200), sentences: int(o.sentences, 1, 0, 50), words: int(o.words, 100, 0, 2000),
    multiPct: int(o.multiPct, 30, 0, 100), weeks: int(o.weeks, 4, 1, 12) };
};
export const MAX_STAGE = 4;
// THE 24 BOARD (Beta 3.25) has stages 1-3. Its "next stage" is moving up to the 45 board, where the learner starts at stage 2
// (a new motor plan; word ids are shared, so targets and everyday use carry over). progressFor() says so with moveUp: true.
export const MOVE_UP = { gridSize: 45, stage: 2 };

export function cleanStageRule(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const int = (v, d, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
  const words = {};
  if (o.words && typeof o.words === "object") {
    for (const [k, list] of Object.entries(o.words)) {
      if (/^[1-9]$/.test(k) && Array.isArray(list)) words[k] = [...new Set(list.filter((x) => typeof x === "string").map((x) => x.slice(0, 90)))].slice(0, 200);
    }
  }
  return {
    mode: o.mode === "words" ? "words" : "percent",
    pct: Math.round(int(o.pct, 50, 10, 100) / 10) * 10,
    words,
    days: int(o.days, 3, 1, 14),
    weeks: int(o.weeks, 4, 1, 12),
    s5: cleanS5(o.s5),
  };
}

/** Days of independent everyday use per word id in the last `weeks` weeks, from the daily summaries (learner taps only). */
export function usageDays(daily, weeks, now = Date.now()) {
  const from = localDate(now - weeks * 7 * 86400000);
  const out = new Map();
  for (const d of daily) {
    if (d.date <= from) continue;
    const seen = new Set();
    for (const key of Object.keys(d.wordCounts || {})) {
      if (key.startsWith("~")) continue;
      seen.add(key.split("+")[0]);
    }
    for (const id of seen) out.set(id, (out.get(id) || 0) + 1);
  }
  return out;
}

/**
 * Pure: the progress toward the next stage.
 *   stageWords  [{ id, label }] main-board words of the current stage
 *   targets     the learner's targets (word targets; sentence targets are ignored here)
 *   days        Map word id -> days of independent everyday use in the window
 * Returns { items: [{ id, label, proficient, why, days, chosen }], have, need, ready, mode, note }
 */
export function stageProgress({ stage, stageWords, targets, days, rule, max = MAX_STAGE, moveUp = false }) {
  const r = cleanStageRule(rule);
  const mastered = new Set(targets.filter((t) => !t.removed && t.kind !== "chain" && (t.status === "mastered" || t.status === "maintenance")).map((t) => t.wordId));
  const chosen = new Set((r.words[String(stage)] || []).filter((id) => stageWords.some((w) => w.id === id)));
  const items = stageWords.map((w) => {
    const n = days.get(w.id) || 0;
    const isMastered = mastered.has(w.id), used = n >= r.days;
    return { id: w.id, label: w.label, days: n, chosen: chosen.has(w.id), proficient: isMastered || used,
      why: isMastered ? "Mastered target" : used ? `Used on ${n} days` : n ? `Used on ${n} ${n === 1 ? "day" : "days"}` : "Not yet" };
  });
  let have, need, ready, note = "";
  if (r.mode === "words") {
    const list = items.filter((i) => i.chosen);
    have = list.filter((i) => i.proficient).length;
    need = list.length;
    ready = need > 0 && have === need;
    if (!need) note = "No words are chosen for this stage yet.";
  } else {
    have = items.filter((i) => i.proficient).length;
    need = Math.max(1, Math.ceil((r.pct / 100) * items.length));
    ready = items.length > 0 && have >= need;
  }
  if (stage >= max && !moveUp) ready = false;
  return { items, have, need, ready, mode: r.mode, pct: r.pct, note, moveUp };
}

/**
 * Pure: readiness for stage 5 (see DEFAULT_S5). daily = the learner's daily summaries (any range; only the last `weeks` count).
 * Returns the same shape as stageProgress: { items: [{ id, label, proficient, why }], have, need, ready, mode: "stage5", note, s5 }.
 */
export function stage5Progress({ targets, daily, s5, now = Date.now() }) {
  const r = cleanS5(s5);
  const live = targets.filter((t) => !t.removed && (t.status === "mastered" || t.status === "maintenance"));
  const sentences = live.filter((t) => t.kind === "chain").length;
  const from = localDate(now - r.weeks * 7 * 86400000);
  const seen = new Set(); let msgs = 0, multi = 0;
  for (const d of daily) {
    if (d.date <= from) continue;
    for (const k of d.uniqueWords || Object.keys(d.wordCounts || {})) if (!String(k).startsWith("~")) seen.add(String(k).split("+")[0]);
    msgs += d.utterances || 0; multi += d.multiWordUtterances || 0;
  }
  const pct = msgs ? Math.round((multi / msgs) * 100) : 0;
  const items = [
    { id: "s5-targets", label: "Mastered targets", have: live.length, need: r.targets, why: `${live.length} of ${r.targets}` },
    { id: "s5-sentences", label: "Mastered sentence targets", have: sentences, need: r.sentences, why: `${sentences} of ${r.sentences}` },
    { id: "s5-words", label: `Different words used on their own (last ${r.weeks} weeks)`, have: seen.size, need: r.words, why: `${seen.size} of ${r.words}` },
    { id: "s5-multi", label: `Messages with 2 or more words (last ${r.weeks} weeks)`, have: pct, need: r.multiPct, why: msgs ? `${pct}% of ${msgs} (needs ${r.multiPct}%)` : "No messages yet" },
  ].map((i) => ({ ...i, proficient: i.have >= i.need }));
  const have = items.filter((i) => i.proficient).length;
  return { items, have, need: items.length, ready: have === items.length, mode: "stage5", pct: 0, note: "", moveUp: false, s5: r };
}

/** Everything together for a learner (reads the daily summaries). model = buildModel(board, profile.gridSize). */
export async function progressFor(profile, model, targets) {
  const rule = cleanStageRule(profile.stageRule);
  if (profile.stage === 4 && normSize(profile.gridSize) !== 24) {
    return stage5Progress({ targets, daily: await listDaily(profile.id), s5: rule.s5 });
  }
  const stageWords = model.main.filter((b) => b.stage === profile.stage).map((b) => ({ id: b.id, label: (profile.words && profile.words[b.id] && profile.words[b.id].label) || b.label }));
  const days = usageDays(await listDaily(profile.id), rule.weeks);
  const max = maxStageFor(profile.gridSize);
  const moveUp = normSize(profile.gridSize) === 24 && profile.stage >= max;   // 24 board, last stage: the next step is the 45 board
  return stageProgress({ stage: profile.stage, stageWords, targets, days, rule, max, moveUp });
}

/** Is there a next step to suggest for this learner (a next stage, or the 24 board's move up)? */
export function hasNextStep(profile) {
  return profile.stage < maxStageFor(profile.gridSize) || normSize(profile.gridSize) === 24;
}
