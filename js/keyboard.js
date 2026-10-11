// The typing overlays (Phase 1.7): a large QWERTY keyboard and a number pad.
//
// Both are ONE overlay that sits on top of the grid area (position: absolute over the grid's row, see
// styles.css #typing-overlay). The message bar above stays visible, and nothing on the grid moves or
// resizes: the grid is still there underneath, just covered.
//
// How typing works
//   - Every key press changes a "draft" (the letters or digits typed so far). app.js shows the draft
//     as a dashed chip at the end of the message bar (onDraft).
//   - FINALIZING turns the draft into a normal chip and speaks it (onCommit):
//       Space (keyboard), Done, Close, and the 123 / ABC keys that switch between the two overlays.
//     An empty draft is simply thrown away.
//   - Backspace deletes one typed letter or digit. With nothing typed it does nothing (the top-bar
//     Delete button is what removes whole chips).
//   - Letters: the chip says what was typed, lower case. Numbers: the chip shows the digits ("24") and
//     the spoken text is the English words ("twenty-four"), see js/numberwords.js.
//
// Touch: the keys use NORMAL taps. The learner's "Hold to select" and "Ignore repeated taps" settings do
// not apply here (a keyboard needs fast, repeated taps). Instead each key ignores a second hit within
// 120 ms, which only filters out accidental double touches.
import { attachPressHandling } from "./board.js";
import { digitsToWords, MAX_DIGITS } from "./numberwords.js";

const DEBOUNCE_MS = 120;
export const MAX_LETTERS = 30;     // same limit as a button's label

// What "Speak each letter while typing" says for each key. (A bare "a" is often read as the word "a",
// so the names are spelled the way they sound.)
export const LETTER_NAMES = {
  a: "ay", b: "bee", c: "see", d: "dee", e: "ee", f: "eff", g: "gee", h: "aitch", i: "eye", j: "jay",
  k: "kay", l: "el", m: "em", n: "en", o: "oh", p: "pee", q: "cue", r: "are", s: "ess", t: "tee",
  u: "you", v: "vee", w: "double you", x: "ex", y: "why", z: "zee", "'": "apostrophe",
};

// Keyboard rows. The grid has 20 columns so the rows can be staggered like a real keyboard.
// (The apostrophe key, for "don't" and "I'm", sits in the bottom row next to Space: see buildLetters.)
const LETTER_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

function key(k, label, cls, span, col, extra = {}) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "kb-key " + cls;
  b.dataset.k = k;
  b.textContent = label;
  b.style.gridColumn = `${col} / span ${span}`;
  if (extra.aria) b.setAttribute("aria-label", extra.aria);
  return b;
}

