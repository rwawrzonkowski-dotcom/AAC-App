// Reports (Phase 2, Round C, beta): the NUMBERS behind every graph, table, summary and export. Nothing in this file draws anything,
// touches the screen or reads the database, so every figure can be read (and checked) on its own. The graphs are drawn in
// js/reportcharts.js, the screens in js/reports.js, the printable pages in js/reportdoc.js and the spreadsheet files in js/reportexport.js.
//
// TWO KINDS OF DATA
//   Teaching  targets, sessions and trials (js/teachdata.js). A session has Who and Where tags, so the Who / Where filters work here.
//   Everyday  the daily summaries (js/everyday.js), one row per day. Only words the LEARNER chose count: taps made by an adult in
//             Model mode and taps during a teaching session are already left out of the daily numbers. Everyday use has no Who / Where
//             tag, so those two filters do not change the everyday graphs.
// A report only reads and adds up; it never changes any saved row.
import * as T from "./teaching.js";
import { localDate, dayStart } from "./everyday.js";

const DAY = 86400000;
export const HOW_NAMES = { board: "Main board", page: "Category and Words pages", forms: "Forms button", dial: "Press-and-hold dial",
  keyboard: "Keyboard (ABC)", numberpad: "Number pad", scene: "Scene strip", "photo scene": "Scene photo" };
export const HOW_IDS = Object.keys(HOW_NAMES);

// ---------------------------------------------------------------- dates
export function addDays(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + n).getTime());
}
export const daysBetween = (a, b) => Math.round((dayStart(b) - dayStart(a)) / DAY);
/** The Monday (local) of the week a "YYYY-MM-DD" day is in. */
export function weekStart(date) {
  const [y, m, d] = date.split("-").map(Number);
  return addDays(date, -((new Date(y, m - 1, d).getDay() + 6) % 7));
}
const validDate = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
/** "Oct 28" (and the year when it is not this year). */
export function niceDate(date, withYear = false) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: "short", day: "numeric", ...(withYear || y !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}
/** "5/12" for a graph label. */
export const shortDate = (date) => `${+date.slice(5, 7)}/${+date.slice(8, 10)}`;
export const clock = (t) => { const d = new Date(t); const p = (n) => String(n).padStart(2, "0"); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };

// ---------------------------------------------------------------- the date range
export const RANGE_CHOICES = [
  { id: "2w", label: "Last 2 weeks", days: 14 }, { id: "4w", label: "Last 4 weeks", days: 28 }, { id: "12w", label: "Last 12 weeks", days: 84 },
  { id: "all", label: "All" }, { id: "custom", label: "Custom" },
];
/**
 * spec = { id: "2w" | "4w" | "12w" | "all" | "custom", from?: "YYYY-MM-DD", to?: "YYYY-MM-DD" }; firstDate = the earliest day with any data (for "All").
 * Returns { id, fromDate, toDate (both inclusive local days), from, to (ms; `to` is the start of the day AFTER toDate), isAll, label, phrase }.
 * Today counts as the last day of "Last N weeks".
 */
export function resolveRange(spec, now = Date.now(), firstDate = null) {
  const today = localDate(now);
  let fromDate = today, toDate = today;
  const choice = RANGE_CHOICES.find((c) => c.id === spec.id) || RANGE_CHOICES[1];
  if (choice.id === "custom") {
    fromDate = validDate(spec.from) || today; toDate = validDate(spec.to) || today;
    if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];
  } else if (choice.id === "all") {
    fromDate = firstDate && firstDate <= today ? firstDate : today;
  } else fromDate = addDays(today, -(choice.days - 1));
  const text = `${niceDate(fromDate, true)} to ${niceDate(toDate, true)}`;
  return {
    id: choice.id, fromDate, toDate, from: choice.id === "all" ? 0 : dayStart(fromDate), to: dayStart(addDays(toDate, 1)), isAll: choice.id === "all",
    label: choice.id === "all" ? `All data (${text})` : choice.id === "custom" ? text : `${choice.label} (${text})`,
    phrase: choice.id === "custom" || choice.id === "all" ? `From ${niceDate(fromDate, true)} to ${niceDate(toDate, true)}` : `In the ${choice.label.toLowerCase().replace("last", "last")}`,
  };
}
/** Every local day from fromDate to toDate, inclusive. */
export function dateList(fromDate, toDate) {
  const out = [];
  for (let d = fromDate, guard = 0; d <= toDate && guard < 4000; d = addDays(d, 1), guard++) out.push(d);
  return out;
}

