// The little-word strip (Beta 3.7). Eight little words in permanent slots in the context strip under the message bar, so "a", "is",
// "and", "to"... are one tap away instead of three (Words menu > Little words). Each slot is the head of a GROUP: press and hold it and
// the same dial as the word-forms dial opens with four related words, each always in the same direction:
//
//      tap      hold ↑ (N)   hold → (E)   hold ↓ (S)   hold ← (W)
//      a        an           the          any          every        which thing
//      is       was          are          am           were         "be" words        (up = past, as on the forms dial)
//      and      but          or           so           because      joining ideas
//      to       of           for          with         from         how things connect
//      will     would        could        may          must         maybe and must
//      has      had          does         did          been         helper words      (up = past)
//      him      her          us           them         their        people words
//      there    here         these        those        which        pointing words
//
// MOTOR PLANNING. The slots never move: slot 1 is always "a", at the left of the strip, on every page and both board sizes. The dial words
// always open in the same direction. Nothing on the board moves; the strip is the context strip, which already belongs to scenes and sessions.
// WHEN IT SHOWS (js/app.js decides): learner setting "Show little-word strip" (Auto = stage 3 and up, Always, Never), and only on the child's
// board: a scene takes the strip over while it is active, a teaching session owns the strip, and it is hidden in Edit mode and Add targets.
// The words also stay where they always were on the Little words pages (two routes to the same word, by design).
import { h } from "./ui.js";
import { fitLabels } from "./board.js";
import { wordInfo } from "./scenewords.js";
import { caseLabel } from "./access.js";

export const GROUPS = [
  { head: "a",     N: "an",    E: "the",   S: "any",  W: "every" },
  { head: "is",    N: "was",   E: "are",   S: "am",   W: "were" },
  { head: "and",   N: "but",   E: "or",    S: "so",   W: "because" },
  { head: "to",    N: "of",    E: "for",   S: "with", W: "from" },
  { head: "will",  N: "would", E: "could", S: "may",  W: "must" },
  { head: "has",   N: "had",   E: "does",  S: "did",  W: "been" },
  { head: "him",   N: "her",   E: "us",    S: "them", W: "their" },
  { head: "there", N: "here",  E: "these", S: "those", W: "which" },
];
const SLOTS = ["N", "E", "S", "W"];
const GAP = 5;

let bar = null, layoutKey = "";

/** Create the strip inside the context strip (once, at start). Returns the bar element (press handling is attached by js/app.js). */
export function init(stripEl) {
  bar = h("div", { id: "little-bar", "aria-label": "Little words" });
  stripEl.appendChild(bar);
  return bar;
}

/** Which group a strip button is. */
export const groupOf = (el) => GROUPS[Number(el && el.dataset.group)] || null;

/** What a word looks like and says for this learner (their renamed label and spoken text win). */
export function info(id) {
  return wordInfo(id) || { id, label: id, spoken: id, image: null, isPhoto: false };
}

/** The dial entries of a group, in the forms dial's format: [{ word, type, slot, id, spoken }]. */
export function entriesFor(group) {
  return SLOTS.filter((s) => group[s]).map((s) => {
    const w = info(group[s]);
    return { word: w.label, spoken: w.spoken, type: "little", slot: s, id: group[s] };
  });
}

/** Draw the strip when it is showing and its size changed (cheap to call on every board redraw). */
export function layout() {
  if (!bar) return;
  const key = bar.clientWidth + "x" + bar.clientHeight;
  if (key === layoutKey && bar.firstChild) return;
  render();
}
/** Force a redraw (the learner changed, or their word labels changed). */
export function refresh() { layoutKey = ""; layout(); }

function render() {
  bar.replaceChildren();
  layoutKey = "";
  const barH = bar.clientHeight, barW = bar.clientWidth;
  if (barW < 100 || barH < 20) return;                     // not showing
  layoutKey = barW + "x" + barH;
  // About square buttons from the strip's height, never wider than an eighth of the room (so all eight always fit).
  const w = Math.max(44, Math.min(Math.round(barH * 1.08), 120, Math.floor((barW - GAP * 7) / 8)));
  GROUPS.forEach((g, i) => {
    const wi = info(g.head);
    const el = h("div", { class: "cell tap lw-item", role: "button", "data-group": String(i), "data-id": g.head,
      "aria-label": wi.label + " (hold for more little words)" });
    el.style.width = w + "px";
    const img = h("div", { class: "cell-image" });
    if (wi.image) {
      const im = h("img", { class: wi.isPhoto ? "photo" : "symbol", alt: "", draggable: "false" });
      im.src = wi.image;
      img.append(im);
    } else el.classList.add("text-only");
    // four tiny dots at the edges say "this button has a dial" (the adult can still read the plain word)
    el.append(img, h("div", { class: "cell-label" }, h("span", { class: "lbl", text: caseLabel(wi.label) })), h("span", { class: "lw-dots", "aria-hidden": "true" }));
    bar.append(el);
  });
  fitLabels(bar);
}
