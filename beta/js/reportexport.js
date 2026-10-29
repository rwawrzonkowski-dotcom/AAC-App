// Reports, spreadsheet export (Phase 2, Round C, beta). Builds CSV text (comma-separated values) that opens in Excel, Numbers or Google
// Sheets, and hands it to the iPad's share / save sheet. Nothing is sent anywhere by the app: a file is only made when an adult taps a button.
//
// FORMAT: a header row, then one row per item. UTF-8 with a "byte order mark" at the start (so Excel shows accents and symbols correctly),
// dates as 2026-10-28 and times as 14:05:09 (this iPad's local time), lines ended by CRLF. A value with a comma, a quote or a new line is
// put in quotes and every quote inside it is doubled (the standard CSV rule).
import * as T from "./teaching.js";
import * as tpl from "./templates.js";
import { localDate } from "./everyday.js";
import { clock } from "./reportdata.js";

export const BOM = "﻿";

/** One value as CSV text. */
export function csvCell(v) {
  if (v === null || v === undefined) return "";
  let s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : typeof v === "boolean" ? (v ? "yes" : "no") : String(v);
  // Text that starts with = + - @ (or a tab/return) could run as a formula in Excel or Sheets.
  // Put an apostrophe in front so it always shows as plain text. Numbers are left alone.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
/** Header row + rows -> CSV text (no byte order mark; downloadCsv adds it). */
export function toCsv(headers, rows) {
  const out = [headers.map(csvCell).join(",")];
  for (const r of rows) out.push(r.map(csvCell).join(","));
  return out.join("\r\n") + "\r\n";
}

/** "Ana Lucia" -> "ana-lucia" (for file names). */
export const slug = (name) => (String(name || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "learner");
export const fileName = (learner, kind, now = Date.now()) => `voice-${slug(learner)}-${kind}-${localDate(now)}.csv`;

/** Save text as a file: on the iPad this opens the share / save sheet (Save to Files, AirDrop, Mail...). */
export function downloadCsv(name, text) {
  const blob = new Blob([BOM, text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
}

// ---------------------------------------------------------------- the five files
const dateOf = (t) => localDate(t);

export const TRIAL_HEADERS = ["date", "time", "session_id", "who", "where", "target_word", "type", "result", "prompt_step", "help", "latency_ms", "errors", "error_words"];
/** One row per trial (skipped trials included, result "skipped"). sessions = the sessions in the report (range and filters applied). */
export function trialRows(sessions, trials) {
  const by = new Map(sessions.map((s) => [s.id, s]));
  return trials.filter((t) => by.has(t.sessionId)).sort((a, b) => a.start - b.start).map((t) => {
    const s = by.get(t.sessionId);
    return [dateOf(t.start), clock(t.start), t.sessionId, s.who, s.where, t.label, t.type, t.result, T.trialStepName(t),
      Math.round(T.trialHelp(t) * 1000) / 1000, t.latencyMs, t.errors.length, t.errors.map((e) => e.label).join("; ")];
  });
}

export const SESSION_HEADERS = ["date", "start_time", "end_time", "minutes", "session_id", "who", "where", "targets", "scored_trials", "independent", "percent_independent", "notes"];
export function sessionRows(sessions, trials, targets) {
  return sessions.slice().sort((a, b) => a.start - b.start).map((s) => {
    const mine = trials.filter((t) => t.sessionId === s.id && t.result !== "skipped");
    const indep = mine.filter(T.isIndependent).length;
    const names = s.targets.map((id) => (targets.find((t) => t.wordId === id) || { label: id }).label).join("; ");
    return [dateOf(s.start), clock(s.start), s.end ? clock(s.end) : "", s.end ? Math.round(((s.end - s.start) / 60000) * 10) / 10 : "", s.id, s.who, s.where,
      names, mine.length, indep, mine.length ? Math.round((indep / mine.length) * 1000) / 10 : "", s.notes];
  });
}

export const TARGET_HEADERS = ["word", "word_id", "status", "direction", "ladder", "fading_step_size", "current_step", "time_delay_sec", "fade_after_correct",
  "back_up_after_misses", "mastery_percent", "mastery_sessions", "mastery_min_trials", "mastery_different_people_or_settings", "instruction_template", "date_added", "removed"];
export function targetRows(targets) {
  return targets.slice().sort((a, b) => a.added - b.added).map((t) => [t.label, t.wordId, T.STATUS_LABELS[t.status], T.DIRECTION_LABELS[t.direction], T.ladderSummary(t),
    T.isCustom(t) ? "custom" : T.STEP_SIZES[t.stepSize] + "%", t.direction === "ltm" ? "Least-to-most" : T.isProbe(t) ? "No prompts" : T.posName(t),
    t.delaySec, t.fadeAfter, t.backUpAfter, t.mastery.pct, t.mastery.sessions, t.mastery.minTrials, t.mastery.differentTags,
    t.instructions ? tpl.templateNameOf(t) : "", t.added ? dateOf(t.added) : "", t.removed ? dateOf(t.removed) : ""]);
}

export const EVENT_HEADERS = ["date", "time", "word", "how_reached", "mode"];
const HOW_TEXT = { board: "board", page: "page", forms: "forms", dial: "dial", keyboard: "keyboard", numberpad: "number pad", scene: "scene strip", "photo scene": "scene photo" };
export function eventRows(events) {
  return events.map((e) => [dateOf(e.time), clock(e.time), e.form || e.label, HOW_TEXT[e.how] || e.how, e.mode]);
}

export const DAILY_HEADERS = ["date", "taps", "unique_words", "new_words", "messages", "multi_word_messages", "longest_message_words"];
export function dailyRows(daily, range) {
  return daily.filter((d) => d.date >= range.fromDate && d.date <= range.toDate || range.isAll)
    .map((d) => [d.date, d.learnerTaps, d.uniqueWords.length, d.newWords, d.utterances, d.multiWordUtterances, d.longestUtterance]);
}