// ---------------------------------------------------------------- teaching
/** The status a target had at a moment, from its history of status changes. */
export function statusAt(target, time) {
  const hist = (target.statusHistory || []).slice().sort((a, b) => a.time - b.time);
  let s = hist.length && T.STATUSES.includes(hist[0].from) ? hist[0].from : target.status;
  for (const c of hist) if (c.time <= time && T.STATUSES.includes(c.to)) s = c.to;
  return s;
}
/** "default-10" -> "10% steps"; "custom-x1" -> "custom ladder". */
export function ladderLabel(id) {
  const m = /^default-(\d+)$/.exec(id || "");
  return m ? `${m[1]}% steps` : "custom ladder";
}
/** What the target's prompt is now, in a few words. */
export const stepNow = (t) => (T.isProbe(t) ? "No prompts" : t.direction === "ltm" ? "Least-to-most" : T.posName(t));

/**
 * Teaching numbers for the chosen range and filters.
 *   targets   every target of the learner (removed ones too)       sessions, trials   all of the learner's rows
 *   range     from resolveRange()      who, where   "" for everybody
 * Returns { sessions: [session rows, oldest first], targets: [target models], sessionList: [{ session, rows }] (newest first), totals }.
 * A target model has its `series` (one point per session in which the word had at least one scored trial) and the phase lines.
 */
export function teachingModel({ targets, sessions, trials, range, who = "", where = "" }) {
  const inScope = sessions.filter((s) => s.start >= range.from && s.start < range.to && (!who || s.who === who) && (!where || s.where === where))
    .sort((a, b) => a.start - b.start);
  const ids = new Set(inScope.map((s) => s.id));
  const scoped = trials.filter((t) => ids.has(t.sessionId));
  const byWord = new Map();                       // wordId -> sessionId -> scored trials
  for (const t of scoped) {
    if (t.result === "skipped") continue;
    let m = byWord.get(t.wordId);
    if (!m) byWord.set(t.wordId, (m = new Map()));
    let l = m.get(t.sessionId);
    if (!l) m.set(t.sessionId, (l = []));
    l.push(t);
  }
  const out = [];
  for (const target of targets) {
    const per = byWord.get(target.wordId);
    if (target.removed && !per) continue;
    out.push(targetModel(target, inScope, per || new Map(), sessions, trials, range));
  }
  out.sort((a, b) => (a.target.added || 0) - (b.target.added || 0) || (a.label < b.label ? -1 : 1));
  const sessionList = inScope.slice().reverse().map((session) => {
    const mine = scoped.filter((t) => t.sessionId === session.id);
    return { session, rows: T.summarizeSession(session, mine, targets).map((r) => ({ ...r, stepText: rowStepText(r, mine, targets.find((t) => t.wordId === r.wordId), session) })) };
  });
  return { sessions: inScope, targets: out, sessionList,
    totals: { sessions: inScope.length, trials: scoped.filter((t) => t.result !== "skipped").length } };
}

// One session's prompt text for one word, as a sentence: what changed, or where the trials started.
function rowStepText(row, sessionTrials, target, session) {
  if (row.changes.length) return row.changes.map((c) => T.changeText(c)).join(", ");
  if (target && statusAt(target, session.start) !== "teaching") return "No prompts used";
  const mine = sessionTrials.filter((t) => t.wordId === row.wordId).sort((a, b) => a.start - b.start);
  if (!mine.length) return "-";
  if (mine[0].direction === "ltm") return "Least-to-most";
  const s = mine[0].startStep;
  return "Stayed at " + (s ? (s.type === "independent" ? T.INDEPENDENT_NAME : T.stepName(s, (s.ladderId || "").startsWith("custom"))) : T.legacyName(mine[0].startLevel));
}

