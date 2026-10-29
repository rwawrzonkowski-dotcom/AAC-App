// Reports: the page pieces (Phase 2, Round C, beta). Builds the on-screen blocks (graph cards, tables, key numbers) that the Teaching and
// Everyday tabs show, and the two PRINTABLE pages: the clinical summary and the parent summary. The same blocks are used on screen and on
// paper, so what you see is what prints. Numbers come from js/reportdata.js, graphs from js/reportcharts.js, screens from js/reports.js.
import { h } from "./ui.js";
import * as T from "./teaching.js";
import * as tpl from "./templates.js";
import * as C from "./reportcharts.js";
import { HOW_NAMES, HOW_IDS, shortDate, parentProgress } from "./reportdata.js";
import { VERSION_LABEL } from "./channel.js";

const n0 = (v) => Math.round(v);
const plural = (n, one, many = one + "s") => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const f1 = (v) => (Math.round(v * 10) / 10).toString();
const pctText = (v) => (v === null || v === undefined ? "-" : n0(v) + "%");

export function svgBox(svg, cls = "") {
  const box = h("div", { class: "rep-svg " + cls });
  box.innerHTML = svg;
  return box;
}
export function tableEl(headers, rows, cls = "") {
  return h("table", { class: "rep-table " + cls },
    h("thead", {}, h("tr", {}, headers.map((c) => h("th", { text: c })))),
    h("tbody", {}, rows.map((r) => h("tr", {}, r.map((c) => h("td", { text: c === null || c === undefined ? "" : String(c) }))))));
}
// A graph with its title and (on screen only) a "Show as table" copy of the same numbers. Never split across printed pages.
export function chartCard(title, svg, { note = "", tableHeaders = null, tableRows = null, id = "" } = {}) {
  return h("figure", { class: "rep-chart", ...(id ? { id } : {}) },
    h("h4", { text: title }), svgBox(svg),
    note ? h("p", { class: "muted rep-note", text: note }) : null,
    tableHeaders ? h("details", { class: "tbl-view no-print" }, h("summary", { text: "Show as table" }), tableEl(tableHeaders, tableRows)) : null);
}
export const emptyState = (id, title, text) => h("div", { class: "rep-empty", id }, h("strong", { text: title }), h("p", { text }));
const tile = (id, value, label) => h("div", { class: "rep-tile", id }, h("div", { class: "rep-num", text: String(value) }), h("div", { class: "rep-lab", text: label }));

// ---------------------------------------------------------------- teaching
export function targetsTable(tms) {
  return tableEl(["Target", "Status", "Sessions", "Trials", "Last 3 sessions (% independent)", "Current prompt step", "Mastery progress"],
    tms.map((tm) => [tm.label, T.STATUS_LABELS[tm.status], tm.sessionCount, tm.trialCount, tm.last3.length ? tm.last3.map((v) => v + "%").join(", ") : "-", tm.stepText, tm.mastery.text]),
    "targets-table");
}

/** One target: heading, its row of numbers, the % independent graph and the prompt-help graph. shapes = the shared Who -> shape map. */
export function targetBlock(tm, shapes, { plotH = 170, helpH = 92, withTable = true } = {}) {
  const wheres = [...new Set(tm.series.map((p) => p.where).filter(Boolean))];
  const head = h("div", { class: "rep-thead" }, h("h3", { text: tm.label }), h("span", { class: "pill st-" + tm.status, text: T.STATUS_LABELS[tm.status] }));
  const card = h("section", { class: "rep-target", "data-word": tm.wordId }, head);
  if (withTable) card.append(tableEl(["Sessions", "Trials", "Overall independent", "Last 3 sessions", "Current prompt step", "Mastery progress"],
    [[tm.sessionCount, tm.trialCount, pctText(tm.pctAll), tm.last3.length ? tm.last3.map((v) => v + "%").join(", ") : "-", tm.stepText, tm.mastery.text]], "target-facts"));
  if (!tm.series.length) {
    card.append(h("p", { class: "muted", text: "No scored trials for this word in this period." }));
    return card;
  }
  card.append(h("div", { class: "rep-graphs" },
    svgBox(C.teachingChart(tm, { plotH, shapes }), "teach-graph"),
    svgBox(C.helpChart(tm, { plotH: helpH }), "help-graph"),
    svgBox(C.teachingKey(shapes, wheres), "key-graph")));
  card.append(h("details", { class: "tbl-view no-print" }, h("summary", { text: "Show as table" }),
    tableEl(["Session", "Date", "Who", "Where", "Trials", "Independent", "% independent", "Average help", "Status"],
      tm.series.map((p) => [p.n, p.date, p.who, p.where, p.trials, p.independent, n0(p.pct) + "%", n0(p.help * 100) + "%", T.STATUS_LABELS[p.status]]))));
  return card;
}

