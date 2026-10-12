// Word forms (Phase 1.6B): the "Forms" button in the top bar.
//
// data/word-forms.json lists word FAMILIES, for example ["go", "goes", "going", "went", "gone"].
// When the last word in the message bar belongs to a family (and the family has at least two
// different words), the Forms button turns on. Tapping it opens a big popover with the whole family
// as large buttons; choosing one replaces the last word and speaks it.
//
// The popover is a see-through layer on top of the screen (position: fixed), so the grid behind it
// never moves or resizes. Tapping outside the popover closes it.
import { attachPressHandling } from "./board.js";

let families = [];            // each: an array of words
const index = new Map();      // lower-case word -> its family
const dials = new Map();      // lower-case HEAD word (the first word of a family) -> its dial (see below)

// Load the families once. If the file cannot be read, Forms simply stays off.
export async function loadForms() {
  try {
    const data = await (await fetch("data/word-forms.json")).json();
    families = [];
    index.clear();
    dials.clear();
    for (const section of ["verbs", "adjectives", "nouns", "pronouns"]) {
      for (const fam of data[section] || []) {
        const words = [...new Set(fam)];                 // (a family may list a word twice, e.g. "read")
        families.push(words);
        for (const w of words) if (!index.has(w.toLowerCase())) index.set(w.toLowerCase(), words);
        const entries = dialEntries(section, words);
        if (entries.length && !dials.has(words[0].toLowerCase())) dials.set(words[0].toLowerCase(), { head: words[0], section, entries });
      }
    }
  } catch (e) {
    console.warn("Word forms unavailable:", e);
  }
}

// The family of this word (an array of at least two words), or null if it has none.
export function formsFor(text) {
  const fam = index.get(String(text || "").trim().toLowerCase());
  return fam && fam.length > 1 ? fam : null;
}

export const familyCount = () => families.length;

// Show the popover. Returns { close, button(word) }.
//   forms        the family (array of words)
//   current      the word now in the message bar (drawn with a heavier outline)
//   pressOptions the child's touch supports (hold to select / ignore repeats), same as the grid
//   onChoose(w)  a form was chosen
//   onClose()    the popover went away (outside tap, or after a choice)
export function openFormsPopover({ forms, current, pressOptions, onChoose, onClose }) {
  const backdrop = document.createElement("div");
  backdrop.id = "forms-backdrop";
  const pop = document.createElement("div");
  pop.id = "forms-popover";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", "Forms of " + current);
  pop.style.setProperty("--forms-cols", String(forms.length <= 3 ? forms.length : forms.length <= 6 ? 3 : 4));
  for (const w of forms) {
    const b = document.createElement("div");
    b.className = "form-btn" + (w.toLowerCase() === String(current).toLowerCase() ? " current" : "");
    b.dataset.form = w;
    b.setAttribute("role", "button");
    const span = document.createElement("span");
    span.textContent = w;
    b.append(span);
    pop.append(b);
  }
  backdrop.append(pop);
  document.body.append(backdrop);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    if (onClose) onClose();
  };
  // A tap on the dimmed area (not on the popover) closes it.
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  attachPressHandling(pop, (el) => { if (!closed) onChoose(el.dataset.form); }, ".form-btn", pressOptions || {});
  return { close, button: (w) => pop.querySelector(`.form-btn[data-form="${CSS.escape(w)}"]`) };
}

// ---------------------------------------------------------------------------------------------
// The press-and-hold word-forms DIAL (beta): the forms of a word placed around its button.
//
// FIXED SLOTS (motor planning): a form of a given TYPE always sits in the same compass direction
// around the word, whatever the word is, so the child's hand learns "past = up, -ing = right".
// There are 8 slots. A slot with no form is simply absent (the other forms never move into it).
//
//   Verbs         past = N (up)        -ing = E (right)     -s = S (down)       past participle = W (left)
//                 negative/contraction (don't, can't) = NE
//   Describing    -er = E              -est = NE
//   Nouns         plural = E
//   Pronouns      object (me him her us them) = E            possessive (my his your our their its) = S
//                 reflexive (myself himself ...) = W         other (mine yours hers ours theirs) = SE
//                 (this / that: these / those are plurals, so they sit at E like a noun's plural)
//   Anything else a family lists (am / are / were for "be", a third describing form ...)
//   goes to the first free slot in this fixed order: NW, SE, SW, NE, S, W, N, E.
//
// Only the FIRST word of a family (go, eat, big, dog, I) has a dial: the other members (went, me, dogs)
// are forms, not heads, so holding them behaves as an ordinary tap.
export const SLOT_VECTOR = {      // [column, row] step from the centre word: x to the right, y down
  N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1],
};
const EXTRA_ORDER = ["NW", "SE", "SW", "NE", "S", "W", "N", "E"];
// Which slot each form TYPE uses. (Types are also the names of the little marker pictures in js/dial.js.)
export const TYPE_SLOT = {
  past: "N", ing: "E", s: "S", pp: "W", neg: "NE",
  er: "E", est: "NE", plural: "E",
  obj: "E", poss: "S", refl: "W", "pron-other": "SE",
};