function targetModel(target, inScope, per, allSessions, allTrials, range) {
  const series = [];
  for (const s of inScope) {
    const list = per.get(s.id);
    if (!list || !list.length) continue;
    const indep = list.filter(T.isIndependent).length;
    const first = list.slice().sort((a, b) => a.start - b.start)[0];
    const ladderId = (first.promptStep && first.promptStep.ladderId) || (first.startStep && first.startStep.ladderId) || null;
    series.push({
      n: series.length + 1, sessionId: s.id, start: s.start, date: localDate(s.start), who: s.who, where: s.where,
      trials: list.length, independent: indep, pct: (indep / list.length) * 100,
      help: list.reduce((n, t) => n + T.trialHelp(t), 0) / list.length,
      planned: list.filter((t) => t.type === "planned").length, net: list.filter((t) => t.type === "NET").length,
      ladderId, status: statusAt(target, s.start),
    });
  }
  const lines = phaseLines(target, series, range);
  const trialsTotal = series.reduce((n, p) => n + p.trials, 0), indepTotal = series.reduce((n, p) => n + p.independent, 0);
  return {
    target, wordId: target.wordId, label: target.label, status: target.status, series, lines,
    startPhase: series.length ? series[0].status : target.status,
    segments: segmentsOf(series, lines),
    sessionCount: series.length, trialCount: trialsTotal, pctAll: trialsTotal ? (indepTotal / trialsTotal) * 100 : null,
    last3: series.slice(-3).map((p) => Math.round(p.pct)),
    stepText: stepNow(target), masteryPct: target.mastery.pct,
    mastery: masteryProgress(target, allSessions.filter((s) => s.start < range.to), allTrials),
    trailing: lines.some((l) => l.x > series.length + 0.25),
  };
}

// The vertical "phase change" lines of one target's graph. A line sits BETWEEN two sessions (x = 3.5 is between sessions 3 and 4):
//   - every change of status (Baseline / Teaching / Mastered / Maintenance), at the first session that started after the change;
//   - every change of prompt ladder or step size, seen in the ladder id saved with the trials (plus the changes the adult logged).
// A change before the first session shown is not a line (the first phase is named at the left edge); one after the last session is a
// line at the right edge.
function phaseLines(target, series, range) {
  const lines = new Map();
  const add = (k, text, kind) => {
    const x = k + 0.5, l = lines.get(x) || { x, k, texts: [], kinds: [] };
    if (kind === "ladder" && l.kinds.includes("ladder")) return;
    l.texts.push(text); l.kinds.push(kind); lines.set(x, l);
  };
  const before = (time) => series.filter((p) => p.start <= time).length;
  for (const c of (target.statusHistory || []).slice().sort((a, b) => a.time - b.time)) {
    if (c.time >= range.to || c.to === c.from || !T.STATUSES.includes(c.to)) continue;
    const k = before(c.time);
    if (k > 0) add(k, T.STATUS_LABELS[c.to], "status");
  }
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1].ladderId, b = series[i].ladderId;
    if (a && b && a !== b) add(i, "Ladder: " + ladderLabel(b), "ladder");
  }
  for (const c of target.history || []) {
    if (c.time >= range.to || !/ladder/i.test(c.reason || "")) continue;
    const k = before(c.time);
    if (k > 0 && !(lines.get(k + 0.5) || { kinds: [] }).kinds.includes("ladder")) add(k, "Ladder changed", "ladder");
  }
  return [...lines.values()].sort((a, b) => a.x - b.x);
}
// The runs of sessions that are joined by a line (a run ends at each phase line).
function segmentsOf(series, lines) {
  const segs = [];
  let cur = [];
  series.forEach((p, i) => {
    if (cur.length && lines.some((l) => l.x > series[i - 1].n && l.x < p.n)) { segs.push(cur); cur = []; }
    cur.push(i);
  });
  if (cur.length) segs.push(cur);
  return segs;
}

// "2 of 3 sessions at 80% or more; 1 of 2 people or settings". Uses the target's own rule and its last sessions up to the end of the
// range (every Who / Where, so the answer does not change with the filter).
export function masteryProgress(target, sessions, trials) {
  const rule = target.mastery;
  const check = T.masteryCheck(target, sessions, trials);
  const used = check.sessions;
  const good = used.filter((s) => s.trials >= rule.minTrials && s.pct >= rule.pct).length;
  const whos = new Set(used.map((s) => s.who).filter(Boolean)), wheres = new Set(used.map((s) => s.where).filter(Boolean));
  const people = Math.max(whos.size, wheres.size);
  return { met: check.met, goodSessions: good, needSessions: rule.sessions, people, needPeople: rule.differentTags, usedSessions: used.length,
    text: `${good} of ${rule.sessions} sessions at ${rule.pct}% or more; ${Math.min(people, rule.differentTags)} of ${rule.differentTags} people/settings` };
}

