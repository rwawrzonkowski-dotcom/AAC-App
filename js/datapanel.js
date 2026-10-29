// Adult menu > "Data: everyday use" (Beta 2.2). The settings for everyday recording (js/everyday.js) and a small check panel that
// shows the numbers are coming in. It is only a sanity view: the real reports come in a later round.
import { h, openOverlay } from "./ui.js";
import { getCurrent } from "./profiles.js";
import * as E from "./everyday.js";
import { deleteSessionData } from "./teachdata.js";

const RETENTION_TEXT = { 90: "90 days", 180: "180 days", 365: "1 year", 0: "Forever" };
const n = (count, one, many = one + "s") => count.toLocaleString() + " " + (count === 1 ? one : many);
const timeText = (t) => new Date(t).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });

// ctx: { refresh() rebuilds the menu, sessionActive() true while a teaching session runs }
export function dataSection(ctx) {
  const cur = getCurrent();
  const set = E.getSettings(cur.id);
  const check = h("div", { class: "data-check", id: "data-check" }, h("p", { class: "muted", text: "Loading..." }));

  const recBtn = (on, text) => h("button", { type: "button", class: "seg" + (set.record === on ? " on" : ""), id: on ? "rec-on" : "rec-off", text,
    onclick: () => { E.setSettings(cur.id, { record: on }); ctx.refresh(); } });
  const retBtn = (days) => h("button", { type: "button", class: "seg" + (set.retentionDays === days ? " on" : ""), id: "ret-" + days, text: RETENTION_TEXT[days],
    onclick: () => { E.setSettings(cur.id, { retentionDays: days }); ctx.refresh(); } });

  const section = h("section", { class: "panel", id: "sec-data" },
    h("h2", { text: "Data: everyday use (for this learner)" }),
    h("p", { class: "muted", text: "Saves which words are used and when, on this iPad only. Used for progress reports. " +
      "Nothing is sent anywhere; it leaves this iPad only in a backup you save. It never changes the board or slows the speech." }),
    h("div", { class: "field touch-setting", id: "setting-record" },
      h("label", { text: "Record everyday use" }),
      h("div", { class: "seg-row touch-seg" }, recBtn(true, "On"), recBtn(false, "Off")),
      h("div", { class: "btn-row left" },
        h("button", { type: "button", class: "btn", id: "rec-pause", text: set.record ? "Pause recording" : "Resume recording",
          onclick: () => { E.setSettings(cur.id, { record: !set.record }); ctx.refresh(); } })),
      h("p", { class: "muted", text: set.record
        ? "Recording is on for " + cur.name + ". Teaching sessions are saved either way, because you start them yourself."
        : "Recording is paused for " + cur.name + ": nothing new is saved. What was saved before is kept." })),
    h("div", { class: "field touch-setting", id: "setting-retention" },
      h("label", { text: "Keep detailed records for" }),
      h("div", { class: "seg-row" }, E.RETENTION_CHOICES.map(retBtn)),
      h("p", { class: "muted", text: "Every word tap and message is kept for this long, then deleted when the app starts. " +
        "The daily summaries (counts per day, new words) are kept forever." })),
    check,
    h("div", { class: "btn-row left" },
      h("button", { type: "button", class: "btn danger", id: "data-clear", text: "Clear this learner's everyday data...",
        onclick: () => openClearDialog(cur, ctx) })));
  fillCheck(cur, check, set);
  return section;
}

// The numbers. Reads a handful of rows (today's summary, first-use list, the last 10 messages), so it opens quickly even with
// tens of thousands of saved taps.
async function fillCheck(cur, el, set) {
  try {
    const today = E.localDate(Date.now());
    const d = new Date(); d.setDate(d.getDate() - 6);
    const weekStart = E.dayStart(E.localDate(d.getTime()));
    const [day, fresh, utts, info] = await Promise.all([E.getDay(cur.id, today), E.newWordsSince(cur.id, weekStart),
      E.lastUtterances(cur.id, 10), E.storageInfo(cur.id)]);
    const tile = (id, label, value) => h("div", { class: "data-tile", id }, h("div", { class: "data-num", text: String(value) }), h("div", { class: "muted", text: label }));
    el.replaceChildren(
      h("h3", { text: "Check" }),
      h("div", { class: "data-tiles" },
        tile("dc-taps", "learner taps today", day.learnerTaps),
        tile("dc-unique", "different words today", day.uniqueWords.length),
        tile("dc-recording", "recording", set.record ? "On" : "Off"),
        tile("dc-storage", "storage used", E.formatBytes(info.bytes)),
        tile("dc-retention", "detailed records kept", RETENTION_TEXT[set.retentionDays])),
      h("p", { class: "muted", id: "dc-counts", text: `${n(info.events, "word tap")} and ${n(info.utterances, "message")} saved, ${n(info.days, "daily summary", "daily summaries")}.` }),
      h("h3", { text: "New words in the last 7 days (" + fresh.length + ")" }),
      fresh.length ? h("div", { class: "data-chips", id: "dc-new" }, fresh.map((f) => h("span", { class: "data-chip", text: f.label })))
                   : h("p", { class: "muted", id: "dc-new", text: "None yet." }),
      h("h3", { text: "Last messages" }),
      utts.length ? h("ol", { class: "data-utts", id: "dc-utts" }, utts.map((u) => h("li", {},
        h("span", { class: "muted", text: timeText(u.time) + (u.mixed ? " (with an adult's help)" : "") + ": " }),
        u.chips.map((c) => h("span", { class: "data-chip", text: c.label })))))
                  : h("p", { class: "muted", id: "dc-utts", text: "No messages yet." }));
  } catch (e) {
    el.replaceChildren(h("p", { class: "muted", text: "The numbers could not be read." }));
    console.warn(e);
  }
}

// "Clear this learner's everyday data...": asks first. Teaching sessions and trials are only deleted when the second box is ticked.
function openClearDialog(cur, ctx) {
  const busy = ctx.sessionActive();
  const teachBox = h("input", { type: "checkbox", id: "clear-teaching", disabled: busy });
  const o = openOverlay([
    h("h2", { text: "Clear everyday data?" }),
    h("p", { class: "confirm-text", text: `This erases the saved word taps, messages, daily summaries and new-word history of ${cur.name} from this iPad. ` +
      "It cannot be undone. Backups you already saved are not touched." }),
    h("label", { class: "check-line", for: "clear-teaching" }, teachBox,
      h("span", { text: "Also clear teaching data (sessions and trials; targets and their settings stay)" })),
    busy ? h("p", { class: "muted", text: "End the running teaching session first to clear teaching data." }) : null,
    h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn", id: "clear-cancel", text: "Cancel", onclick: () => o.close() }),
      h("button", { type: "button", class: "btn danger", id: "clear-go", text: "Clear", onclick: async () => {
        const alsoTeaching = teachBox.checked && !busy;
        o.close();
        await E.clearEveryday(cur.id);
        if (alsoTeaching) await deleteSessionData(cur.id);
        ctx.refresh();
      } })),
  ], { sheetClass: "small" });
}
