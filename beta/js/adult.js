// The adult menu: a large overlay for learners, board size, vocabulary stage, edit mode,
// model prompt (ring / critter), voice settings, touch supports, backup and model mode. Adult-styled so it looks different from the
// child's board.
//
// LAYOUT (Beta 3.9, iPad-Settings style; the structure, views and search are in js/settingsnav.js):
//   iPad   a list on the left (learner card, quick actions, search, grouped rows showing their current value) and the chosen
//          page on the right.
//   phone  the list fills the screen; a page opens over it with "‹ Settings" to go back.
// The setting sections below (sizeSection, voiceSection...) are unchanged; each page shows one or more of them.
import { h, openOverlay, askText, askConfirm } from "./ui.js";
import {
  listProfiles, getCurrent, switchTo, addProfile, renameProfile, deleteProfile,
  saveProfile, CHILD_VOICE, ADULT_VOICE, DIAL_HOLD_MIN, DIAL_HOLD_MAX,
} from "./profiles.js";
import { setVoiceSettings, speak, speakSequence, speakMessage, stopSpeech, pauseMs, PAUSE_MS } from "./speech.js";
import { createVoicePicker, newPickerState } from "./voicepicker.js";
import { saveBackup, restoreFromFile } from "./backup.js";
import { dataSafetyLine, needsHomeScreen, homeScreenSteps } from "./keepdata.js";
import { showCoach } from "./adulthint.js";
import { TONES } from "./tones.js";
import { showSetup } from "./setup.js";
import { buildModel, maxStageFor } from "./boardmodel.js";
import { modelSection } from "./modelsettings.js";
import { VERSION_LABEL } from "./channel.js";
import { openAbout } from "./about.js";
import { volumeTestBlock, looksLikePhone, PHONE_BOARD_TIP, moreVoicesHelp } from "./devicetips.js";
import { teachingSection } from "./teachui.js";
import { dataSection } from "./datapanel.js";
import { openReports } from "./reports.js";
import { scenesSection } from "./sceneadult.js";
import { openStartSession } from "./teachui.js";
import { getTargets } from "./teachdata.js";
import { isRecording } from "./everyday.js";
import { getScenes } from "./scenestrip.js";
import { getView, setView, groupedPages, pageById, pageForOldId, visibleIn, searchPages } from "./settingsnav.js";
import { accessSection, accessSummary } from "./accessui.js";
import { progressFor, cleanStageRule, hasNextStep, MOVE_UP } from "./stagerule.js";

const PREVIEW_TEXT = "I want more bubbles please";   // "Hear a sample sentence"
const PREVIEW_WORD = "bubbles";                      // "Preview a word"

// callbacks:
//   board            the loaded word map (to list the words in each stage)
//   onLearnerChanged()  a different learner is now current (board must redraw)
//   onVocabChanged()    stage changed (board must redraw)
//   onBoardSizeChanged()  this learner's board size changed (45 <-> 84)
//   onEdit(), onModel() start those modes (the menu closes first)
//   onPreviewPrompt()   "Preview on board" in the Model prompt section (the menu closes first;
//                       the app runs the prompt and then opens the menu again)
//   startAt             id of a section to scroll to when the menu opens (optional)
//   teach               the Teaching section (Phase 2): { sessionActive(), onChooseTargets(), onStartSession(opts) }
// The "Auto" choice of the top-bar buttons, the little-word strip and the forms dial: from stage 3, but never on the 24 board (Beta 3.25).
const autoLabel = (cur) => (cur.gridSize === 24 ? "Auto (off on the 24 board)" : "Auto (stage 3 and up)");