/** The shapes for everybody in the report (the same person always has the same shape on every graph). */
export function shapesFor(tms) {
  const all = [];
  for (const w of T.WHO_CHOICES) if (tms.some((tm) => tm.series.some((p) => p.who === w))) all.push(w);
  for (const tm of tms) for (const p of tm.series) if (p.who && !all.includes(p.who)) all.push(p.who);
  return C.whoShapes(all);
}

export function sessionListEl(list) {
  if (!list.length) return null;
  return h("div", { class: "rep-sessions", id: "rep-sessions" }, list.map(({ session, rows }) => {
    const when = new Date(session.start);
    const mins = session.end ? Math.max(1, Math.round((session.end - session.start) / 60000)) : null;
    const scored = rows.reduce((n, r) => n + r.trials, 0);
    return h("details", { class: "rep-session", "data-id": session.id },
      h("summary", {}, h("strong", { text: when.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) + " " + when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) }),
        h("span", { text: `  ${session.who || "-"}, ${session.where || "-"}  |  ${plural(scored, "trial")}` + (mins ? `  |  ${mins} min` : "") })),
      tableEl(["Target", "Trials", "Independent", "Prompt step"], rows.map((r) => [r.label,
        r.trials ? `${r.trials} (${r.planned} planned, ${r.net} NET)` : "0" + (r.skipped ? `, ${r.skipped} skipped` : ""),
        r.pctIndependent === null ? "-" : `${r.pctIndependent}% (${r.independent} of ${r.trials})`, r.stepText]), "sum-table"),
      session.notes ? h("p", { class: "muted", text: "Notes: " + session.notes }) : null);
  }));
}

// ---------------------------------------------------------------- everyday
const barLabel = (em, key) => (em.bucket === "week" ? "Week of " : "") + shortDate(key);

/** The key numbers of everyday use. */
export function everydayTiles(em) {
  const t = em.totals;
  return h("div", { class: "rep-tiles", id: "ev-tiles" },
    tile("ev-taps", t.taps.toLocaleString(), "words used"),
    tile("ev-unique", t.distinct.toLocaleString(), "different words"),
    tile("ev-new", t.newWords.toLocaleString(), "new words"),
    tile("ev-vocab", t.vocabulary.toLocaleString(), "words used so far (all time)"),
    tile("ev-msgs", t.utterances.toLocaleString(), "messages"),
    tile("ev-multi", t.pctMulti === null ? "-" : n0(t.pctMulti) + "%", "messages with 2+ words"),
    tile("ev-mlu", t.mlu === null ? "-" : f1(t.mlu), "average words per message"),
    tile("ev-longest", t.longest || "-", "longest message (words)"));
}

/**
 * The everyday graphs, as a list of cards. opts: { compact (the printed page: shorter graphs, top 10), }.
 */
