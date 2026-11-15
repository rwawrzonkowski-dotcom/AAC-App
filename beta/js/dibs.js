// Dibs the pigeon (Beta 3.31): VOICE's mascot. Besides being a model critter (js/critters.js), he gives ADULTS tips:
// on the "this is the adult menu" pointer, in the model prompt settings, in the session summary and in the stage suggestions.
// He never appears on the child's board outside Model mode, and his tips never speak, so they cannot become a toy.
import { h } from "./ui.js";

export const DIBS_SRC = "images/critters/dibs.svg";

/** A tip from Dibs: his picture and a speech bubble. */
export function dibsTip(text, id) {
  return h("div", { class: "dibs-tip", ...(id ? { id } : {}) },
    h("img", { src: DIBS_SRC, alt: "Dibs the pigeon", draggable: "false" }),
    h("p", { class: "dibs-said", text }));
}
