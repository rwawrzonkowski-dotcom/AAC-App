// Making the adult-menu circle findable for adults (Beta 3.5), without making it a toy for the child.
// The circle sits at the top-left of the context strip and opens the adult menu after a 3-second hold (js/hold.js, js/app.js).
//   1. A muted gear icon inside the circle (index.html): the familiar "settings" sign.
//   2. A quick tap shows a silent note for 2.5 seconds: "Adults: hold 3 seconds to open the menu". Nothing speaks, so a tap is not rewarded.
//   3. Once per learner, when their board first shows, a pointer says "This is the adult menu". Adult menu > About > "Show where the
//      adult menu is" shows it again (for new staff or parents). It never shows during a teaching session, in edit mode, or over a menu.
// Nothing here changes the board: the pointer is a layer on top that goes away with "Got it".
import { h, toast } from "./ui.js";
import * as store from "./storage.js";

const QUICK_TAP_MS = 700;
const seenKey = (learnerId) => "adultHintSeen." + learnerId;

/** The tap hint on the circle. */
export function initAdultHint(btn) {
  let t0 = 0;
  btn.addEventListener("pointerdown", () => { t0 = Date.now(); });
  btn.addEventListener("pointerup", () => {
    if (t0 && Date.now() - t0 < QUICK_TAP_MS) toast("Adults: hold 3 seconds to open the menu", 2500);
    t0 = 0;
  });
  btn.addEventListener("pointercancel", () => { t0 = 0; });
}

/** Show the pointer once for this learner, if now is a good moment (ok() says so). */
export function maybeShowCoach(learnerId, ok) {
  if (!learnerId || store.load(seenKey(learnerId), false)) return;
  if (document.querySelector(".coach-layer") || !ok()) return;
  showCoach(() => store.save(seenKey(learnerId), true));
}

/** The pointer itself: a soft dim layer, a pulsing ring around the circle and a bubble beside it. */
export function showCoach(onDone) {
  const btn = document.getElementById("adult-hold");
  if (!btn || document.querySelector(".coach-layer")) return;
  const r = btn.getBoundingClientRect();
  const pad = Math.max(6, r.width * 0.18);
  const ring = h("div", { class: "coach-ring" });
  ring.style.cssText = `left:${r.left - pad}px; top:${r.top - pad}px; width:${r.width + 2 * pad}px; height:${r.height + 2 * pad}px;`;
  const close = () => { layer.remove(); if (onDone) onDone(); };
  const bubble = h("div", { class: "coach-bubble", role: "dialog", "aria-label": "Where the adult menu is" },
    h("h3", { text: "This is the adult menu" }),
    h("p", { text: "Hold this circle for 3 seconds to open it: learners, editing, teaching, scenes, reports, voice and backup." }),
    h("p", { class: "muted", text: "A quick tap only shows a reminder, and the menu asks for your 4-digit passcode, so a child can't open it by accident." }),
    h("div", { class: "btn-row" }, h("button", { class: "btn primary", type: "button", text: "Got it", onclick: close })));
  bubble.style.cssText = `left:${r.right + pad + 18}px; top:${Math.max(8, r.top - pad)}px;`;
  const layer = h("div", { class: "coach-layer" }, ring, bubble);
  document.body.append(layer);
}
