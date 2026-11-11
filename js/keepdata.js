// Keeping this iPad's saved data (Beta 3.4). Everything VOICE saves (learners, button changes, photos, scenes, teaching and everyday
// data) lives in this browser's storage on this device. Two things protect it:
//
//  1. navigator.storage.persist(): asks the browser to treat VOICE's data as "keep, do not clear to save space". Asked once at every
//     start (it is quiet: no pop-up on iPad, and Chrome decides on its own). The answer is shown in Adult menu > Backup.
//  2. The Home Screen. iPadOS / iOS Safari may ERASE a website's saved data after about 7 days without using it. An app opened from
//     its Home Screen icon is not on that 7-day clock. So when VOICE runs in a normal Safari tab on an iPad or iPhone, an adult-styled
//     notice explains how to add it to the Home Screen. It shows at most once a day and never during a teaching session.
//
//  IMPORTANT (iPad): the Home Screen copy has its OWN storage, separate from Safari's. Learners set up in a Safari tab do not appear in the
//  Home Screen copy by themselves: save a backup in Safari first, then restore it in the Home Screen copy. The notice says so.
import { h, openOverlay } from "./ui.js";
import { isIOS } from "./devicetips.js";
import * as store from "./storage.js";

let persisted = null;      // true / false once known; null when the browser has no answer

/** Is VOICE running as a Home Screen app (not inside a browser tab)? */
export function isHomeScreenApp() {
  try {
    if (window.navigator.standalone === true) return true;                                   // iPad / iPhone Safari
    return !!(window.matchMedia && window.matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches);
  } catch { return false; }
}

/** Ask the browser to keep VOICE's data. Never throws; resolves to true, false or null. */
export async function requestPersistence() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return (persisted = null);
    persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch { persisted = null; }
  return persisted;
}

/** Does this device need the "Add to Home Screen" notice? (iPad or iPhone, running in a Safari tab.) */
export const needsHomeScreen = () => isIOS() && !isHomeScreenApp();

/** One line for Adult menu > Backup: how safe this device's data is. { ok, text } */
export function dataSafetyLine() {
  if (needsHomeScreen()) return { ok: false, text: "Not protected: VOICE is open in a Safari tab, so Safari may erase its data after about a week without use. Add VOICE to the Home Screen (see below) and keep a backup." };
  if (isHomeScreenApp()) return { ok: true, text: "Protected: VOICE is running from the Home Screen, so its data is kept. Still save a backup now and then." };
  if (persisted === true) return { ok: true, text: "Protected: this browser has agreed to keep VOICE's data. Still save a backup now and then." };
  return { ok: null, text: "This browser may clear VOICE's data if the device runs low on space. Save a backup now and then." };
}

/** The how-to, as elements (used by the notice and by Adult menu > Backup). */
export function homeScreenSteps() {
  return h("ol", { class: "keep-steps" },
    h("li", { text: "In Safari, tap the Share button (the square with an arrow pointing up)." }),
    h("li", { text: "Choose “Add to Home Screen”, then tap Add." }),
    h("li", { text: "From now on, open VOICE from its new icon, not from Safari." }),
    h("li", { text: "Already set up learners here in Safari? First save a backup (Adult menu > Backup > “Save backup of all learners”), then open the new icon and choose “Restore from a backup file” on its setup screen. The icon has its own storage and starts empty." }));
}

const SHOWN_KEY = "keepdata.noticeShown";          // the date the notice last showed (YYYY-MM-DD)
const today = () => new Date().toISOString().slice(0, 10);

/** At start: show the notice when needed, at most once a day. busy(): true while it must not show (e.g. a teaching session).
 *  Returns a promise that resolves once the notice is closed (or at once when it does not show). */
export function maybeShowNotice({ busy } = {}) {
  if (!needsHomeScreen()) return Promise.resolve();
  if (store.load(SHOWN_KEY, "") === today()) return Promise.resolve();
  if (busy && busy()) return Promise.resolve();
  store.save(SHOWN_KEY, today());
  let resolveClosed;
  const closed = new Promise((r) => { resolveClosed = r; });
  const o = openOverlay([
    h("h2", { text: "Keep VOICE's words and data safe" }),
    h("p", { text: "VOICE is open in a Safari tab. Safari may erase a website's saved data (learners, button changes, photos, teaching data) after about a week without use. VOICE opened from the Home Screen is kept." }),
    homeScreenSteps(),
    h("div", { class: "btn-row" },
      h("button", { class: "btn primary", type: "button", text: "Got it", onclick: () => { o.close(); resolveClosed(); } })),
  ], { sheetClass: "small keep-notice" });
  return closed;            // resolves when the adult taps "Got it" (so the next hint waits its turn)
}