// "be" and "have" are too irregular to sort by their spelling: say what each form is.
const BE_TYPES = { is: "s", being: "ing", was: "past", been: "pp" };   // am / are / were are extras

// Work out the type of every form in one family. Returns [{ word, type }] in the family's own order.
function classify(section, words) {
  const head = words[0].toLowerCase();
  const forms = words.slice(1);
  if (section === "nouns") return forms.map((w, i) => ({ word: w, type: i === 0 ? "plural" : "extra" }));
  if (section === "adjectives") {
    let sawEr = false;
    return forms.map((w) => {
      if (/est$/i.test(w)) return { word: w, type: "est" };
      if (!sawEr) { sawEr = true; return { word: w, type: "er" }; }
      return { word: w, type: "extra" };
    });
  }
  if (section === "pronouns") {
    const plural = head === "this" || head === "that";
    return forms.map((w) => {
      const lw = w.toLowerCase();
      if (plural) return { word: w, type: "plural" };
      if (/(self|selves)$/.test(lw)) return { word: w, type: "refl" };
      if (["me", "him", "her", "us", "them"].includes(lw)) return { word: w, type: "obj" };
      if (["my", "his", "your", "our", "their", "its"].includes(lw)) return { word: w, type: "poss" };
      return { word: w, type: "pron-other" };               // mine, yours, hers, ours, theirs
    });
  }
  // Verbs
  const thirdPerson = (w) => {
    const lw = w.toLowerCase();
    return lw === head + "s" || lw === head + "es" || (head.endsWith("y") && lw === head.slice(0, -1) + "ies") ||
      (head === "have" && lw === "has");
  };
  let pastTaken = false, ppTaken = false;
  return forms.map((w) => {
    const lw = w.toLowerCase();
    if (head === "be" && BE_TYPES[lw]) return { word: w, type: BE_TYPES[lw] };
    if (head === "be") return { word: w, type: "extra" };
    if (lw.includes("'")) return { word: w, type: "neg" };             // don't, can't, won't
    if (/ing$/.test(lw)) return { word: w, type: "ing" };
    if (thirdPerson(lw)) return { word: w, type: "s" };
    // What is left is the past (first) and the past participle (second); more than two are extras.
    if (!pastTaken) { pastTaken = true; return { word: w, type: "past" }; }
    if (!ppTaken) { ppTaken = true; return { word: w, type: "pp" }; }
    return { word: w, type: "extra" };
  });
}

// Entries for one family: [{ word, type, slot }]. Two forms never share a slot: the second one moves on to
// the next free slot in EXTRA_ORDER.
function dialEntries(section, words) {
  const typed = classify(section, words);
  const taken = new Set();
  const out = [];
  for (const f of typed) {        // first pass: forms with a home slot of their own
    const want = TYPE_SLOT[f.type];
    if (want && !taken.has(want)) { taken.add(want); out.push({ ...f, slot: want }); } else out.push({ ...f, slot: null });
  }
  for (const e of out) {          // second pass: extras and collisions
    if (e.slot) continue;
    const free = EXTRA_ORDER.find((s) => !taken.has(s));
    if (!free) continue;
    taken.add(free);
    e.slot = free;
    if (TYPE_SLOT[e.type]) e.type = "extra";
  }
  return out.filter((e) => e.slot);
}

// The dial of a word on the board: { head, section, entries: [{ word, type, slot }] }, or null when the
// word has no forms or is not the head of its family (went, me and dogs are forms, not heads).
export function dialFor(text) {
  return dials.get(String(text || "").trim().toLowerCase()) || null;
}