export function everydayCards(em, { compact = false } = {}) {
  const out = [];
  const ph = compact ? 120 : 150;
  const per = em.bucket === "week" ? "week" : "day";
  out.push(chartCard(`Words used and different words per ${per}`, C.wordsPerDayChart(em.bars, { bucket: em.bucket, plotH: ph }),
    { id: "ev-words-day", tableHeaders: [em.bucket === "week" ? "Week starting" : "Day", "Words used", "Different words"], tableRows: em.bars.map((b) => [b.key, b.taps, b.unique]),
      note: "Only words the learner chose are counted; an adult's modeling and teaching-session taps are left out." }));
  out.push(chartCard("Vocabulary growth: new words, added up", C.lineChart(em.bars.map((b) => ({ key: b.key, v: b.cumulative, tip: `${barLabel(em, b.key)}: ${b.cumulative} words so far` })),
    { title: "Words the learner has used so far", yTitle: "Words so far", integer: true, dots: em.bars.length <= 31, cls: "cpt", plotH: compact ? 110 : 130, endLabel: `${em.totals.vocabulary} words` }),
    { id: "ev-growth", tableHeaders: [em.bucket === "week" ? "Week starting" : "Day", "New words", "Words so far"], tableRows: em.bars.map((b) => [b.key, b.newWords, b.cumulative]),
      note: "A word is new the first time the learner ever uses it. The line starts from the words used before this period." }));
  const w = em.weeks;
  if (w.some((r) => r.utterances > 0)) {
    out.push(chartCard("Average words per message, each week", C.lineChart(w.map((r) => ({ key: r.key, v: r.mlu, tip: `Week of ${shortDate(r.key)}: ${r.mlu === null ? "no messages" : f1(r.mlu) + " words per message"} (${plural(r.utterances, "message")})` })),
      { title: "Average words per message", yTitle: "Words per message", cls: "mpt", plotH: compact ? 100 : 120, xTitle: "Week starting", endLabel: w.length && w[w.length - 1].mlu !== null ? f1(w[w.length - 1].mlu) : null }),
      { id: "ev-mlu", tableHeaders: ["Week starting", "Messages", "Average words per message"], tableRows: w.map((r) => [r.key, r.utterances, r.mlu === null ? "" : f1(r.mlu)]) }));
    out.push(chartCard("Messages with two or more words, each week", C.lineChart(w.map((r) => ({ key: r.key, v: r.pctMulti, tip: `Week of ${shortDate(r.key)}: ${r.pctMulti === null ? "no messages" : n0(r.pctMulti) + "% of messages had 2+ words"}` })),
      { title: "Percent of messages with two or more words", yTitle: "% of messages", yMax: 100, cls: "xpt", plotH: compact ? 100 : 120, xTitle: "Week starting", endLabel: w.length && w[w.length - 1].pctMulti !== null ? n0(w[w.length - 1].pctMulti) + "%" : null }),
      { id: "ev-multi-chart", tableHeaders: ["Week starting", "Messages", "% with 2+ words"], tableRows: w.map((r) => [r.key, r.utterances, r.pctMulti === null ? "" : n0(r.pctMulti)]) }));
  } else {
    out.push(emptyState("ev-no-msgs", "No messages in this period", "A message is the words built in the message bar and spoken together. None were saved in this period."));
  }
  const top = em.top.slice(0, compact ? 10 : 20);
  if (top.length) out.push(chartCard(`Top ${top.length} words`, C.hBarChart(top.map((r) => ({ key: r.key, label: r.label, value: r.count })), { title: "Most used words", unit: " times" }),
    { id: "ev-top", tableHeaders: ["Word", "Times used"], tableRows: em.top.map((r) => [r.label, r.count]) }));
  const howItems = HOW_IDS.map((k) => ({ key: k, label: HOW_NAMES[k], value: em.how[k] || 0 })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  if (howItems.length) out.push(chartCard("How words were reached", C.hBarChart(howItems, { title: "How words were reached", unit: " words", labelChars: 26 }),
    { id: "ev-how", tableHeaders: ["How", "Words", "Share"], tableRows: howItems.map((r) => [r.label, r.value, n0((r.value / em.howTaps) * 100) + "%"]),
      note: em.howComplete ? "" : "Some older days were saved without this detail and the detailed records have been cleared, so these counts cover part of the period." }));
  return out;
}

export function newestWordsEl(em, max = 40) {
  if (!em.newestWords.length) return h("p", { class: "muted", id: "ev-newest", text: "No new words in this period." });
  return h("div", { class: "data-chips", id: "ev-newest" }, em.newestWords.slice(0, max).map((f) => h("span", { class: "data-chip", title: f.date, text: f.label })),
    em.newestWords.length > max ? h("span", { class: "muted", text: ` and ${em.newestWords.length - max} more` }) : null);
}

// ---------------------------------------------------------------- the printable clinical summary
const FOOT = "Created with VOICE. The data stays on the iPad unless an adult exports or prints it.";

function docHeader(title, ctx) {
  return h("header", { class: "rep-dochead" },
    h("div", { class: "rep-brand", text: "VOICE" }),
    h("h1", { text: title }),
    h("table", { class: "rep-meta" }, h("tbody", {},
      h("tr", {}, h("th", { text: "Learner" }), h("td", { id: "doc-learner", text: ctx.name })),
      h("tr", {}, h("th", { text: "Period" }), h("td", { id: "doc-range", text: ctx.range.label })),
      ctx.clinical ? h("tr", {}, h("th", { text: "Filters" }), h("td", { text: `Who: ${ctx.who || "everyone"}   Where: ${ctx.where || "everywhere"}  (teaching sessions only)` })) : null,
      h("tr", {}, h("th", { text: "Created" }), h("td", { id: "doc-generated", text: ctx.generated.toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" }) })),
      ctx.clinical ? h("tr", {}, h("th", { text: "App" }), h("td", { id: "doc-version", text: `${VERSION_LABEL}  |  Created with VOICE` })) : null)));
}

/** The clinical summary page. ctx: { name, range, who, where, tm, em, notes, includeInstr, generated } */
export function clinicalDoc(ctx) {
  const doc = h("article", { class: "report-doc clinical", id: "doc-clinical" }, docHeader("Communication progress summary", { ...ctx, clinical: true }));
  // Teaching
  doc.append(h("h2", { text: "Teaching summary" }));
  const tms = ctx.tm.targets.filter((t) => t.series.length || !t.target.removed);
  if (!ctx.tm.totals.sessions) {
    doc.append(h("p", { class: "muted", id: "doc-no-teaching", text: "No teaching sessions in this period." }));
  } else {
    doc.append(h("p", { class: "rep-lead", text: `${plural(ctx.tm.totals.sessions, "session")}, ${plural(ctx.tm.totals.trials, "scored trial")}.` }), targetsTable(tms));
    const shapes = shapesFor(tms);
    for (const tm of tms.filter((t) => t.series.length)) doc.append(targetBlock(tm, shapes, { plotH: 150, helpH: 80, withTable: false }));
  }
  // Everyday
  doc.append(h("h2", { class: "rep-break", text: "Everyday use summary" }));
  if (!ctx.em.hasData) doc.append(emptyState("doc-no-everyday", "No everyday use in this period", ctx.recording ? "No words were saved for this period." : "Recording of everyday use was off, so nothing was saved."));
  else {
    doc.append(everydayTiles(ctx.em), ...everydayCards(ctx.em, { compact: true }));
    if (ctx.em.newestWords.length) doc.append(h("h4", { text: "Newest words" }), newestWordsEl(ctx.em, 30));
  }
  // Instructions (a program sheet)
  if (ctx.includeInstr) {
    const list = ctx.tm.targets.filter((t) => !t.target.removed);
    doc.append(h("h2", { class: "rep-break", text: "Teaching instructions" }), h("p", { class: "muted", text: "Clinical wording for each target (the program sheet)." }));
    if (!list.length) doc.append(h("p", { class: "muted", text: "No targets." }));
    for (const tm of list) {
      const t = tm.target;
      doc.append(h("section", { class: "rep-instr", "data-word": t.wordId },
        h("h3", {}, tm.label, h("small", { text: `  ${tpl.templateNameOf(t)}  |  ${T.STATUS_LABELS[t.status]}` })),
        h("dl", {}, tpl.fieldList().map((f) => [h("dt", { text: f.label }), h("dd", { text: tpl.instructionText(t, "clinical", f.id, ctx.name) })]).flat())));
    }
  }
  // Notes
  if (ctx.notes && ctx.notes.trim()) doc.append(h("h2", { text: "Notes" }), h("p", { class: "rep-notes", id: "doc-notes", text: ctx.notes.trim() }));
  doc.append(h("footer", { class: "rep-foot", text: FOOT }));
  return doc;
}

// ---------------------------------------------------------------- the parent summary
const list = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);

/** The family page: plain, warm, short. No percentages, no clinical words. ctx also has `longestText` (the longest message, or null). */
export function parentDoc(ctx) {
  const { name, em, tm } = ctx;
  const doc = h("article", { class: "report-doc parent", id: "doc-parent" }, docHeader(`${name}'s communication`, { ...ctx, clinical: false }));
  const t = em.totals;
  const p = (id, text) => h("p", { class: "par-line", id, text });
  if (!em.hasData) {
    doc.append(p("par-none", `We have not saved any of ${name}'s words in this time yet.`));
  } else {
    doc.append(p("par-unique", `${ctx.range.phrase}, ${name} used ${plural(t.distinct, "different word")}.`));
    if (t.newWords) {
      const names = em.newestWords.slice().reverse().map((f) => f.label);
      doc.append(p("par-new", `${name} started using ${plural(t.newWords, "new word")}: ${list(names.slice(0, 12))}${names.length > 12 ? ", and more" : ""}.`));
    }
    const fav = em.topAll.slice(0, 5).map((r) => r.label);
    if (fav.length) doc.append(p("par-fav", `${name}'s favorite words were ${list(fav)}.`));
    if (t.longest >= 2) doc.append(p("par-longest", `${name}'s longest message had ${t.longest} words${ctx.longestText ? `: "${ctx.longestText}"` : ""}.`));
  }
  const practiced = tm.targets.filter((x) => x.series.length);
  doc.append(h("h2", { text: "Words we practiced" }));
  if (!practiced.length) doc.append(p("par-no-practice", "We did not have practice sessions in this time."));
  else doc.append(h("ul", { class: "par-list", id: "par-practiced" }, practiced.map((x) =>
    h("li", {}, h("strong", { text: x.label }), `: ${parentProgress(x, name)}`))));
  const home = tm.targets.filter((x) => !x.target.removed && x.target.status === "teaching");
  doc.append(h("h2", { text: "Words to practice at home" }));
  if (!home.length) doc.append(p("par-no-home", "There are no words to practice at home right now."));
  else doc.append(h("ul", { class: "par-list", id: "par-home" }, home.map((x) =>
    h("li", { "data-word": x.wordId }, h("strong", { text: x.label }), h("div", { text: tpl.instructionText(x.target, "parent", "cue", name) })))));
  doc.append(p("par-thanks", `Thank you for practicing with ${name}. Every word counts!`), h("footer", { class: "rep-foot", text: FOOT }));
  return doc;
}
