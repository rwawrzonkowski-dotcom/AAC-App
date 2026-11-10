// Warnings when VOICE cannot use its saved data (Beta 3.17). Found in the Nov 10 review: these used to be silent.
//
//  1. OPEN PROBLEM (at start): the iPad's database could not be opened (js/db.js gives up after 4 seconds). VOICE then had no learners
//     to read, so it showed the "Set up VOICE" screen as if the iPad were new. A family could think their learner was gone, and anything
//     they set up was lost at the next restart. Now a full-screen warning comes first: Try again (reloads VOICE) or Continue without
//     saving. The learners are almost always still there; closing VOICE fully and opening it again usually fixes it.
//     While running without saving, a small red "Not saving" tag shows in the message-bar corner (for adults).
//
//  2. WRITE PROBLEM (any time): the database opened but a save failed (most often: the iPad is out of storage). A one-time adult
//     notice explains what to do. It waits while a teaching session runs or another adult sheet is open, so it never interrupts a trial.
import { h, openOverlay } from "./ui.js";
import { storageProblem, onStorageProblem } from "./db.js";

/** At start, before the setup screen: true when the open problem happened (the warning has been shown and the adult chose to continue). */
export async function checkOpenProblem() {
  if (!storageProblem().open) return false;
  await new Promise((resolve) => {
    const screen = h("div", { class: "setup-screen data-warning", id: "data-warning", role: "alertdialog", "aria-labelledby": "dw-title" },
      h("div", { class: "setup-card dw-card" },
        h("h1", { id: "dw-title", text: "VOICE could not open its saved data" }),
        h("p", { class: "dw-text", text: "Your learners and their words are most likely still on this iPad. VOICE just could not reach them this time." }),
        h("ol", { class: "keep-steps dw-steps" },
          h("li", { text: "Tap Try again." }),
          h("li", { text: "If this screen comes back: close VOICE fully (swipe up from the bottom, then swipe VOICE away) and open it again." }),
          h("li", { text: "Still here? Restart the iPad, then open VOICE." })),
        h("div", { class: "btn-row dw-buttons" },
          h("button", { type: "button", class: "btn primary dw-retry", id: "dw-retry", text: "Try again", onclick: () => location.reload() })),
        h("p", { class: "dw-continue-note muted", text: "Need to talk right now? You can continue, but nothing done now will be saved, and the setup screen will appear. Do not set up the learner again or restore a backup this way." }),
        h("button", { type: "button", class: "link-btn dw-continue", id: "dw-continue", text: "Continue without saving",
          onclick: () => { screen.remove(); resolve(); } })));
    document.body.appendChild(screen);
  });
  return true;
}

/** The small "Not saving" tag for adults (message-bar corner), while running in memory only. */
export function showNotSavingTag(host) {
  if (!host || document.getElementById("not-saving-tag")) return;
  host.appendChild(h("span", { id: "not-saving-tag", text: "Not saving" }));
}

/** Watch for failed saves. busy(): true while the notice must wait (a teaching session, another sheet). Call once at start. */
export function watchWriteProblems({ busy, tagHost }) {
  const show = () => {
    if (busy && busy()) { setTimeout(show, 3000); return; }
    showNotSavingTag(tagHost);
    const o = openOverlay([
      h("h2", { id: "dw-write-title", text: "VOICE could not save" }),
      h("p", { text: "A change could not be saved on this iPad. The most common reason is that the iPad is out of storage space. Recent changes (words, settings, teaching or everyday data) may be lost when VOICE closes." }),
      h("ol", { class: "keep-steps" },
        h("li", { text: "Free up space: Settings > General > iPad Storage (delete unused apps, videos or photos)." }),
        h("li", { text: "Then save a backup: Adult menu > Backup > “Save backup of all learners”." }),
        h("li", { text: "Close VOICE fully and open it again." })),
      h("div", { class: "btn-row" },
        h("button", { type: "button", class: "btn primary", id: "dw-write-ok", text: "Got it", onclick: () => o.close() })),
    ], { sheetClass: "small keep-notice dw-write" });
  };
  const start = () => setTimeout(show, 400);         // after the tap that caused the save has finished
  if (storageProblem().write) start();
  else {
    const off = onStorageProblem((kind) => { if (kind === "write") { off(); start(); } });
  }
}
