// Accessibility (Beta 3.18): how the CHILD'S screen looks and a few listener helps, per learner (Adult menu > Board > Accessibility).
// Adult screens keep their own look. NOTHING HERE MOVES A WORD: every option only changes colours, fonts, label size or case, the GAPS
// between buttons, or how a hidden spot is drawn. Each word keeps its row and column (motor planning).
//
//   theme        standard | dark (high contrast) | cvi (black and yellow) | cbsafe (colour-blind safe) | dim (soft dark, low glare)
//   font         system | atkinson (Atkinson Hyperlegible) | lexend | opendyslexic (OpenDyslexic, Nov 11)   (fonts/ : all SIL Open Font License, bundled, offline)
//   labelSize    s | m | l | xl                 (labels still shrink to fit their button: js/board.js fitLabels)
//   labelPos     bottom | top
//   labelCase    asis | lower | upper           ("lower" keeps "I" and "I'm" capital)
//   spacing      normal | wide | wider          (only the gaps grow; the buttons shrink a little, in the same places)
//   hidden       gray | dots | invisible        (a hidden word's spot: gray tile, dotted outline, or nothing drawn; the spot stays reserved)
//   motion       auto (follow the iPad's Reduce Motion) | reduce | full
//   listener     false | true   "Show" button in the message bar: the message full screen for a listener (can be flipped to face them)
//   glow         false | true   the message bar glows while VOICE is talking (for listeners who cannot hear it)
//   highlight    false | true   each word lights up as it is said (message bar), when the iPad's voice reports word timing
//
// PRESETS set several of these at once (and, for Motor, the Touch settings); every option can still be changed afterwards.
import { h } from "./ui.js";

export const ACCESS_CHOICES = {
  theme: ["standard", "dark", "cvi", "cbsafe", "dim"],
  font: ["system", "atkinson", "lexend", "opendyslexic"],
  labelSize: ["s", "m", "l", "xl"],
  labelPos: ["bottom", "top"],
  labelCase: ["asis", "lower", "upper"],
  spacing: ["normal", "wide", "wider"],
  hidden: ["gray", "dots", "invisible"],
  motion: ["auto", "reduce", "full"],
};
export const DEFAULT_ACCESS = {
  theme: "standard", font: "system", labelSize: "m", labelPos: "bottom", labelCase: "asis", spacing: "normal", hidden: "gray",
  motion: "auto", listener: false, glow: false, highlight: false,
};

/** A complete, valid settings object from anything (old learners, backups). */
export function cleanAccess(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const [k, list] of Object.entries(ACCESS_CHOICES)) out[k] = list.includes(o[k]) ? o[k] : DEFAULT_ACCESS[k];
  for (const k of ["listener", "glow", "highlight"]) out[k] = o[k] === true;
  return out;
}

// ---------- Presets ----------
// touch: changes to the learner's Touch settings (js/profiles.js DEFAULT_TOUCH), or null to leave them.
export const PRESETS = [
  { id: "lowvision", title: "Low vision", text: "High-contrast dark theme, very large labels, easy-to-read font, wider gaps, hidden spots not drawn, words light up as they are said, and Speak on touch (hear a word before choosing it).",
    set: { theme: "dark", font: "atkinson", labelSize: "xl", spacing: "wide", hidden: "invisible", highlight: true, glow: true }, touch: { preview: true } },
  { id: "cvi", title: "CVI", text: "Black background with one bright colour (yellow), simple and uncluttered, hidden spots not drawn, no movement.",
    set: { theme: "cvi", font: "atkinson", labelSize: "l", spacing: "wide", hidden: "invisible", motion: "reduce" } },
  { id: "motor", title: "Motor", text: "The widest gaps between buttons, choose when the finger lifts (slide to the right word, then let go), and repeated taps are ignored for 1 second.",
    set: { spacing: "wider", hidden: "invisible" }, touch: { ignoreOn: true, ignoreSec: 1, liftOff: true } },
  { id: "hearing", title: "Hearing partner", text: "A Show button puts the message full screen for the listener; the message bar glows while VOICE talks, and words light up as they are said.",
    set: { listener: true, glow: true, highlight: true } },
  { id: "sensory", title: "Sensory-sensitive", text: "Soft, low-glare colours, no movement or flashing, hidden spots not drawn.",
    set: { theme: "dim", motion: "reduce", hidden: "invisible", glow: false } },
];

