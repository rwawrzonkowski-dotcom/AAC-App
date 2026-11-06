// "Model a sentence" (Beta 3.15). In Model mode the adult types what they said ("do you want more juice?") and VOICE models it on the
// board: for each word the child can see, the Model prompt (ring / critter) walks the word's real path (folder, page, word), the word is
// said and added to the message bar. Typing only: nothing is recorded or sent anywhere (speech-to-text is planned for the native app,
// where it can run on the iPad itself). The iPad keyboard's own dictation microphone can be used to fill the box (that is Apple's).
//
// MATCHING (parseSentence): lower case, curly quotes made plain, punctuation dropped; the longest board label first, so "thank you" is
// one word (a phrase button of 3 or more words is used only when its words cannot each be modeled: core words first); a word not found as typed is looked up in the word-forms families ("wanted" -> want, "went" -> go); when two words share a
// label (fly / fly) the one the child can see wins. Each word gets a status:
//   model   on the board and visible at the learner's stage (modeled)
//   hidden  on the board but not revealed yet at this stage (skipped, shown gray in the review line)
//   none    not on this board (skipped)
import { h, openOverlay } from "./ui.js";
import { idsByLabel, maxLabelWords, whereIs, wordInfo } from "./scenewords.js";
import { formsFor } from "./forms.js";

const norm = (s) => String(s || "").toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/[^a-z0-9' -]+/g, " ").replace(/\s+/g, " ").trim();

/** The typed sentence as words to model: [{ text, wordId, label, spoken, status, pageId, viaForm }]. */
export function parseSentence(text, { wordsButtonShown = true } = {}) {
  const toks = norm(text).split(" ").filter(Boolean).map((t) => t.replace(/^'+|'+$/g, "")).filter(Boolean);
  const maxN = Math.min(4, maxLabelWords());
  const out = [];
  const best = (ids) => {
    let hidden = null;
    for (const id of ids) {
      const w = whereIs(id, { wordsButtonShown });
      if (w.status === "visible") return { id, w };
      if (w.status === "hidden" && !hidden) hidden = { id, w };
    }
    return hidden || (ids.length ? { id: ids[0], w: { status: "none" } } : null);
  };
  for (let i = 0; i < toks.length;) {
    let hit = null, n = 0;
    for (let k = Math.min(maxN, toks.length - i); k >= 1 && !hit; k--) {
      const ids = idsByLabel(toks.slice(i, i + k).join(" "));
      if (!ids.length) continue;
      // A phrase button of 3+ words ("I want to go") is used only when its words cannot each be modeled on their own: modeling the
      // core words is the point. Two-word labels ("ice cream", "thank you") always stay together.
      if (k >= 3 && toks.slice(i, i + k).every((t) => idsByLabel(t).some((id) => whereIs(id, { wordsButtonShown }).status === "visible"))) continue;
      hit = best(ids); n = k;
    }
    let viaForm = false;
    if (!hit) {                                           // "wanted" -> want, "went" -> go
      const fam = formsFor(toks[i]);
      if (fam) for (const base of fam) { const ids = idsByLabel(base.toLowerCase()); if (ids.length) { hit = best(ids); viaForm = true; break; } }
      n = 1;
    }
    const text1 = toks.slice(i, i + n).join(" ");
    if (hit) {
      const info = wordInfo(hit.id) || { label: text1, spoken: text1 };
      out.push({ text: text1, wordId: hit.id, label: info.label, spoken: viaForm ? text1 : info.spoken,
        status: hit.w.status === "visible" ? "model" : hit.w.status === "hidden" ? "hidden" : "none", pageId: hit.w.pageId || null, viaForm });
    } else out.push({ text: text1, wordId: null, label: text1, spoken: text1, status: "none", pageId: null, viaForm: false });
    i += n;
  }
  return out;
}

/** The typing sheet. onModel(words) gets the words to model (status "model" only), in order. */
export function openModelSentence({ wordsButtonShown, onModel }) {
  const review = h("div", { class: "ms-review", id: "ms-review", "aria-live": "polite" });
  const goBtn = h("button", { type: "button", class: "btn primary", id: "ms-go", text: "Model it", disabled: true });
  const input = h("input", { type: "text", class: "text-input ms-input", id: "ms-input", placeholder: "Type what you said, e.g. do you want more juice",
    autocomplete: "off", autocapitalize: "none", spellcheck: "false", enterkeyhint: "go", "aria-label": "Sentence to model" });
  let words = [];
  const paint = () => {
    words = parseSentence(input.value, { wordsButtonShown });
    const n = words.filter((w) => w.status === "model").length;
    goBtn.disabled = !n;
    goBtn.textContent = n ? `Model ${n} word${n === 1 ? "" : "s"}` : "Model it";
    review.replaceChildren(...(words.length ? words.map((w) => h("span", {
      class: "ms-word ms-" + w.status, title: w.status === "model" ? (w.viaForm ? `modeled as “${w.label}”` : "will be modeled")
        : w.status === "hidden" ? "hidden at this stage: skipped" : "not on this board: skipped",
      text: w.viaForm && w.status === "model" ? `${w.text} → ${w.label}` : w.text })) : [h("span", { class: "muted", text: "The words VOICE can model will be shown here." })]));
  };
  input.addEventListener("input", paint);
  const go = () => { const list = words.filter((w) => w.status === "model"); if (!list.length) return; o.close(); onModel(list); };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } });
  goBtn.addEventListener("click", go);
  const o = openOverlay([
    h("h2", { text: "Model a sentence" }),
    h("p", { class: "muted", text: "Type what you said. VOICE models each word the child can see, in order, along its real path on the board. " +
      "Green words will be modeled; gray words are skipped (hidden at this stage or not on the board)." }),
    input, review,
    h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn", id: "ms-cancel", text: "Cancel", onclick: () => o.close() }), goBtn),
  ], { sheetClass: "small ms-sheet" });
  paint();
  setTimeout(() => input.focus(), 50);
}
