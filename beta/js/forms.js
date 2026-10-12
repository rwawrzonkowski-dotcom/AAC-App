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

// Load the families once. If the file cannot be read, Forms simply stays off.
export async function loadForms() {
  try {
    const data = await (await fetch("data/word-forms.json")).json();
    families = [];
    index.clear();
    for (const section of ["verbs", "adjectives", "nouns", "pronouns"]) {
      for (const fam of data[section] || []) {
        const words = [...new Set(fam)];                 // (a family may list a word twice, e.g. "read")
        families.push(words);
        for (const w of words) if (!index.has(w.toLowerCase())) index.set(w.toLowerCase(), words);
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