// opts:
//   host                the element the overlay is added to (#app)
//   speakLetters()      true if the current learner wants each letter spoken
//   allowLetters()      false if the learner's keyboard setting is Never (the number pad then has no ABC key)
//   onDraft(text, kind) the draft changed ("" = nothing typed). kind is "letters" or "number".
//   onCommit(info)      a chip is finalized: { label, spoken, kind: "letters"|"number", speak: bool }
//   onLetter(name)      say a letter's name (only when speakLetters() is true)
//   onKeyPress(el)      a key was accepted (Model mode rings it)
//   onOpenChange(open)  the overlay opened or closed
export function createTyping(opts) {
  let overlay = null;
  let mode = null;            // "letters" | "number" | null (closed)
  let draft = "";
  let lastAt = {};            // key -> time of its last accepted press (for the 120 ms debounce)
  let context = {};           // what the caller said when opening (e.g. fromPage)

  const isOpen = () => !!overlay;

  function setDraft(text) {
    draft = text;
    opts.onDraft(draft, mode === "number" ? "number" : "letters");
  }

  // Finalize the draft into a chip. Returns true if there was something to finalize.
  function commit(speak = true) {
    if (!draft) return false;
    const text = draft;
    const kind = mode === "number" ? "number" : "letters";
    setDraft("");
    opts.onCommit({
      label: text,
      spoken: kind === "number" ? digitsToWords(text) : text,
      kind, speak, context,
    });
    return true;
  }

  // ---- building the two layouts ----
  function buildLetters() {
    const wrap = document.createElement("div");
    wrap.className = "kb-keys kb-letters";
    LETTER_ROWS.forEach((row, r) => {
      const pad = r === 0 ? 1 : r === 1 ? 2 : 3;          // staggered start column
      [...row].forEach((ch, i) => {
        const k = key(ch, ch, "kb-letter", 2, pad + i * 2);
        k.style.gridRow = String(r + 1);
        wrap.append(k);
      });
    });
    const back = key("back", "⌫", "kb-back", 4, 17, { aria: "Backspace" });
    back.style.gridRow = "3";
    const num = key("num", "123", "kb-switch", 4, 1, { aria: "Number pad" });
    // Bottom row: 123 | apostrophe | Space | Done. The apostrophe is two columns wide (the same as a letter key)
    // and Space is narrower by the same amount, so the letter keys above never change.
    const apos = key("'", "'", "kb-letter kb-apos", 2, 5, { aria: "Apostrophe" });
    const space = key("space", "space", "kb-space", 10, 7);
    const done = key("done", "Done", "kb-done", 4, 17);
    for (const b of [num, apos, space, done]) b.style.gridRow = "4";
    wrap.append(back, num, apos, space, done);
    return wrap;
  }

  function buildNumbers() {
    const wrap = document.createElement("div");
    wrap.className = "kb-keys kb-pad";
    const order = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "done"];
    for (const k of order) {
      const label = k === "back" ? "⌫" : k === "done" ? "Done" : k;
      const cls = k === "back" ? "kb-back" : k === "done" ? "kb-done" : "kb-digit";
      wrap.append(key(k, label, cls, 1, 1, { aria: k === "back" ? "Backspace" : undefined }));
    }
    for (const b of wrap.children) b.style.gridColumn = "auto";
    return wrap;
  }

  function build() {
    const head = document.createElement("div");
    head.className = "kb-head";
    head.append(key("close", "✕  Close", "kb-close", 1, 1));
    const title = document.createElement("span");
    title.className = "kb-title";
    title.textContent = mode === "number" ? "Numbers" : "Type a word";
    head.append(title);
    if (mode === "number" && opts.allowLetters()) head.append(key("abc", "ABC", "kb-switch kb-abc", 1, 1, { aria: "Keyboard" }));
    head.querySelectorAll(".kb-key").forEach((b) => (b.style.gridColumn = "auto"));

    const body = mode === "number" ? buildNumbers() : buildLetters();
    overlay.className = "typing-" + mode;
    overlay.replaceChildren(head, body);
  }

  // ---- a key press ----
  function press(el) {
    const k = el.dataset.k;
    const now = performance.now();
    if (now - (lastAt[k] ?? -Infinity) < DEBOUNCE_MS) return;     // accidental double hit
    lastAt[k] = now;
    if (opts.onKeyPress) opts.onKeyPress(el);
    const refuse = () => {
      el.classList.add("refused");
      setTimeout(() => el.classList.remove("refused"), 300);
    };

    if (k === "close") { close(); return; }
    if (k === "done") { commit(); close(); return; }
    if (k === "back") { if (draft) setDraft(draft.slice(0, -1)); return; }
    if (k === "space") { commit(); return; }
    if (k === "num") { commit(); switchTo("number"); return; }       // typing is never lost
    if (k === "abc") { commit(); switchTo("letters"); return; }
    if (mode === "number") {
      if (draft.length >= MAX_DIGITS) { refuse(); return; }          // 7th digit refused
      if (draft === "0") draft = "";                                  // no leading zeros
      setDraft(draft + k);
      return;
    }
    if (draft.length >= MAX_LETTERS) { refuse(); return; }
    setDraft(draft + k);
    if (opts.speakLetters() && LETTER_NAMES[k]) opts.onLetter(LETTER_NAMES[k]);
  }

  function switchTo(newMode) {
    mode = newMode;
    lastAt = {};
    build();
    opts.onDraft(draft, mode);
  }

  // Open the overlay in "letters" or "number" mode. If it is already open this just switches.
  function open(newMode, ctx = {}) {
    context = ctx;
    if (overlay) { if (mode !== newMode) { commit(); switchTo(newMode); } return; }
    overlay = document.createElement("div");
    overlay.id = "typing-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", newMode === "number" ? "Number pad" : "Keyboard");
    // Keep taps on the overlay from reaching anything underneath.
    opts.host.append(overlay);
    attachPressHandling(overlay, press, ".kb-key");
    draft = "";
    mode = newMode;
    lastAt = {};
    build();
    opts.onOpenChange(true);
  }

  // Close the overlay. A non-empty draft is finalized first (so typing is never lost), spoken unless
  // { speak: false }. { discard: true } throws the draft away instead.
  function close({ speak = true, discard = false } = {}) {
    if (!overlay) return;
    if (discard) setDraft(""); else commit(speak);
    overlay.remove();
    overlay = null;
    mode = null;
    context = {};
    opts.onOpenChange(false);
  }

  // Throw away what is being typed (the top-bar Clear button), leaving the overlay open.
  function clearDraft() { if (overlay && draft) setDraft(""); }

  return { open, close, clearDraft, isOpen, mode: () => mode, draft: () => draft };
}
