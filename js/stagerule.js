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

export const DEFAULT_STAGE_RULE = { mode: "percent", pct: 50, words: {}, days: 3, weeks: 4 };
export const MAX_STAGE = 4;

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
export function stageProgress({ stage, stageWords, targets, days, rule }) {
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
  if (stage >= MAX_STAGE) ready = false;
  return { items, have, need, ready, mode: r.mode, pct: r.pct, note };
}

/** Everything together for a learner (reads the daily summaries). model = buildModel(board, profile.gridSize). */
export async function progressFor(profile, model, targets) {
  const rule = cleanStageRule(profile.stageRule);
  const stageWords = model.main.filter((b) => b.stage === profile.stage).map((b) => ({ id: b.id, label: (profile.words && profile.words[b.id] && profile.words[b.id].label) || b.label }));
  const days = usageDays(await listDaily(profile.id), rule.weeks);
  return stageProgress({ stage: profile.stage, stageWords, targets, days, rule });
}
