// The Reports screen (Phase 2, Round C, beta): adult menu > Reports (behind the same adult lock as the rest of the menu).
//
// WHAT IT DOES: reads the saved teaching data and everyday-use summaries of a learner, adds them up for a date range (and, for teaching,
// a Who / Where filter) and shows five tabs: Teaching graphs, Everyday-use graphs, a Printable summary, a Parent summary and CSV Export.
// Nothing leaves the iPad unless an adult prints a page or saves a file.
//
// KEEPING THE BOARD FAST: nothing here runs until the adult opens Reports, and it stops when Reports is closed. The reading is done with
// the same background-friendly reads as the rest of Round B, and the graphs use the daily summaries (one small row per day) rather than
// the tens of thousands of raw taps. Raw taps are read only for (a) days saved before Beta 2.5, which have no how-reached counts, (b) the
// one day with the longest message, and (c) the "Everyday events" export.
import { h, openOverlay } from "./ui.js";
import { listProfiles, getCurrent } from "./profiles.js";
import * as db from "./db.js";
import * as E from "./everyday.js";
import * as T from "./teaching.js";
import * as tpl from "./templates.js";
import { loadBoardData, getBoardData } from "./boarddata.js";
import * as R from "./reportdata.js";
import * as X from "./reportexport.js";
import * as D from "./reportdoc.js";

const TABS = [["teaching", "Teaching"], ["everyday", "Everyday use"], ["printable", "Printable summary"], ["parent", "Parent summary"], ["export", "Export"]];
const PRINT_HELP = "On iPad: tap Print, then pinch out on the preview (or use Share, then Save to Files) to save a PDF.";

// Everything a learner's reports need, read fresh each time Reports opens (or the learner changes).
async function loadLearner(id) {
  await Promise.all([tpl.loadTemplates(), loadBoardData()]);
  const [tRows, sRows, trRows, daily, first] = await Promise.all([
    db.getPrefix("targets", id + "|"), db.getPrefix("sessions", id + "|"), db.getPrefix("trials", id + "|"), E.listDaily(id), E.listFirstSeen(id)]);
  const targets = tRows.map((r) => T.cleanTarget(r.value, id)).filter(Boolean);
  for (const t of targets) tpl.ensureInstructions(getBoardData(), t);        // (in memory only: nothing is saved by looking at a report)
  return { targets, sessions: sRows.map((r) => T.cleanSession(r.value, id)).filter(Boolean), trials: trRows.map((r) => T.cleanTrial(r.value, id)).filter(Boolean), daily, first };
}

