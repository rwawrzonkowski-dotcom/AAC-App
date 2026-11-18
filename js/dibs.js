// Dibs the pigeon (Beta 3.31): VOICE's mascot. Besides being a model critter (js/critters.js), he gives ADULTS tips:
// on the "this is the adult menu" pointer, in the model prompt settings, in the session summary and in the stage suggestions.
// He never appears on the child's board outside Model mode, and his tips never speak, so they cannot become a toy.
import { h } from "./ui.js";

export const DIBS_SRC = "images/critters/dibs.svg";

/** A tip from Dibs: his picture and a speech bubble. */
export function dibsTip(text, id) { return friendTip("dibs", "Dibs the pigeon", text, id); }

/** A tip from one of Dibs's friends (Beta 3.35), e.g. Chance the Snapper on locking the screen sideways. */
export function friendTip(critter, alt, text, id) {
  return h("div", { class: "dibs-tip", ...(id ? { id } : {}) },
    h("img", { src: `images/critters/${critter}.svg`, alt, draggable: "false" }),
    h("p", { class: "dibs-said", text }));
}

// Chance's tip (Beta 3.35). On an iPad, Rotation Lock keeps the screen the way it is held, so it must be turned on while the iPad is
// sideways. (An iPhone can only lock upright, so phones do not get this tip.)
export const LANDSCAPE_LOCK_TIP = "Chance here! Keep V.O.I.C.E. sideways: hold the iPad sideways, swipe down from the top-right corner " +
  "to open Control Center, then tap the lock with the circle arrow. The screen stays sideways until you tap it again.";