// ---------------------------------------------------------------- everyday use
const labelOfKey = (key, labels) => labels.get(key) || (key.startsWith("~") ? key.slice(1) : key.includes("+") ? key.split("+")[1] : key);

/**
 * Everyday numbers from the daily summaries.
 *   daily     the learner's daily rows              firstSeen   the learner's first-use rows (word key, label, time, date)
 *   range     from resolveRange()
 *   rawEvents / rawUtterances   optional: the raw rows of days saved before Beta 2.5 (they lack how-reached and message-length
 *                               totals); anything else is read from the daily rows
 */
export function everydayModel({ daily, firstSeen, range, rawEvents = [], rawUtterances = [] }) {
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const labels = new Map(firstSeen.map((f) => [f.key, f.label]));
  const days = dateList(range.fromDate, range.toDate);
  // Days saved before Beta 2.5 get their how-reached counts and message word totals from the raw rows.
  const rawHow = new Map(), rawWords = new Map(), rawCount = new Map();
  for (const e of rawEvents) {
    if (e.mode !== "learner") continue;
    const m = rawHow.get(localDate(e.time)) || {};
    m[e.how] = (m[e.how] || 0) + 1; rawHow.set(localDate(e.time), m);
  }
  for (const u of rawUtterances) {
    const d = localDate(u.time);
    rawWords.set(d, (rawWords.get(d) || 0) + u.chips.length); rawCount.set(d, (rawCount.get(d) || 0) + 1);
  }
  let baseNew = 0;
  for (const d of daily) if (d.date < range.fromDate) baseNew += d.newWords;
  let run = baseNew;
  const dayRows = days.map((date) => {
    const d = byDate.get(date);
    run += d ? d.newWords : 0;
    const taps = d ? d.learnerTaps : 0, utt = d ? d.utterances : 0;
    let words = d && d.utteranceWords !== null ? d.utteranceWords : null;
    if (utt > 0 && words === null && rawCount.get(date) === utt) words = rawWords.get(date);       // (all of that day's messages were still saved)
    let how = d && d.howCounts ? d.howCounts : null;
    if (taps > 0 && !how && rawHow.has(date)) how = rawHow.get(date);
    return { date, taps, unique: d ? d.uniqueWords.length : 0, uniqueKeys: d ? d.uniqueWords : [], newWords: d ? d.newWords : 0, cumulative: run,
      utterances: utt, multi: d ? d.multiWordUtterances : 0, longest: d ? d.longestUtterance : 0, uttWords: utt > 0 ? words : 0,
      how, counts: d ? d.wordCounts : {} };
  });
  const bucket = days.length > 120 ? "week" : "day";
  const keyOf = (date) => (bucket === "week" ? weekStart(date) : date);
  const groups = new Map();
  for (const r of dayRows) {
    const k = keyOf(r.date);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { key: k, taps: 0, set: new Set(), cumulative: 0, newWords: 0 }));
    g.taps += r.taps; r.uniqueKeys.forEach((u) => g.set.add(u)); g.cumulative = r.cumulative; g.newWords += r.newWords;
  }
  const bars = [...groups.values()].map((g) => ({ key: g.key, taps: g.taps, unique: g.set.size, newWords: g.newWords, cumulative: g.cumulative }));

  // Weeks: average message length and the share of messages with two or more words.
  const weeks = new Map();
  for (const r of dayRows) {
    const k = weekStart(r.date);
    let w = weeks.get(k);
    if (!w) weeks.set(k, (w = { key: k, utterances: 0, multi: 0, words: 0, wordsUtt: 0 }));
    w.utterances += r.utterances; w.multi += r.multi;
    if (r.uttWords !== null) { w.words += r.uttWords; w.wordsUtt += r.utterances; }
  }
  const weekRows = [...weeks.values()].map((w) => ({ key: w.key, utterances: w.utterances,
    mlu: w.wordsUtt ? w.words / w.wordsUtt : null, pctMulti: w.utterances ? (w.multi / w.utterances) * 100 : null }));

  // Words used most, and how they were reached.
  const counts = new Map();
  for (const r of dayRows) for (const [k, n] of Object.entries(r.counts)) counts.set(k, (counts.get(k) || 0) + n);
  const topAll = [...counts.entries()].map(([key, n]) => ({ key, label: labelOfKey(key, labels), count: n }))
    .sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : 1));
  const how = {};
  let howTaps = 0, tapsTotal = 0;
  for (const r of dayRows) {
    tapsTotal += r.taps;
    if (r.how) for (const [k, n] of Object.entries(r.how)) { how[k] = (how[k] || 0) + n; howTaps += n; }
  }
  const newestWords = firstSeen.filter((f) => f.time >= range.from && f.time < range.to).sort((a, b) => b.time - a.time)
    .map((f) => ({ key: f.key, label: f.label, date: f.date, time: f.time }));
  const utts = dayRows.reduce((n, r) => n + r.utterances, 0), multi = dayRows.reduce((n, r) => n + r.multi, 0);
  const wordsKnown = dayRows.reduce((n, r) => n + (r.uttWords !== null ? r.uttWords : 0), 0), uttKnown = dayRows.reduce((n, r) => n + (r.uttWords !== null ? r.utterances : 0), 0);
  const longestRow = dayRows.reduce((best, r) => (r.longest > 0 && r.longest >= (best ? best.longest : 0) ? r : best), null);
  const distinct = new Set();
  dayRows.forEach((r) => r.uniqueKeys.forEach((k) => distinct.add(k)));
  const hasData = dayRows.some((r) => r.taps > 0 || r.utterances > 0);
  return {
    days: dayRows, bucket, bars, weeks: weekRows, top: topAll.slice(0, 20), topAll, newestWords,
    how, howTaps, tapsTotal, howComplete: howTaps === tapsTotal,
    totals: { taps: tapsTotal, activeDays: dayRows.filter((r) => r.taps > 0).length, distinct: distinct.size, newWords: newestWords.length,
      vocabulary: dayRows.length ? dayRows[dayRows.length - 1].cumulative : baseNew, utterances: utts, multi,
      pctMulti: utts ? (multi / utts) * 100 : null, mlu: uttKnown ? wordsKnown / uttKnown : null,
      longest: longestRow ? longestRow.longest : 0, longestDate: longestRow ? longestRow.date : null },
    hasData,
    /** Days that need their raw rows read: saved before Beta 2.5. */
    legacy: {
      events: dayRows.filter((r) => r.taps > 0 && !r.how).map((r) => r.date),
      utterances: dayRows.filter((r) => r.utterances > 0 && r.uttWords === null).map((r) => r.date),
    },
  };
}