export async function openReports({ learnerId = getCurrent().id } = {}) {
  const st = { id: learnerId, spec: { id: "4w", from: "", to: "" }, who: "", where: "", tab: "teaching", notes: "", instr: false,
    data: null, range: null, tm: null, em: null, longestText: null, token: 0, raw: new Map(), msg: "" };
  const body = h("div", { class: "rp-body", id: "rp-body" });
  const controls = h("div", { class: "rp-controls", id: "rp-controls" });
  const tabsEl = h("div", { class: "rp-tabs seg-row", id: "rp-tabs", role: "tablist" });
  const o = openOverlay([
    h("div", { class: "menu-head rp-head" }, h("h1", {}, "Reports", h("small", { class: "version-label", text: "  progress graphs, printouts and spreadsheets" })),
      h("button", { type: "button", class: "btn primary", id: "rp-close", text: "Close", onclick: () => { st.token++; o.close(); } })),
    controls, tabsEl, body,
  ], { sheetClass: "reports" });
  o.sheet.closest(".overlay").classList.add("reports-layer");
  const t0 = performance.now();
  body.append(h("p", { class: "muted", text: "Loading..." }));

  const nameOf = () => (listProfiles().find((p) => p.id === st.id) || { name: "Learner" }).name;

  // ---------- controls ----------
  function paintControls() {
    const d = st.data;
    const opts = (vals, label) => [h("option", { value: "", text: label }), ...vals.map((v) => h("option", { value: v, text: v }))];
    const whos = [...new Set(d.sessions.map((s) => s.who).filter(Boolean))], wheres = [...new Set(d.sessions.map((s) => s.where).filter(Boolean))];
    const learnerSel = h("select", { class: "text-input rp-select", id: "rp-learner", "aria-label": "Learner" },
      listProfiles().map((p) => h("option", { value: p.id, text: p.name })));
    learnerSel.value = st.id;
    learnerSel.addEventListener("change", async () => { st.id = learnerSel.value; st.who = ""; st.where = ""; st.raw.clear(); await reload(); });
    const whoSel = h("select", { class: "text-input rp-select", id: "rp-who", "aria-label": "Who ran the session" }, opts(whos, "Everyone"));
    const whereSel = h("select", { class: "text-input rp-select", id: "rp-where", "aria-label": "Where" }, opts(wheres, "Everywhere"));
    whoSel.value = st.who; whereSel.value = st.where;
    whoSel.addEventListener("change", () => { st.who = whoSel.value; refresh(); });
    whereSel.addEventListener("change", () => { st.where = whereSel.value; refresh(); });
    const rangeBtns = R.RANGE_CHOICES.map((c) => h("button", { type: "button", class: "seg" + (st.spec.id === c.id ? " on" : ""), id: "rp-range-" + c.id, text: c.label,
      onclick: () => {
        st.spec = { ...st.spec, id: c.id };
        if (c.id === "custom" && !st.spec.from) { const r = R.resolveRange({ id: "4w" }); st.spec.from = r.fromDate; st.spec.to = r.toDate; }
        paintControls(); refresh();
      } }));
    const from = h("input", { type: "date", class: "text-input rp-date", id: "rp-from", value: st.spec.from, "aria-label": "From date" });
    const to = h("input", { type: "date", class: "text-input rp-date", id: "rp-to", value: st.spec.to, "aria-label": "To date" });
    const onDate = () => { st.spec = { ...st.spec, from: from.value, to: to.value }; if (from.value && to.value) refresh(); };
    from.addEventListener("change", onDate); to.addEventListener("change", onDate);
    controls.replaceChildren(...[
      h("div", { class: "rp-row" },
        h("label", { class: "rp-lab", for: "rp-learner", text: "Learner" }), learnerSel,
        h("label", { class: "rp-lab", for: "rp-who", text: "Who" }), whoSel, h("label", { class: "rp-lab", for: "rp-where", text: "Where" }), whereSel,
        h("span", { class: "muted rp-filter-note", text: "Who and Where apply to teaching." })),
      h("div", { class: "rp-row" },
        h("div", { class: "seg-row rp-ranges", id: "rp-ranges" }, rangeBtns)),
      st.spec.id === "custom" ? h("div", { class: "rp-row", id: "rp-custom" }, h("label", { class: "rp-lab", for: "rp-from", text: "From" }), from, h("label", { class: "rp-lab", for: "rp-to", text: "To" }), to) : null,
    ].filter(Boolean));
    tabsEl.replaceChildren(...TABS.map(([id, label]) => h("button", { type: "button", role: "tab", class: "seg" + (st.tab === id ? " on" : ""), id: "rp-tab-" + id, "aria-selected": st.tab === id ? "true" : "false", text: label,
      onclick: () => { st.tab = id; st.msg = ""; paintTabs(); paint(); } })));
  }
  const paintTabs = () => tabsEl.querySelectorAll(".seg").forEach((b) => { const on = b.id === "rp-tab-" + st.tab; b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });

  // ---------- loading and working out ----------
  async function reload() {
    const my = ++st.token;
    body.classList.add("busy");
    const t1 = performance.now();
    st.data = await loadLearner(st.id);
    if (my !== st.token) return;
    o.sheet.dataset.loadMs = String(Math.round(performance.now() - t1));
    paintControls();
    await refresh(true);
  }

  // Raw rows are read only when needed, and remembered for the next change of Who / Where / tab.
  async function rawRows(kind, from, to) {
    const key = `${kind}:${st.id}:${from}:${to}`;
    if (!st.raw.has(key)) st.raw.set(key, await (kind === "events" ? E.listEventsBetween(st.id, from, to) : E.listUtterancesBetween(st.id, from, to)));
    return st.raw.get(key);
  }
  async function refresh(first = false) {
    const my = ++st.token;
    const t1 = performance.now();
    body.classList.add("busy");
    const d = st.data;
    st.range = R.resolveRange(st.spec, Date.now(), R.firstDataDate(d.daily, d.sessions));
    st.tm = R.teachingModel({ targets: d.targets, sessions: d.sessions, trials: d.trials, range: st.range, who: st.who, where: st.where });
    const need = R.legacyNeeds(d.daily, st.range);
    const span = (dates) => [E.dayStart(dates[0]), E.dayStart(R.addDays(dates[dates.length - 1], 1))];
    const rawEvents = need.events.length ? await rawRows("events", ...span(need.events)) : [];
    const rawUtterances = need.utterances.length ? await rawRows("utterances", ...span(need.utterances)) : [];
    if (my !== st.token) return;
    st.em = R.everydayModel({ daily: d.daily, firstSeen: d.first, range: st.range, rawEvents, rawUtterances });
    st.longestText = null;
    if (st.em.totals.longest >= 2 && st.em.totals.longestDate) {
      const day = st.em.totals.longestDate;
      const utts = await rawRows("utterances", E.dayStart(day), E.dayStart(R.addDays(day, 1)));
      const hit = utts.filter((u) => u.chips.length === st.em.totals.longest).pop();
      if (my !== st.token) return;
      if (hit) st.longestText = hit.chips.map((c) => c.label).join(" ");
    }
    paint();
    body.classList.remove("busy");
    o.sheet.dataset.renderMs = String(Math.round(performance.now() - t1));
    if (first) o.sheet.dataset.openMs = String(Math.round(performance.now() - t0));
    o.sheet.dataset.ready = String(my);
  }

  // ---------- the tabs ----------
  function paint() {
    const fn = { teaching: paintTeaching, everyday: paintEveryday, printable: paintPrintable, parent: paintParent, export: paintExport }[st.tab];
    body.replaceChildren(...fn());
    body.scrollTop = 0;
  }
  const heading = (text) => h("h3", { class: "rp-h", text });
  const rangeLine = () => h("p", { class: "muted rp-range", id: "rp-range-line", text: `${nameOf()}: ${st.range.label}` });

  function paintTeaching() {
    const { tm } = st, out = [rangeLine()];
    if (!tm.targets.length) return [...out, D.emptyState("tc-empty", "No targets yet", "Add targets and run a teaching session (adult menu, Teaching). Graphs appear here after the first session.")];
    out.push(h("p", { id: "tc-totals", text: `${tm.totals.sessions} ${tm.totals.sessions === 1 ? "session" : "sessions"} and ${tm.totals.trials} scored ${tm.totals.trials === 1 ? "trial" : "trials"} in this period` +
      (st.who || st.where ? ` (${[st.who, st.where].filter(Boolean).join(", ")})` : "") + "." }));
    out.push(heading("Targets"), D.targetsTable(tm.targets));
    if (!tm.totals.sessions) {
      out.push(D.emptyState("tc-no-sessions", "No teaching sessions in this period", st.who || st.where ? "No sessions match this Who and Where. Try Everyone and Everywhere, or a longer period." : "Try a longer period, or run a session from the Teaching section."));
      return out;
    }
    const shapes = D.shapesFor(tm.targets);
    out.push(heading("Graphs"));
    for (const x of tm.targets.filter((t) => t.series.length)) out.push(D.targetBlock(x, shapes));
    out.push(heading("Sessions"), D.sessionListEl(tm.sessionList));
    return out;
  }

  function paintEveryday() {
    const { em } = st, out = [rangeLine()];
    const rec = E.isRecording(st.id);
    if (!rec) out.push(h("p", { class: "rp-banner", id: "ev-off", text: `Everyday recording is off for ${nameOf()}. Nothing new is being saved; what was saved before is shown below.` }));
    if (!em.hasData) {
      out.push(D.emptyState("ev-empty", "No everyday use in this period", rec ? "No words were saved for this period. Try a longer period." : "Recording was off, so nothing was saved. Turn it on in the adult menu under Data: everyday use."));
      return out;
    }
    out.push(D.everydayTiles(em));
    out.push(...D.everydayCards(em));
    out.push(heading("Newest words"), D.newestWordsEl(em));
    out.push(h("p", { class: "muted", text: "Who and Where do not change these graphs: everyday use has no Who or Where." }));
    return out;
  }

  function docContext() {
    return { name: nameOf(), range: st.range, who: st.who, where: st.where, tm: st.tm, em: st.em, notes: st.notes, includeInstr: st.instr, generated: new Date(),
      recording: E.isRecording(st.id), longestText: st.longestText };
  }
  const printButton = () => h("button", { type: "button", class: "btn primary", id: "rp-print", text: "Print / Save as PDF", onclick: () => window.print() });

  function paintPrintable() {
    const host = h("div", { class: "rp-docwrap", id: "rp-docwrap" });
    const build = () => host.replaceChildren(D.clinicalDoc(docContext()));
    const instr = h("input", { type: "checkbox", id: "rp-instr", checked: st.instr, onchange: () => { st.instr = instr.checked; build(); } });
    const notes = h("textarea", { class: "text-input rp-notes", id: "rp-notes", rows: 3, placeholder: "Notes to print on the summary (optional)", maxlength: 2000 });
    notes.value = st.notes;
    notes.addEventListener("input", () => { st.notes = notes.value; build(); });
    build();
    return [rangeLine(),
      h("div", { class: "rp-printbar no-print" },
        h("label", { class: "check-line", for: "rp-instr" }, instr, h("span", { text: "Include teaching instructions (a program sheet for each target)" })),
        notes, printButton(), h("p", { class: "muted", id: "rp-print-help", text: PRINT_HELP })),
      host];
  }

  function paintParent() {
    const host = h("div", { class: "rp-docwrap", id: "rp-docwrap" });
    host.append(D.parentDoc(docContext()));
    const status = h("span", { class: "muted", id: "rp-copy-status", role: "status" });
    const copy = h("button", { type: "button", class: "btn", id: "rp-copy", text: "Copy as text", onclick: async () => {
      try { await navigator.clipboard.writeText(host.innerText); status.textContent = "Copied."; } catch (e) { status.textContent = "Could not copy. Use Print instead."; }
    } });
    return [rangeLine(),
      h("div", { class: "rp-printbar no-print" }, h("div", { class: "btn-row left" }, printButton(), copy, status),
        h("p", { class: "muted", id: "rp-print-help", text: PRINT_HELP }),
        h("p", { class: "muted", text: "A short, plain-language page for the family. It uses each target's parent wording and has no jargon." })),
      host];
  }

  function paintExport() {
    const d = st.data, tm = st.tm, range = st.range;
    const scopeIds = new Set(tm.sessions.map((s) => s.id));
    const trialCount = d.trials.filter((t) => scopeIds.has(t.sessionId)).length;
    const dailyN = X.dailyRows(d.daily, range).length;
    const status = h("p", { class: "muted", id: "rp-export-status", role: "status", text: st.msg });
    const say = (m) => { st.msg = m; status.textContent = m; };
    const card = (id, title, text, count, make) => {
      const btn = h("button", { type: "button", class: "btn primary", id: "rp-export-" + id, text: "Download CSV" });
      const countEl = h("span", { class: "muted rp-count", id: "rp-count-" + id, text: count === null ? "counting..." : `${count.toLocaleString()} rows` });
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const label = btn.textContent;
        btn.textContent = "Preparing...";
        try {
          const { headers, rows } = await make();
          const name = X.fileName(nameOf(), id);
          X.downloadCsv(name, X.toCsv(headers, rows));
          say(`Saved ${rows.length.toLocaleString()} rows as ${name}. Choose where to keep it in the share sheet.`);
        } catch (e) { console.warn(e); say("Sorry, that file could not be made."); }
        btn.disabled = false; btn.textContent = label;
      });
      return h("section", { class: "panel rp-export", id: "rp-card-" + id }, h("h3", { text: title }), h("p", { class: "muted", text: text }), h("div", { class: "rp-export-row" }, btn, countEl));
    };
    const evCard = card("events", "Everyday events", "One row per word tap: date, time, word, how it was reached, and who made the tap (learner, adult model or teaching session). Uses the date range; kept for the detail period set in Data: everyday use.", null,
      async () => ({ headers: X.EVENT_HEADERS, rows: X.eventRows(await E.listEventsBetween(st.id, range.from, range.to)) }));
    E.countEventsBetween(st.id, range.from, range.to).then((n) => { const c = evCard.querySelector(".rp-count"); if (c && c.isConnected) c.textContent = `${n.toLocaleString()} rows`; }).catch(() => {});
    return [rangeLine(),
      h("p", { class: "muted", text: "Each button saves one spreadsheet (CSV) that opens in Excel, Numbers or Google Sheets. The file is only made when you tap the button, and goes wherever you choose in the share sheet. Who and Where apply to trials and sessions." }),
      card("trials", "Trials", "One row per trial: date, time, session, who, where, target word, planned or NET, result, prompt step, help (0 to 1), response time, errors.", trialCount,
        async () => ({ headers: X.TRIAL_HEADERS, rows: X.trialRows(tm.sessions, d.trials) })),
      card("sessions", "Sessions", "One row per teaching session with its targets and percent independent.", tm.sessions.length,
        async () => ({ headers: X.SESSION_HEADERS, rows: X.sessionRows(tm.sessions, d.trials, d.targets) })),
      card("targets", "Targets", "Every target with its status, prompt ladder and rules. (Not limited by the date range.)", d.targets.length,
        async () => ({ headers: X.TARGET_HEADERS, rows: X.targetRows(d.targets) })),
      evCard,
      card("daily", "Daily summary", "One row per day: taps, different words, new words, messages, messages with 2+ words, longest message.", dailyN,
        async () => ({ headers: X.DAILY_HEADERS, rows: X.dailyRows(d.daily, range) })),
      status];
  }

  await reload();
  return o;
}