/** Apply a preset to a learner profile (changes access, and touch for Motor). Returns the preset. */
export function applyPreset(profile, id) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return null;
  profile.access = cleanAccess({ ...cleanAccess(profile.access), ...p.set });
  if (p.touch) profile.touch = { ...profile.touch, ...p.touch };
  return p;
}

// ---------- Applying to the screen ----------
// Everything is done with data- attributes on <html>; styles.css does the rest (cheap: no redraw of the board needed except for the
// label case, which js/board.js applies when it draws). Only the child's screen uses them (adult sheets have their own colours).
let current = { ...DEFAULT_ACCESS };
export const getAccess = () => current;

export function applyAccess(raw) {
  current = cleanAccess(raw);
  const d = document.documentElement.dataset;
  for (const k of ["theme", "font", "labelSize", "labelPos", "spacing", "hidden", "motion"]) if (d[k] !== current[k]) d[k] = current[k];
  return current;
}

/** Should movement be reduced now? (Movement: Reduce, or Follow the iPad with the iPad's Reduce Motion on.) For animations made in
 *  JavaScript (Element.animate), which the stylesheet's rule cannot shorten. */
export function motionReduced() {
  if (current.motion === "reduce") return true;
  if (current.motion === "full") return false;
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

/** A label in the learner's chosen letter case. "lower" keeps the word I (and I'm, I'll...) capital. */
export function caseLabel(text) {
  const s = String(text ?? "");
  if (current.labelCase === "upper") return s.toUpperCase();
  if (current.labelCase === "lower") return s.toLowerCase().replace(/(^|[^\p{L}])i(?=$|[^\p{L}])/gu, "$1I");
  return s;
}

// ---------- Show to listener ----------
// Full screen, the message in very large letters (shrunk to fit), white on black or black on white by theme. "Flip" turns it upside
// down so a listener across the table can read it. Tap Done (or anywhere outside the buttons) to close. Nothing is spoken or recorded.
let listenerEl = null;
export function showToListener(text) {
  closeListener();
  const msg = String(text || "").trim();
  const words = h("div", { class: "lv-text", id: "lv-text", text: msg || "(no message yet)" });
  const inner = h("div", { class: "lv-inner" }, words);
  const flip = h("button", { type: "button", class: "lv-btn", id: "lv-flip", text: "Flip ⟲",
    onclick: (e) => { e.stopPropagation(); inner.classList.toggle("flipped"); } });
  const done = h("button", { type: "button", class: "lv-btn lv-done", id: "lv-done", text: "Done", onclick: (e) => { e.stopPropagation(); closeListener(); } });
  listenerEl = h("div", { class: "listener-view", id: "listener-view", role: "dialog", "aria-label": "Message for the listener", onclick: closeListener },
    inner, h("div", { class: "lv-bar" }, flip, done));
  document.body.appendChild(listenerEl);
  fitListenerText(words);
}
export function closeListener() { if (listenerEl) { listenerEl.remove(); listenerEl = null; } }
export const listenerOpen = () => !!listenerEl;

function fitListenerText(el) {
  // Largest size that fits the screen: start big and step down.
  let px = Math.min(window.innerHeight * 0.32, 240);
  el.style.fontSize = px + "px";
  const box = el.parentElement;
  while (px > 24 && (el.scrollWidth > box.clientWidth + 1 || el.scrollHeight > box.clientHeight + 1)) {
    px -= 4; el.style.fontSize = px + "px";
  }
}