/** Which days of the range still need raw rows (before the model can be built the first time). */
export function legacyNeeds(daily, range) {
  const ev = [], ut = [];
  for (const d of daily) {
    if (range.isAll ? false : d.date < range.fromDate || d.date > range.toDate) continue;
    if (d.learnerTaps > 0 && !d.howCounts) ev.push(d.date);
    if (d.utterances > 0 && d.utteranceWords === null) ut.push(d.date);
  }
  return { events: ev, utterances: ut };
}

/** The earliest day with any data (everyday or teaching), for the "All" range. */
export function firstDataDate(daily, sessions) {
  let first = null;
  for (const d of daily) if (!first || d.date < first) first = d.date;
  for (const s of sessions) { const d = localDate(s.start); if (!first || d < first) first = d; }
  return first;
}

// ---------------------------------------------------------------- parent summary wording
/**
 * How a word is going, in plain words for a family. No numbers, no jargon.
 * tm = a target model (see teachingModel).
 */
export function parentProgress(tm, name) {
  const s = tm.series;
  if (tm.status === "mastered" || tm.status === "maintenance") return `${name} knows this word now. Great work!`;
  if (!s.length) return "We have not practiced this one yet in this time.";
  if (s.length < 2) return "We are just getting started with this one.";
  const half = Math.max(1, Math.floor(s.length / 2));
  const early = s.slice(0, half), late = s.slice(-half);
  const avg = (l, k) => l.reduce((n, p) => n + p[k], 0) / l.length;
  const lastPct = s[s.length - 1].pct;
  if (lastPct >= 80) return `${name} is doing this mostly alone now.`;
  if (avg(late, "help") < avg(early, "help") - 0.05 || avg(late, "pct") > avg(early, "pct") + 10) return `${name} needs less help now.`;
  return "Still learning this one. That is okay, keep practicing together.";
}