export function openAdultMenu({ board, startAt, onLearnerChanged, onVocabChanged, onBoardSizeChanged, onEdit, onModel,
  onPreviewPrompt, teach, isModeling = () => false, onStopModel = () => {} }) {
  let stopVoiceListener = () => {};
  const pickerState = newPickerState();   // which voice groups are open; kept when the menu is rebuilt
  let backupMessage = "";   // result of the last save / restore, shown in the Backup section

  let view = getView();                                   // "parent" | "clinician" (this iPad)
  let pageId = pageForOldId(startAt) || "learner";        // the page on the right (iPad) or open (phone)
  if (!visibleIn(pageById(pageId), view)) pageId = "learner";
  let query = "";
  // (Beta 3.24) also one column when the device is upright and not very wide (an iPad in portrait)
  const isNarrow = () => looksLikePhone() || window.innerWidth < 760 || (window.innerHeight > window.innerWidth && window.innerWidth < 900);
  let narrow = isNarrow();
  let showingPage = !narrow || !!startAt;                 // phone: start on the list unless asked for a page

  // The top bar: title, Parent / Clinician view, Close.
  const viewBtn = (v, text) => h("button", { type: "button", class: "seg view-seg" + (view === v ? " on" : ""), id: "view-" + v, text,
    onclick: () => { if (view === v) return; view = v; setView(v); if (!visibleIn(pageById(pageId), view)) pageId = "learner"; paintHead(); refresh(); } });
  const viewRow = h("div", { class: "seg-row view-row", role: "group", "aria-label": "Adult menu view" });
  const paintHead = () => viewRow.replaceChildren(viewBtn("parent", "Parent"), viewBtn("clinician", "Clinician"));
  paintHead();

  // Left: the search field (kept across redraws so typing is never interrupted), then the list.
  const searchIn = h("input", { type: "search", class: "set-search", id: "set-search", placeholder: "Search settings", "aria-label": "Search settings",
    autocomplete: "off", oninput: () => { query = searchIn.value; paintNav(); },
    onkeydown: (e) => { if (e.key === "Enter") { const first = navBody.querySelector(".set-row"); if (first) first.click(); } } });
  const navBody = h("div", { class: "set-nav-body" });
  const nav = h("nav", { class: "set-nav", id: "set-nav", "aria-label": "Settings" }, h("div", { class: "set-search-wrap" }, searchIn), navBody);
  const detail = h("div", { class: "set-detail", id: "set-detail" });

  const o = openOverlay([
    h("div", { class: "menu-head" },
      h("h1", {}, "VOICE", h("small", { class: "version-label", id: "version-label", text: VERSION_LABEL })),
      viewRow,
      h("button", { type: "button", class: "btn primary", id: "menu-close-top", text: "Close", onclick: close })),
    h("div", { class: "set-split" }, nav, detail),
  ], { sheetClass: "menu" });
  const sheet = o.sheet;
  sheet.closest(".overlay").classList.add("frosted");     // Beta 3.19: the board shows softly blurred behind the menu (styles.css)

  function close() {
    stopVoiceListener();
    stopSpeech();
    window.removeEventListener("resize", onResize);
    o.close();
  }
  function onResize() { const n = isNarrow(); if (n !== narrow) { narrow = n; if (!narrow) showingPage = true; refresh(); } }
  window.addEventListener("resize", onResize);

  function openPage(id) {
    pageId = id;
    showingPage = true;
    detail.scrollTop = 0;
    refresh();
  }

  // ---------- The list ----------
  // What a row says on its right: the current value, so the adult can check a setting without opening it.
  function valueOf(id, cur) {
    try {
      switch (id) {
        case "size": return cur.gridSize + " buttons";
        case "stage": return "Stage " + cur.stage;
        case "reading": return cur.wordsOnly ? "Words only" : "";
        case "access": return accessSummary(cur.access);
        case "voice": {
          const v = (window.speechSynthesis && speechSynthesis.getVoices().find((x) => x.voiceURI === cur.voice.voiceURI)) || null;
          return v ? v.name.replace(/\s*\(.*\)$/, "") : "Default";
        }
        case "touch": { const t = cur.touch; return ["holdOn", "ignoreOn", "liftOff", "zones", "keyguard", "preview", "dwellOn"].some((k) => t[k]) ? "On" : "Off"; }
        case "teaching": { const n = getTargets().length; return n + (n === 1 ? " target" : " targets"); }
        case "data": return isRecording(cur.id) ? "On" : "Off";
        case "scenes": { const n = getScenes().length; return n + " saved"; }
        case "backup": { const d = dataSafetyLine(); return d.ok === true ? "Protected" : d.ok === false ? "Not protected" : ""; }
        default: return "";
      }
    } catch (e) { return ""; }
  }
  const icon = (p) => { const t = h("span", { class: "set-icon", "aria-hidden": "true", text: p.icon }); t.style.background = p.color; return t; };
  function row(p, cur, sub) {
    const val = valueOf(p.id, cur);
    return h("button", { type: "button", class: "set-row" + (p.id === pageId && !narrow ? " on" : ""), id: "row-" + p.id, "data-page": p.id,
      onclick: () => openPage(p.id) },
      icon(p),
      h("span", { class: "set-row-text" }, h("span", { class: "set-row-title", text: p.title }), sub ? h("small", { class: "set-row-sub", text: sub }) : null),
      val ? h("span", { class: "set-row-value" + (p.id === "backup" && val === "Not protected" ? " warn" : ""), text: val }) : null,
      h("span", { class: "set-chev", "aria-hidden": "true", text: "›" }));
  }
  function paintNav() {
    const cur = getCurrent();
    const top = navBody.scrollTop;
    if (query.trim()) {
      const { results, hiddenCount } = searchPages(query, view);
      navBody.replaceChildren(...[
        h("div", { class: "set-group" }, results.map((r) => row(r.page, cur, r.match ? "“" + r.match + "”" : null))),
        !results.length ? h("p", { class: "muted set-none", id: "set-none", text: "No settings match “" + query.trim() + "”." }) : null,
        hiddenCount ? h("button", { type: "button", class: "link-btn set-hidden", id: "set-hidden",
          text: hiddenCount + (hiddenCount === 1 ? " more result" : " more results") + " in Clinician view",
          onclick: () => { view = "clinician"; setView(view); paintHead(); refresh(); } }) : null].filter(Boolean));
      return;
    }
    const busy = teach.sessionActive();
    const notes = (cur.notices || []).length;
    const card = h("button", { type: "button", class: "set-card" + (pageId === "learner" && !narrow ? " on" : ""), id: "set-card", onclick: () => openPage("learner") },
      h("span", { class: "set-avatar", "aria-hidden": "true", text: (cur.name.trim()[0] || "?").toUpperCase() }),
      h("span", { class: "set-card-text" }, h("span", { class: "set-card-name", text: cur.name }),
        h("small", { text: "Stage " + cur.stage + " · " + cur.gridSize + " buttons" })),
      notes ? h("span", { class: "set-badge", id: "set-badge", title: "Notes about the board", text: String(notes) }) : null,
      h("span", { class: "set-chev", "aria-hidden": "true", text: "›" }));
    const actions = h("div", { class: "set-actions" },
      h("button", { type: "button", class: "btn", id: "menu-edit", text: "Edit board", disabled: busy, onclick: () => { close(); onEdit(); } }),
      isModeling()
        ? h("button", { type: "button", class: "btn primary", id: "menu-model-stop", text: "Stop modeling", onclick: () => { close(); onStopModel(); } })
        : h("button", { type: "button", class: "btn", id: "menu-model", text: "Start modeling", disabled: busy, onclick: () => { close(); onModel(); } }),
      view === "clinician" ? h("button", { type: "button", class: "btn", id: "menu-session", text: "Start a session", disabled: busy,
        onclick: () => openStartSession({ refresh, closeMenu: close, ...teach }) }) : null);
    navBody.replaceChildren(...[card, actions,
      busy ? h("p", { class: "muted set-busy", text: "Editing, modeling and new sessions are off while a teaching session is running." }) : null,
      ...groupedPages(view).map((g) => h("div", { class: "set-group-wrap" },
        h("h3", { class: "set-group-title", text: g.title }),
        h("div", { class: "set-group" }, g.pages.map((p) => row(p, cur))))),
      h("p", { class: "muted set-scope-note", text: "Everything above “This iPad” belongs to " + cur.name + " and is saved in their backup." })].filter(Boolean));
    navBody.scrollTop = top;
  }

  // ---------- The page ----------
  function pageContent(id) {
    switch (id) {
      case "learner": return [noticeSection(), learnerSection()];
      case "size": return [sizeSection()];
      case "stage": return [stageSection()];
      case "buttons": return [buttonsSection()];
      case "reading": return [readingSection()];
      case "access": return [accessSection({ onChanged: onVocabChanged, refresh })];
      case "voice": return [voiceSection()];
      case "touch": return [touchSection()];
      case "teaching": return [teachingSection({ refresh, closeMenu: close, ...teach })];
      case "model": return [modelSection({ refresh, closeMenu: close, onPreviewPrompt })];
      case "reports": return [reportsSection()];
      case "data": return [dataSection({ refresh, sessionActive: teach.sessionActive })];
      case "scenes": return [scenesSection({ refresh, closeMenu: close })];
      case "backup": return [backupSection()];
      case "about": return [aboutSection()];
      default: return [];
    }
  }
  function paintDetail() {
    const top = detail.scrollTop;
    const page = pageById(pageId);
    const content = pageContent(pageId).filter(Boolean);
    // The page title replaces each section's own heading (e.g. "Voice (for this learner)"); the notes panel keeps its heading.
    for (const el of content) { if (el.id === "sec-notice") continue; const h2 = el.querySelector(":scope > h2"); if (h2) h2.remove(); }
    detail.replaceChildren(
      h("div", { class: "set-detail-head" },
        narrow ? h("button", { type: "button", class: "link-btn set-back", id: "set-back", text: "‹ Settings",
          onclick: () => { showingPage = false; refresh(); } }) : null,
        h("h2", { class: "set-detail-title", id: "set-detail-title", text: page ? page.title : "" })),
      ...content);
    detail.scrollTop = top;
  }

  // Redraw the list and the page (every setting calls this after a change), keeping both scroll positions.
  function refresh() {
    stopVoiceListener();
    stopVoiceListener = () => {};
    sheet.classList.toggle("narrow", narrow);
    sheet.classList.toggle("show-page", narrow && showingPage);
    paintNav();
    if (!narrow || showingPage) paintDetail(); else detail.replaceChildren();
  }

  // ---------- Reports (Beta 2.5) ----------
  // Opens the Reports screen over the menu. Everything is worked out only while that screen is open.
  function reportsSection() {
    return h("section", { class: "panel", id: "sec-reports" },
      h("h2", { text: "Reports" }),
      h("p", { class: "muted", text: "Progress graphs for teaching and everyday use, a printable summary, a plain-language summary for the family, and spreadsheet (CSV) files. " +
        "Nothing leaves this iPad unless you print a page or save a file." }),
      h("div", { class: "btn-row left" },
        h("button", { type: "button", class: "btn primary", id: "reports-open", text: "Open reports", onclick: () => openReports({ learnerId: getCurrent().id }) })));
  }

  // ---------- Notes about changes (only shown when there is something to tell the adult) ----------
  // For example: after an upgrade moved a word the adult had added (see js/migrate.js).
  function noticeSection() {
    const cur = getCurrent();
    if (!cur.notices || !cur.notices.length) return null;
    return h("section", { class: "panel notice", id: "sec-notice" },
      h("h2", { text: "Notes about " + cur.name + "'s board" }),
      h("p", { class: "muted", text: "The board was updated. A built-in word now uses a spot where you had added a word " +
        "(a new folder button was added, or the category pages were reorganized into rows of related words): that word was " +
        "kept and moved to a free spot. Some built-in words also moved into a folder. Here is what changed:" }),
      h("ul", { class: "notice-list" }, cur.notices.map((t) => h("li", { text: t }))),
      h("div", { class: "btn-row left" },
        h("button", { type: "button", class: "btn", id: "notice-ok", text: "Got it", onclick: async () => {
          cur.notices = [];
          await saveProfile(cur);
          refresh();
        } })));
  }

  // ---------- Learner ----------
  function learnerSection() {
    const cur = getCurrent();
    const list = listProfiles();
    return h("section", { class: "panel", id: "sec-learner" },
      h("h2", { text: "Learner" }),
      h("div", { class: "learner-list" }, list.map((p) =>
        h("button", {
          type: "button", class: "learner-item" + (p.id === cur.id ? " current" : ""),
          "data-id": p.id, text: (p.id === cur.id ? "✓ " : "") + p.name,
          onclick: async () => {
            if (p.id === cur.id) return;
            await switchTo(p.id);
            await onLearnerChanged();
            refresh();
          },
        }))),
      h("div", { class: "btn-row left" },
        h("button", { type: "button", class: "btn", id: "learner-add", text: "Add learner", onclick: async () => {
          const choice = await showSetup({ first: false });   // quick setup: board size, stage, name
          if (!choice) return;
          const p = await addProfile(choice.name, choice);
          await switchTo(p.id);
          await onLearnerChanged();
          refresh();
        } }),
        h("button", { type: "button", class: "btn", id: "learner-rename", text: "Rename", onclick: async () => {
          const name = await askText("Rename learner", cur.name, "Save");
          if (!name) return;
          await renameProfile(cur.id, name);
          await onLearnerChanged();
          refresh();
        } }),
        h("button", { type: "button", class: "btn danger", id: "learner-delete", text: "Delete",
          disabled: list.length <= 1, onclick: async () => {
            const sure = await askConfirm(
              `Delete ${cur.name}? Their settings, changes and photos will be erased from this iPad. This cannot be undone.`,
              "Delete");
            if (!sure) return;
            if (await deleteProfile(cur.id)) { await onLearnerChanged(); refresh(); }
          } })),
      list.length <= 1 ? h("p", { class: "muted", text: "The last learner cannot be deleted." }) : null);
  }

  // ---------- Board size (per learner) ----------
  // Switching the grid moves every word, so it is a RELEARNING event for the child.
  // The adult must confirm. The learner's stage is kept.
  function sizeSection() {
    const cur = getCurrent();
    const btn = (n, text) => h("button", {
      type: "button", class: "seg" + (cur.gridSize === n ? " on" : ""), id: `size-${n}`, "data-size": n, text,
      onclick: async () => {
        if (cur.gridSize === n) return;
        // Stage on the new board: the 24 board has stages 1-3; moving up from 24 always starts at stage 2 there (Beta 3.25, Richard's rule).
        const newStage = cur.gridSize === 24 && n !== 24 ? MOVE_UP.stage : Math.min(cur.stage, maxStageFor(n));
        const stageText = newStage === cur.stage ? `The stage (${cur.stage}) is kept. ` : `The stage changes from ${cur.stage} to ${newStage}. `;
        const sure = await askConfirm(
          `Switch ${cur.name} to the ${n}-location board? Word locations will change, so ${cur.name} will have to learn where ` +
          `words are again. This is a relearning event: only switch when ${cur.name} is ready. ` +
          stageText + `Photos, renamed labels and show/hide choices for built-in words move with each word. ` +
          `Words and pages you added to empty buttons stay with the ${cur.gridSize}-location board and come back if you switch back.`,
          `Switch to ${n}`);
        if (!sure) return;
        cur.gridSize = n; cur.stage = newStage;
        await saveProfile(cur);
        onBoardSizeChanged();
        refresh();
      },
    });
    return h("section", { class: "panel", id: "sec-size" },
      h("h2", { text: "Board size (for this learner)" }),
      h("p", { class: "muted", text: "24 locations (6 x 4) has large buttons and its own layout for early learners: requesting, waiting, " +
        "breaks, \"finished\", yes and no, and saying something hurts (the Essential 8 skills). It has stages 1-3; after that VOICE suggests moving up to the 45 board. " +
        "45 locations (9 x 5) is the usual starting board. 84 locations (12 x 7) is a larger board with more words. " +
        "The first four rows are the same on 45 and 84; the bottom row of the 45 board moves down to the bottom row of the 84 board." }),
      h("div", { class: "seg-row size-seg" }, btn(24, "24 locations"), btn(45, "45 locations"), btn(84, "84 locations")),
      // On a phone, nudge toward the smaller board while 84 is selected
      looksLikePhone() && cur.gridSize === 84 ? h("p", { class: "phone-size-tip", id: "size-phone-tip", text: PHONE_BOARD_TIP }) : null);
  }

  // ---------- Vocabulary stage ----------
  function stageSection() {
    const cur = getCurrent();
    const model = buildModel(board, cur.gridSize);
    const wordsFor = (n) => model.main.filter((b) => b.stage === n).map((b) => b.label).join(", ");
    const note = { 1: "Starting words", 2: "Adds", 3: "Adds", 4: "Adds", 5: "Adds" };
    // Stage 5 (Beta 3.26) adds no main-board words: it adds folders on the Words menu.
    const S5_TEXT = "14 folders on the Words menu: where words, some and every, thinking words, how often, joining words, more describing, " +
      "school talk, school subjects, games and screens, two reading-word folders and three My interests folders you fill";
    const stages = Array.from({ length: maxStageFor(cur.gridSize) }, (_, i) => i + 1);
    return h("section", { class: "panel", id: "sec-stage" },
      h("h2", { text: "Vocabulary stage" }),
      h("p", { class: "muted", text: "Each stage reveals more words in their permanent spots. Nothing moves. " +
        "On the category pages the original words always show; the newer words on them appear from stage 3 (or use Always show on a word)." }),
      cur.gridSize === 24 ? h("p", { class: "muted", id: "stage-24-note", text: "The 24 board has stages 1-3. On the category folders, the first words show " +
        "as soon as the folder appears; the rest appear at stage 3. When stage 3 is done, VOICE suggests moving up to the 45 board (at its stage 2)." }) : null,
      h("div", { class: "stage-grid" }, stages.map((n) =>
        h("button", {
          type: "button", class: "stage-btn" + (cur.stage === n ? " on" : ""), "data-stage": n,
          onclick: async () => {
            cur.stage = n;
            await saveProfile(cur);
            onVocabChanged();
            refresh();
          },
        },
        h("span", { class: "stage-title", text: "Stage " + n }),
        h("span", { class: "stage-note", text: note[n] + ":" }),
        h("span", { class: "stage-words", text: n === 5 ? S5_TEXT : wordsFor(n) })))),
      stageProgressBlock(cur, model),
      view === "clinician" ? stageRuleBlock(cur, model) : null);
  }

  // Ready for the next stage? (Beta 3.22, js/stagerule.js). Filled in once the everyday summaries are read.
  function stageProgressBlock(cur, model) {
    const box = h("div", { class: "stage-progress", id: "stage-progress" }, h("p", { class: "muted", text: "Checking progress..." }));
    if (!hasNextStep(cur)) { box.replaceChildren(h("p", { class: "muted", text: `Stage ${cur.stage} is the last stage for now.` })); return box; }
    progressFor(cur, model, getTargets()).then((pr) => {
      const r = cleanStageRule(cur.stageRule);
      const pct = pr.need ? Math.min(100, Math.round((pr.have / pr.need) * 100)) : 0;
      box.replaceChildren(
        h("div", { class: "sp-head" }, h("strong", { text: pr.moveUp ? "Ready for the 45 board?" : `Ready for stage ${cur.stage + 1}?` }),
          h("span", { class: "muted", text: pr.mode === "stage5" ? "Rule: stage 5 readiness" : pr.mode === "words" ? "Rule: the chosen words" : `Rule: ${pr.pct}% of stage ${cur.stage} words` })),
        h("div", { class: "sp-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(pr.need), "aria-valuenow": String(Math.min(pr.have, pr.need)) },
          h("div", { class: "sp-fill" + (pr.ready ? " done" : ""), style: `width: ${pct}%` })),
        h("p", { id: "stage-progress-text", text: (pr.mode === "stage5" ? `${pr.have} of ${pr.need} checks met` : pr.note || `${pr.have} of ${pr.mode === "words" ? pr.need : pr.items.length} words proficient · needs ${pr.need}`) + (pr.ready ? " · Ready: VOICE will suggest it at the end of the next session." : "") }),
        h("div", { class: "sp-list" }, pr.items.filter((i) => pr.mode !== "words" || i.chosen).map((i) =>
          h("div", { class: "sp-row", "data-word": i.id }, h("span", { text: i.label }),
            h("span", { class: "sp-chip " + (i.why === "Mastered target" ? "m" : i.proficient ? "e" : "n"), text: i.why })))),
        h("p", { class: "muted", text: pr.mode === "stage5"
          ? "Stage 5 adds folders, not main-board words, so its readiness looks at the whole picture: mastered targets, sentence targets, how many different words the learner uses on their own, and how often their messages have 2 or more words."
          : `Proficient = a mastered target, or used on their own (not modeled, not in a session) on ${r.days}+ days in the last ${r.weeks} weeks.` }));
    }).catch(() => box.replaceChildren(h("p", { class: "muted", text: "Progress could not be read." })));
    return box;
  }

  // The clinician's rule for suggesting the next stage (Clinician view only).
  function stageRuleBlock(cur, model) {
    const r = cleanStageRule(cur.stageRule);
    const save = async (patch) => { cur.stageRule = cleanStageRule({ ...r, ...patch }); await saveProfile(cur); refresh(); };
    const modeBtn = (v, text) => h("button", { type: "button", class: "seg" + (r.mode === v ? " on" : ""), id: "stagerule-" + v, text, onclick: () => save({ mode: v }) });
    const pctVal = h("span", { class: "slider-num", id: "stagerule-pct-val", text: r.pct + "%" });
    const slider = h("input", { type: "range", id: "stagerule-pct", min: 10, max: 100, step: 10, value: r.pct,
      oninput: () => { pctVal.textContent = slider.value + "%"; }, onchange: () => save({ pct: Number(slider.value) }) });
    const stageWords = model.main.filter((b) => b.stage === cur.stage);
    const chosen = new Set(r.words[String(cur.stage)] || []);
    const toggle = (id) => { const list = new Set(chosen); list.has(id) ? list.delete(id) : list.add(id); save({ words: { ...r.words, [String(cur.stage)]: [...list] } }); };
    const num = (key, min, max, label) => {
      const sel = h("select", { class: "text-input sr-select", id: "stagerule-" + key, "aria-label": label, onchange: () => save({ [key]: Number(sel.value) }) },
        Array.from({ length: max - min + 1 }, (_, i) => h("option", { value: String(min + i), text: String(min + i) })));
      sel.value = String(r[key]);
      return sel;
    };
    if (cur.stage === 4 && cur.gridSize !== 24) return stage5RuleBlock(cur, r, save);
    return h("div", { class: "field stage-rule", id: "stage-rule" },
      h("h3", { class: "access-h", text: "When to suggest the next stage (clinician)" }),
      h("div", { class: "seg-row" }, modeBtn("percent", "A share of the stage's words"), modeBtn("words", "Words I choose")),
      r.mode === "percent"
        ? h("div", { class: "slider-row" }, h("label", { for: "stagerule-pct", text: "Words proficient" }), slider, pctVal)
        : h("div", { class: "sr-words", id: "stagerule-words" }, stageWords.map((b) =>
            h("label", { class: "check-line" }, h("input", { type: "checkbox", id: "stagerule-w-" + b.id, checked: chosen.has(b.id), onchange: () => toggle(b.id) }),
              h("span", { text: b.label })))),
      r.mode === "words" ? h("p", { class: "muted", text: `Tick the stage ${cur.stage} words that must be proficient. Each stage keeps its own list.` }) : null,
      h("div", { class: "sr-line" }, h("span", { text: "Everyday use counts after" }), num("days", 1, 14, "Days"), h("span", { text: "days of use in the last" }),
        num("weeks", 1, 12, "Weeks"), h("span", { text: "weeks." })),
      h("p", { class: "muted", text: "VOICE only suggests the next stage at the end of a teaching session; you decide. The progress above is shown in both views." }));
  }

  // Stage 4 -> 5 readiness numbers (Beta 3.26, js/stagerule.js DEFAULT_S5). All must be met.
  function stage5RuleBlock(cur, r, save) {
    const s5 = r.s5;
    const field = (key, label, min, max, step, unit = "") => {
      const val = h("span", { class: "slider-num", id: "s5-" + key + "-val", text: s5[key] + unit });
      const input = h("input", { type: "range", id: "s5-" + key, min, max, step, value: s5[key],
        oninput: () => { val.textContent = input.value + unit; }, onchange: () => save({ s5: { ...s5, [key]: Number(input.value) } }) });
      return h("div", { class: "slider-row" }, h("label", { for: "s5-" + key, text: label }), input, val);
    };
    return h("div", { class: "field stage-rule", id: "stage-rule" },
      h("h3", { class: "access-h", text: "When to suggest stage 5 (clinician)" }),
      h("p", { class: "muted", text: "All of these must be met. Stage 5 adds folders on the Words menu, so it looks at overall language use instead of main-board words." }),
      field("targets", "Mastered targets", 0, 50, 1),
      field("sentences", "...of which sentence targets", 0, 10, 1),
      field("words", "Different words used on their own", 0, 400, 10),
      field("multiPct", "Messages with 2+ words", 0, 100, 5, "%"),
      field("weeks", "Everyday use window (weeks)", 1, 12, 1),
      h("button", { type: "button", class: "btn", id: "s5-defaults", text: "Back to 10 / 1 / 100 / 30% / 4 weeks", onclick: () => save({ s5: null }) }),
      h("p", { class: "muted", text: "VOICE only suggests stage 5 at the end of a teaching session; you decide." }));
  }

  // "Buttons on the board" (Beta 3.9): the five Auto / Always / Never choices for the buttons around the board, on one page.
  function buttonsSection() {
    const cur = getCurrent();
    return h("section", { class: "panel", id: "sec-buttons" },
      h("p", { class: "muted", text: "Auto shows a button from stage 3, when most learners are ready for it. Nothing on the board moves when a button appears." }),
      wordsButtonSetting(cur), littleStripSetting(cur), keyboardButtonSetting(cur), cameraButtonSetting(cur), wordDialSetting(cur));
  }
  // "Reading and typing" (Beta 3.9).
  function readingSection() {
    const cur = getCurrent();
    return h("section", { class: "panel", id: "sec-reading" }, wordsOnlySetting(cur), speakLettersSetting(cur), wordPredictSetting(cur));
  }

  // The top-bar Words button (and the Forms button next to it): Auto shows them from stage 3.
  function wordsButtonSetting(cur) {
    const btn = (value, text) => h("button", {
      type: "button", class: "seg" + (cur.wordsButton === value ? " on" : ""), id: `wordsbtn-${value}`, text,
      onclick: async () => { cur.wordsButton = value; await saveProfile(cur); onVocabChanged(); refresh(); },
    });
    return h("div", { class: "field touch-setting", id: "setting-words-button" },
      h("label", { text: "Show Words button" }),
      h("div", { class: "seg-row" }, btn("auto", autoLabel(cur)), btn("always", "Always"), btn("never", "Never")),
      h("p", { class: "muted", text: "The Words button in the top bar opens pages of little words, actions, describing words, time, colors, " +
        "numbers, clothes, outside words and things (every Dolch sight word is on them, at most 3 taps away). " +
        "The Forms button next to it shows other forms of the last word (go: went, going...). " +
        "Both follow this setting. Words on these pages never move." }));
  }

  // Press-and-hold word-forms dial: hold a word to see its other forms around it (went / going / goes / gone).
  // Three settings, saved per learner (profile.wordDial, see js/profiles.js). They are read when a finger goes
  // down, so nothing on the board needs to be redrawn.
  function wordDialSetting(cur) {
    const d = cur.wordDial;
    const persist = () => saveProfile(cur);
    const modeBtn = (value, text) => h("button", {
      type: "button", class: "seg" + (d.mode === value ? " on" : ""), id: `dial-${value}`, text,
      onclick: async () => { d.mode = value; await persist(); refresh(); },
    });
    const holdNum = h("span", { class: "slider-num", id: "dial-hold-val", text: d.holdSec.toFixed(1) + " s" });
    const holdInput = h("input", { type: "range", id: "dial-hold-slider", min: DIAL_HOLD_MIN, max: DIAL_HOLD_MAX, step: 0.1, value: d.holdSec,
      oninput: () => { d.holdSec = parseFloat(holdInput.value); holdNum.textContent = d.holdSec.toFixed(1) + " s"; persist(); } });
    const markBtn = (value, text) => h("button", {
      type: "button", class: "seg" + (d.markers === value ? " on" : ""), id: `dial-markers-${value ? "on" : "off"}`, text,
      onclick: async () => { d.markers = value; await persist(); refresh(); },
    });
    return h("div", { class: "field touch-setting", id: "setting-word-dial" },
      h("label", { text: "Word forms dial (press and hold a word)" }),
      h("div", { class: "seg-row" }, modeBtn("auto", autoLabel(cur)), modeBtn("always", "Always"), modeBtn("never", "Never")),
      h("p", { class: "muted", text: "Press and hold a word such as go, eat, big, dog or I: its other forms appear around it, always in the same " +
        "directions (past = up, -ing = right, -s = down, past participle = left). Lift on a form, or lift and then tap one, to say it and add it " +
        "to the message bar. Tap outside to cancel. A quick tap still just says the word, with no delay. Words with no forms act like a normal tap. " +
        "The Forms button works as before." }),
      h("div", { class: "slider-row touch-slider" },
        h("label", { for: "dial-hold-slider", text: "Hold time for dial" }), holdInput, holdNum),
      h("p", { class: "muted", text: "If Hold to select (Touch section) is on, the dial opens 0.8 s after the hold-to-select time instead " +
        "(releasing before that selects the word as usual), and this slider is not used." }),
      h("label", { text: "Show form markers" }),
      h("div", { class: "seg-row touch-seg" }, markBtn(true, "On"), markBtn(false, "Off")),
      h("p", { class: "muted", text: "A small picture on each form (arrow back = past, motion lines = -ing, + = -s, two dots = plural, bars = -er / -est, " +
        "a person = pronouns). Turn off for learners who read. This is separate from Show words only." }));
  }

  // The top-bar ABC button (keyboard overlay): Auto shows it from stage 3, like the Words button.
  function keyboardButtonSetting(cur) {
    const btn = (value, text) => h("button", {
      type: "button", class: "seg" + (cur.keyboardButton === value ? " on" : ""), id: `kbbtn-${value}`, text,
      onclick: async () => { cur.keyboardButton = value; await saveProfile(cur); onVocabChanged(); refresh(); },
    });
    return h("div", { class: "field touch-setting", id: "setting-keyboard-button" },
      h("label", { text: "Show keyboard button (ABC)" }),
      h("div", { class: "seg-row" }, btn("auto", autoLabel(cur)), btn("always", "Always"), btn("never", "Never")),
      h("p", { class: "muted", text: "The ABC button in the top bar opens a large keyboard over the board. The child types a word; Space or Done " +
        "turns it into a chip and says it. The keyboard has a 123 key for the number pad (the Numbers page has its own Number pad button). " +
        "The keyboard uses ordinary taps: Hold to select and Ignore repeated taps do not apply to it." }));
  }

  // The top-bar camera button (Beta 3.1): hold 1 second to make a quick scene from a photo. Auto shows it from stage 3, like ABC.
  function cameraButtonSetting(cur) {
    const btn = (value, text) => h("button", {
      type: "button", class: "seg" + (cur.cameraButton === value ? " on" : ""), id: `cambtn-${value}`, text,
      onclick: async () => { cur.cameraButton = value; await saveProfile(cur); onVocabChanged(); refresh(); },
    });
    return h("div", { class: "field touch-setting", id: "setting-camera-button" },
      h("label", { text: "Show camera button" }),
      h("div", { class: "seg-row" }, btn("auto", autoLabel(cur)), btn("always", "Always"), btn("never", "Never")),
      h("p", { class: "muted", text: "The camera button at the right end of the strip under the message bar makes a scene from a photo in one step: hold it for 1 second until it turns green and reads “Tap”, " +
        "then tap it once. A quick tap on its own does nothing. The camera opens, everything VOICE finds in the photo (and anything it remembers from My things) is ticked, " +
        "and “Use now” puts the scene on the strip. It needs no passcode and is switched off while a teaching session runs. " +
        "Scenes made this way are named with the date and time and can be renamed in Scenes." }));
  }

  // The tone wheel (Beta 3.16, js/tones.js + js/tonewheel.js): press and hold the message bar to say it happy, sad, as a question...
  function toneWheelSetting(cur) {
    const set = (v) => async () => { cur.toneWheel = v; await saveProfile(cur); onVocabChanged(); refresh(); };
    const sample = (t) => h("button", { type: "button", class: "btn tone-sample", "data-tone": t.id, text: t.label, onclick: () => speakMessage(SAMPLE_TONE_TEXT, t) });
    return h("div", { class: "field touch-setting", id: "setting-tone-wheel" },
      h("label", { text: "Tone wheel and mood" }),
      h("div", { class: "seg-row" },
        h("button", { type: "button", class: "seg" + (cur.toneWheel === "on" ? "" : " on"), id: "tone-wheel-off", text: "Off", onclick: set("off") }),
        h("button", { type: "button", class: "seg" + (cur.toneWheel === "on" ? " on" : ""), id: "tone-wheel-on", text: "On", onclick: set("on") })),
      h("p", { class: "muted", text: "For learners at stage 4. Press and hold the message bar: 8 feelings appear around the finger (happy, excited, silly, " +
        "question, calm, sad, mad, scared), always in the same spots. Pick one to say the message once in that tone. Rest on one for 1 second (a lock fills in) " +
        "to set it as the learner's mood: every message is said in it until it is changed or VOICE is reopened, and a small face shows in the message bar. " +
        "The centre, Normal, clears the mood. Tones change pitch, speed and the ending of the sentence; Enhanced or Premium voices sound best." +
        (cur.stage < 4 && cur.gridSize !== 24 ? " This learner is at stage " + cur.stage + ", so the wheel will start working at stage 4." : "") }),
      h("div", { class: "btn-row left tone-samples" }, h("span", { class: "muted", text: "Hear the tones:" }), TONES.map(sample)));
  }
  const SAMPLE_TONE_TEXT = "I want to go outside";

  // The little-word strip (Beta 3.7, js/littlewords.js): eight little words in the strip, each holding a dial of four more.
  function littleStripSetting(cur) {
    const btn = (value, text) => h("button", {
      type: "button", class: "seg" + (cur.littleStrip === value ? " on" : ""), id: `littlestrip-${value}`, text,
      onclick: async () => { cur.littleStrip = value; await saveProfile(cur); onVocabChanged(); refresh(); },
    });
    return h("div", { class: "field touch-setting", id: "setting-little-strip" },
      h("label", { text: "Show little-word strip" }),
      h("div", { class: "seg-row" }, btn("auto", autoLabel(cur)), btn("always", "Always"), btn("never", "Never")),
      h("p", { class: "muted", text: "Eight little words (a, is, and, to, will, has, him, there) in the strip under the message bar, always in the same spots. " +
        "Tap one to say it. Press and hold one to open a dial of four more, each always in the same direction: a → an, the, any, every; " +
        "is → was, are, am, were; and → but, or, so, because; to → of, for, with, from; will → would, could, may, must; " +
        "has → had, does, did, been; him → her, us, them, their; there → here, these, those, which. " +
        "When a scene is showing, the scene uses the strip instead. The strip is hidden during teaching sessions. The words also stay on the Little words pages." }));
  }

  // Say each letter's name as it is typed (default off).
  function speakLettersSetting(cur) {
    const mode = (value, text) => h("button", {
      type: "button", class: "seg" + ((cur.letterMode || "names") === value ? " on" : ""), id: `lettermode-${value}`, text,
      onclick: async () => { cur.letterMode = value; await saveProfile(cur); refresh(); },
    });
    const btn = (value, text) => h("button", {
      type: "button", class: "seg" + (cur.speakLetters === value ? " on" : ""), id: `speakletters-${value ? "on" : "off"}`, text,
      onclick: async () => { cur.speakLetters = value; await saveProfile(cur); refresh(); },
    });
    return h("div", { class: "field touch-setting", id: "setting-speak-letters" },
      h("label", { text: "Speak each letter while typing" }),
      h("div", { class: "seg-row touch-seg" }, btn(false, "Off"), btn(true, "On")),
      cur.speakLetters ? h("div", { class: "seg-row touch-seg", id: "letter-mode" }, mode("names", "Letter names"), mode("sounds", "Letter + key word")) : null,
      h("p", { class: "muted", text: "On: every key speaks as it is tapped. Letter names say \"bee\", \"oh\"; Letter + key word says the letter and a word that starts with its sound (\"bee, ball\", \"ess, sun\"). " +
        "Recorded letter sounds will replace this later; iPad voices cannot say a sound on its own." }));
  }

  // Word guesses above the keyboard (Beta 3.28, default off).
  function wordPredictSetting(cur) {
    const btn = (value, text) => h("button", {
      type: "button", class: "seg" + (!!cur.wordPredict === value ? " on" : ""), id: `wordpredict-${value ? "on" : "off"}`, text,
      onclick: async () => { cur.wordPredict = value; await saveProfile(cur); refresh(); },
    });
    return h("div", { class: "field touch-setting", id: "setting-word-predict" },
      h("label", { text: "Word guesses on the keyboard" }),
      h("div", { class: "seg-row touch-seg" }, btn(false, "Off"), btn(true, "On")),
      h("p", { class: "muted", text: "On: three fixed boxes above the keys show words that start with the letters typed so far. Tap one to say it. " +
        "Words this learner has used most in the last 4 weeks come first, then sight words and board words. The boxes never move. " +
        "Leave it off while the goal is spelling the whole word." }));
  }

  // Reading stage: take away every picture so the learner reads the words.
  function wordsOnlySetting(cur) {
    const btn = (value, text) => h("button", {
      type: "button", class: "seg" + (!!cur.wordsOnly === value ? " on" : ""), id: `wordsonly-${value ? "on" : "off"}`, text,
      onclick: async () => { cur.wordsOnly = value; await saveProfile(cur); onVocabChanged(); refresh(); },
    });
    return h("div", { class: "field touch-setting", id: "setting-words-only" },
      h("label", { text: "Show words only (no pictures)" }),
      h("div", { class: "seg-row touch-seg" }, btn(false, "Off"), btn(true, "On")),
      h("p", { class: "muted", text: "Reading stage: hides pictures so the learner reads the words." }));
  }

  // ---------- Voice ----------
  function voiceSection() {
    const cur = getCurrent();
    const v = cur.voice;
    const persist = () => { setVoiceSettings(v); return saveProfile(cur); };

    // The voice picker lists the voices installed on this device (js/voicepicker.js)
    const picker = createVoicePicker({ voice: v, persist, state: pickerState });
    stopVoiceListener = picker.stop;

    // A slider with its current number shown beside it
    function slider(id, label, min, max, step, key, decimals) {
      const num = h("span", { class: "slider-num", id: id + "-val", text: Number(v[key]).toFixed(decimals) });
      const input = h("input", { type: "range", id, min, max, step, value: v[key],
        oninput: () => {
          v[key] = parseFloat(input.value);
          num.textContent = v[key].toFixed(decimals);
          persist();
        } });
      return h("div", { class: "slider-row" }, h("label", { for: id, text: label }), input, num);
    }

    const resetTo = (preset) => () => {
      v.pitch = preset.pitch;
      v.rate = preset.rate;
      persist();
      refresh();
    };

    return h("section", { class: "panel", id: "sec-voice" },
      h("h2", { text: "Voice (for this learner)" }),
      h("div", { class: "field", id: "voice-field" }, picker.el, moreVoicesHelp()),
      slider("pitch", "Pitch", 0.5, 2, 0.1, "pitch", 1),
      slider("rate", "Speed", 0.5, 1.5, 0.05, "rate", 2),
      h("p", { class: "muted", text: "Speed is for a single word. Anything of two or more words (a phrase button, a phrase you added, " +
        "\"thank you\", a typed number) and the message bar use Sentence speed. Sentences sound faster than the same words said one at a time, " +
        "so Sentence speed is its own, slower setting (0.9 to start)." }),
      slider("sentence-rate", "Sentence speed", 0.5, 1.5, 0.05, "sentenceRate", 2),
      pauseSetting(v, persist),
      toneWheelSetting(cur),
      h("div", { class: "btn-row left" },
        h("button", { type: "button", class: "btn primary", id: "voice-preview", text: "Preview a word",
          onclick: () => speak(PREVIEW_WORD) }),
        h("button", { type: "button", class: "btn primary", id: "voice-sample", text: "Hear a sample sentence",
          onclick: () => playSample() }),
        h("button", { type: "button", class: "btn", id: "voice-child", text: "Reset to child default",
          onclick: resetTo(CHILD_VOICE) }),
        h("button", { type: "button", class: "btn", id: "voice-adult", text: "Reset to adult default",
          onclick: resetTo(ADULT_VOICE) })),
      // Uses this learner's voice (speak() reads the current learner's settings)
      volumeTestBlock({}));
  }

  // "Pause between words": Off plays the message bar as one sentence; otherwise chip by chip with a gap.
  function pauseSetting(v, persist) {
    const names = { off: "Off", short: "Short 0.25 s", medium: "Medium 0.5 s", long: "Long 0.8 s" };
    return h("div", { class: "field touch-setting", id: "setting-pause" },
      h("label", { text: "Pause between words" }),
      h("div", { class: "seg-row" }, Object.keys(PAUSE_MS).map((k) => h("button", {
        type: "button", class: "seg" + ((v.pause || "off") === k ? " on" : ""), id: `pause-${k}`, text: names[k],
        onclick: () => { v.pause = k; persist(); refresh(); },
      }))),
      h("p", { class: "muted", text: "Off: tapping the message bar says the whole sentence in one go. Short, Medium or Long: each chip is " +
        "said on its own with a pause after it (a chip such as \"thank you\" is said as one piece). Tap the message bar again to stop." }));
  }

  // The sample sentence is played exactly the way the message bar plays it, with the current settings.
  function playSample() {
    const gap = pauseMs();
    if (gap > 0) speakSequence(PREVIEW_TEXT.split(" "), gap);
    else speak(PREVIEW_TEXT, "sentence");
  }

  // ---------- Touch supports ----------
  // Two optional helps for children who tap too lightly, too often, or by accident.
  // They only affect the child's board (words, category buttons, Back) in normal
  // and modeling mode. Saved per learner.
  function touchSection() {
    const cur = getCurrent();
    const t = cur.touch;
    const persist = () => saveProfile(cur);

    // One setting = Off/On buttons + a slider (only usable when On) + an explanation.
    function setting({ id, title, onKey, secKey, min, max, step, decimals, help }) {
      const num = h("span", { class: "slider-num", id: `${id}-val`, text: Number(t[secKey]).toFixed(decimals) + " s" });
      const input = h("input", { type: "range", id: `${id}-slider`, min, max, step, value: t[secKey],
        disabled: !t[onKey],
        oninput: () => {
          t[secKey] = parseFloat(input.value);
          num.textContent = t[secKey].toFixed(decimals) + " s";
          persist();
        } });
      const offBtn = h("button", { type: "button", class: "seg" + (t[onKey] ? "" : " on"), id: `${id}-off`, text: "Off",
        onclick: () => { t[onKey] = false; persist(); refresh(); } });
      const onBtn = h("button", { type: "button", class: "seg" + (t[onKey] ? " on" : ""), id: `${id}-on`, text: "On",
        onclick: () => { t[onKey] = true; persist(); refresh(); } });
      return h("div", { class: "field touch-setting" },
        h("label", { text: title }),
        h("div", { class: "seg-row touch-seg" }, offBtn, onBtn),
        h("div", { class: "slider-row touch-slider" + (t[onKey] ? "" : " off") },
          h("label", { for: `${id}-slider`, text: "Time" }), input, num),
        h("p", { class: "muted", text: help }));
    }

    return h("section", { class: "panel", id: "sec-touch" },
      h("h2", { text: "Touch (for this learner)" }),
      setting({
        id: "touch-hold", title: "Hold to select", onKey: "holdOn", secKey: "holdSec",
        min: 0.1, max: 2, step: 0.1, decimals: 1,
        help: "The child must keep a finger on a button for this long before it speaks. A ring fills while they hold. " +
          "Lifting early or sliding off does nothing. Helps when a child brushes or swipes across buttons by accident.",
      }),
      setting({
        id: "touch-ignore", title: "Ignore repeated taps", onKey: "ignoreOn", secKey: "ignoreSec",
        min: 0.25, max: 3, step: 0.25, decimals: 2,
        help: "After a word is spoken, taps on any board button are ignored for this long (nothing is shown or said). " +
          "Helps when a child taps the same button again and again. Opening a category does not start the wait.",
      }),
      h("h3", { class: "access-h", text: "More ways to choose (Beta 3.20)" }),
      onOff({ id: "touch-lift", key: "liftOff", title: "Choose when the finger lifts",
        help: "The button under the finger when it LIFTS is chosen, so a child can touch, slide to the right word and let go. The pressed button follows the finger. With Hold to select on, holding still on the new button chooses it." }),
      onOff({ id: "touch-zones", key: "zones", title: "Touches between buttons go to the nearest one",
        help: "A touch that lands in a gap counts for the nearest button (only when it is very close). Not used with Keyguard mode." }),
      onOff({ id: "touch-keyguard", key: "keyguard", title: "Keyguard mode",
        help: "For a plastic keyguard over the iPad: only the middle of each button responds, so touching the keyguard's edges does nothing, and other fingers resting on the keyguard are ignored. Set Button spacing (Accessibility) to match the keyguard's holes." }),
      onOff({ id: "touch-preview", key: "preview", title: "Speak on touch (hear before choosing)",
        help: "The first touch on a button only says its word, in a lower voice, and outlines it; touching it again within 5 seconds chooses it. For learners who scan by listening (low vision) or who need to check before choosing. Off while modeling." }),
      setting({
        id: "touch-dwell", title: "Dwell to select (mouse, trackpad or head pointer)", onKey: "dwellOn", secKey: "dwellSec",
        min: 0.5, max: 3, step: 0.1, decimals: 1,
        help: "Resting a pointer on a button for this long chooses it (a purple ring fills). Not for fingers. On an iPad with Eye Tracking or AssistiveTouch, the iPad's own Dwell control already taps for the learner: leave this Off there.",
      }),
      h("p", { class: "muted", text: "These do not affect the message bar, Delete, Clear or the adult screens. Only the board's buttons use the options under More ways to choose." }),
      scanSection());
  }
  // Switch scanning (Beta 3.21, js/scan.js).
  function scanSection() {
    const cur = getCurrent();
    const sc = cur.scan;
    const save = async () => { await saveProfile(cur); onVocabChanged(); refresh(); };
    const seg = (key, choices) => h("div", { class: "seg-row touch-seg" }, choices.map(([v, label]) =>
      h("button", { type: "button", class: "seg" + (sc[key] === v ? " on" : ""), id: `scan-${key}-${v}`, text: label, onclick: async () => { sc[key] = v; await save(); } })));
    const speedNum = h("span", { class: "slider-num", id: "scan-speed-val", text: sc.speed.toFixed(1) + " s" });
    const speed = h("input", { type: "range", id: "scan-speed", min: 0.5, max: 5, step: 0.1, value: sc.speed, disabled: sc.mode !== "one",
      oninput: () => { sc.speed = parseFloat(speed.value); speedNum.textContent = sc.speed.toFixed(1) + " s"; saveProfile(cur); } });
    const on = sc.mode !== "off";
    return h("div", { class: "scan-settings", id: "scan-settings" },
      h("h3", { class: "access-h", text: "Switch scanning (Beta 3.21)" }),
      h("div", { class: "field touch-setting" }, h("label", { text: "Switches" }),
        seg("mode", [["off", "Off"], ["one", "One switch"], ["two", "Two switches"]]),
        h("p", { class: "muted", text: "One switch: press to start; the highlight moves through the rows on its own, press to open a row, then press to choose a button. " +
          "Two switches: switch 1 moves the highlight, switch 2 chooses. Rows come first, then the buttons in that row; the last row is the message bar (Speak, Delete, Clear). " +
          "Switch keys: one switch = Space, Enter or 1; two switches = Space or 1 to move, Enter or 3 to choose." })),
      on ? h("div", { class: "field touch-setting" }, h("label", { text: "Scan speed (one switch)" }),
        h("div", { class: "slider-row touch-slider" + (sc.mode === "one" ? "" : " off") }, h("label", { for: "scan-speed", text: "Time on each step" }), speed, speedNum),
        h("p", { class: "muted", text: "Start slow (2 to 3 s) and speed up as the learner gets quicker." })) : null,
      on ? h("div", { class: "field touch-setting" }, h("label", { text: "Rounds before it waits (one switch)" }),
        seg("loops", [[1, "1"], [2, "2"], [3, "3"], [5, "5"]]),
        h("p", { class: "muted", text: "If nothing is chosen, it goes round this many times, then waits for the next press (inside a row it goes back to the rows)." })) : null,
      on ? h("div", { class: "field touch-setting" }, h("label", { text: "Touch the screen as a switch" }),
        seg("screen", [[false, "Off"], [true, "On"]]),
        h("p", { class: "muted", text: "A touch anywhere is the switch (with two switches: the left half moves, the right half chooses). The board's buttons then do not respond to touch. The adult circle still works." })) : null,
      on ? h("div", { class: "field touch-setting" }, h("label", { text: "Say each button as it lights up" }),
        seg("cues", [[false, "Off"], [true, "On"]]),
        h("p", { class: "muted", text: "Auditory scanning: VOICE quietly says each row's first word and each button, in a lower voice, for learners who choose by listening." })) : null,
      on ? h("p", { class: "muted", id: "scan-note", text: "On iPad, do not also turn on the iPad's own Switch Control (Settings > Accessibility): it would take the switch presses. Scanning pauses in Edit mode, Model mode, the keyboard and the adult menu." }) : null);
  }
  // One plain Off / On setting (Beta 3.20 touch options).
  function onOff({ id, key, title, help }) {
    const cur = getCurrent(), t = cur.touch;
    const set = (v) => async () => { t[key] = v; await saveProfile(cur); refresh(); };
    return h("div", { class: "field touch-setting", id },
      h("label", { text: title }),
      h("div", { class: "seg-row touch-seg" },
        h("button", { type: "button", class: "seg" + (t[key] ? "" : " on"), id: id + "-off", text: "Off", onclick: set(false) }),
        h("button", { type: "button", class: "seg" + (t[key] ? " on" : ""), id: id + "-on", text: "On", onclick: set(true) })),
      h("p", { class: "muted", text: help }));
  }

  // ---------- Backup and restore ----------
  function backupSection() {
    const cur = getCurrent();
    const status = h("p", { class: "backup-status", id: "backup-status", role: "status", text: backupMessage });
    const run = async (fn) => {
      try { backupMessage = await fn(); }
      catch (e) { backupMessage = "That did not work: " + (e && e.message ? e.message : "unknown problem"); }
      status.textContent = backupMessage;
    };
    const fileIn = h("input", { type: "file", accept: ".json,application/json", id: "restore-file", class: "file-hidden",
      onchange: async () => {
        const f = fileIn.files && fileIn.files[0];
        fileIn.value = "";                     // so choosing the same file again still works
        if (!f) return;
        const msg = await restoreFromFile(f);
        if (msg) { backupMessage = msg; await onLearnerChanged(); refresh(); }
      } });
    // Teaching data (targets, sessions and trials) is on by default; untick it to leave it out of the file.
    const teachBox = h("input", { type: "checkbox", id: "backup-teaching" });
    teachBox.checked = true;
    // Everyday use data (which words were used and when) is on by default too.
    const everydayBox = h("input", { type: "checkbox", id: "backup-everyday" });
    everydayBox.checked = true;
    // Scenes with their photos (Beta 3.0) are on by default too; the photos can make the file large, so it can be left out.
    const scenesBox = h("input", { type: "checkbox", id: "backup-scenes" });
    scenesBox.checked = true;
    const opts = () => ({ teaching: teachBox.checked, everyday: everydayBox.checked, scenes: scenesBox.checked });
    return h("section", { class: "panel", id: "sec-backup" },
      h("h2", { text: "Backup" }),
      // Beta 3.4: how safe this device's data is (js/keepdata.js), with the Home Screen steps when VOICE is in a Safari tab.
      (() => { const d = dataSafetyLine(); return h("p", { class: "keep-line " + (d.ok === true ? "ok" : d.ok === false ? "warn" : ""), text: d.text }); })(),
      needsHomeScreen() ? homeScreenSteps() : null,
      h("p", { class: "muted", text:
        "A backup is one file with a learner's board size, stage, button changes, pages you made, voice and speech pacing, keyboard settings, touch settings, Model prompt settings and photos. " +
        "On the iPad, a save sheet opens: choose Save to Files. The passcode is not included. A backup of all learners also keeps the teaching templates you edited." }),
      h("label", { class: "check-line", for: "backup-teaching" }, teachBox,
        h("span", { text: "Include teaching data (targets, sessions and trials)" })),
      h("label", { class: "check-line", for: "backup-everyday" }, everydayBox,
        h("span", { text: "Include everyday use data (words used and when, for progress reports)" })),
      h("label", { class: "check-line", for: "backup-scenes" }, scenesBox,
        h("span", { text: "Include scenes and photos (the photos you took for Scenes; they stay in the file only)" })),
      h("div", { class: "btn-row left" },
        h("button", { type: "button", class: "btn primary", id: "backup-one", text: "Save backup of this learner",
          onclick: () => run(async () => "Saved " + await saveBackup([cur], cur.name, opts()) + ". Keep it somewhere safe.") }),
        h("button", { type: "button", class: "btn", id: "backup-all", text: "Save backup of all learners",
          onclick: () => run(async () => "Saved " + await saveBackup(listProfiles(), "all", { ...opts(), templates: true }) + ". Keep it somewhere safe.") }),
        h("label", { class: "btn", for: "restore-file", id: "restore-btn", text: "Restore from backup" }),
        fileIn),
      status);
  }

  // ---------- About ----------
  function aboutSection() {
    return h("section", { class: "panel", id: "sec-about" },
      h("h2", { text: "About" }),
      h("div", { class: "btn-row left" },
        h("button", { type: "button", class: "btn", id: "about-open", text: "About VOICE", onclick: () => openAbout() }),
        // Beta 3.5: for new staff or parents, point at the adult-menu circle again (js/adulthint.js)
        h("button", { type: "button", class: "btn", id: "show-adult-hint", text: "Show where the adult menu is",
          onclick: () => { close(); setTimeout(() => showCoach(), 250); } })));
  }

  refresh();
}
