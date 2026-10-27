// The press-and-hold word-forms DIAL (beta).
//
// Press and hold a word button (go, eat, big, dog, I...) and its other forms appear around it as large
// chips: went / going / goes / gone. The fixed compass slots are explained in js/forms.js (past = up,
// -ing = right, -s = down, past participle = left...), so the hand learns one pattern for every word.
//
// NOTHING ON THE BOARD MOVES. The dial is a see-through layer on top of the whole screen (position: fixed,
// above the grid, below the model critter), exactly like the Forms popover and the critter. The base word
// stays in the centre as a "hub": a copy of the button drawn at the button's own place (or, near a screen
// edge, nudged inward together with the chips so that every chip is fully on screen and nothing covers it).
//
// Two ways to choose (both always work):
//   SLIDE   keep the finger down, slide onto a form (it lights up), lift: that form is chosen. Sliding onto
//           a form and then back to the middle or off the dial before lifting cancels.
//   TAP     lift the finger without sliding onto a form: the dial stays open. Tap a form to choose it;
//           tap anywhere else (the dim area or the centre word) to cancel.
//
// This file only draws the dial and reads the finger. What choosing MEANS (speak, message bar, event log,
// Model mode prompt) is decided by js/app.js, which passes onChoose.
import { SLOT_VECTOR } from "./forms.js";
import { safeInsets } from "./ui.js";

const MOVE_PX = 12;      // the finger must travel this far from where it went down before a chip lights up
const MARGIN = 8;        // chips stay at least this far from the screen edge
const GAPS = [10, 6, 3, 0];   // space between chips; shrinks only if the dial would not fit the screen

// ---------- Layout (pure arithmetic, no DOM: easy to test) ----------
// rect   the base button { left, top, width, height } in screen pixels
// chips  [{ slot, w }] the chips that exist (width of each), all `chipH` tall
// Returns { hub: {left, top, width, height}, chips: [{ slot, left, top, width, height }], shiftX, shiftY }.
// Each chip keeps its compass direction from the hub. If the dial would leave the screen, the whole dial
// (hub included) is moved inward by the smallest amount; if it is still too big, the gaps shrink first.
// safe (optional) = { x, t, b }: the phone's unusable edge strips (see safeInsets() in js/ui.js); chips stay out of them.
export function computeDialLayout({ rect, vw, vh, chips, chipH, safe = { x: 0, t: 0, b: 0 } }) {
  const minLeft = MARGIN + safe.x, maxRight = vw - MARGIN - safe.x;
  const minTop = MARGIN + safe.t, maxBottom = vh - MARGIN - safe.b;
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const widthOf = (vx) => Math.max(0, ...chips.filter((c) => SLOT_VECTOR[c.slot][0] === vx).map((c) => c.w));
  const colW = { "-1": widthOf(-1), "0": widthOf(0), "1": widthOf(1) };
  const hasSide = chips.some((c) => SLOT_VECTOR[c.slot][1] === 0);          // an E or W chip
  const hasMid = chips.some((c) => SLOT_VECTOR[c.slot][0] === 0);           // an N or S chip

  let result = null;
  for (const gap of GAPS) {
    const midHalfW = Math.max(rect.width, hasMid ? colW["0"] : 0) / 2;
    const midHalfH = Math.max(rect.height, hasSide ? chipH : 0) / 2;
    const placed = chips.map((c) => {
      const [vx, vy] = SLOT_VECTOR[c.slot];
      return {
        slot: c.slot, width: c.w, height: chipH,
        left: cx + vx * (midHalfW + gap + colW[vx] / 2) - c.w / 2,
        top: cy + vy * (midHalfH + gap + chipH / 2) - chipH / 2,
      };
    });
    const boxes = [{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }, ...placed];
    const minX = Math.min(...boxes.map((b) => b.left)), maxX = Math.max(...boxes.map((b) => b.left + b.width));
    const minY = Math.min(...boxes.map((b) => b.top)), maxY = Math.max(...boxes.map((b) => b.top + b.height));
    // Smallest nudge that brings the whole dial inside the margins.
    let shiftX = 0, shiftY = 0;
    if (minX < minLeft) shiftX = minLeft - minX; else if (maxX > maxRight) shiftX = maxRight - maxX;
    if (minY < minTop) shiftY = minTop - minY; else if (maxY > maxBottom) shiftY = maxBottom - maxY;
    result = {
      hub: { left: rect.left + shiftX, top: rect.top + shiftY, width: rect.width, height: rect.height },
      chips: placed.map((b) => ({ ...b, left: b.left + shiftX, top: b.top + shiftY })),
      shiftX, shiftY,
    };
    if (maxX - minX <= maxRight - minLeft && maxY - minY <= maxBottom - minTop) break;   // fits; otherwise try a tighter gap
  }
  return result;
}

// ---------- Marker pictures (small inline SVG, one per form TYPE) ----------
// Drawn in currentColor on a 24 x 24 grid. A learner who reads can turn them off (Show form markers).
const ICONS = {
  past:  '<path d="M10 6 4 12l6 6M4 12h15"/>',                                     // arrow pointing back
  pp:    '<path d="M10 6 4 12l6 6M4 12h12M21 6v12"/>',                              // arrow back to a finish line
  ing:   '<path d="M3 8h9M3 12h13M3 16h9"/><circle cx="20" cy="12" r="2.2" fill="currentColor" stroke="none"/>',   // motion lines
  s:     '<path d="M12 5v14M5 12h14"/>',                                            // plus
  plural: '<circle cx="8" cy="12" r="3" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="3" fill="currentColor" stroke="none"/>',   // two dots
  neg:   '<circle cx="12" cy="12" r="8"/><path d="M6.5 6.5l11 11"/>',               // "no" sign
  er:    '<rect x="5" y="13" width="5" height="7" rx="1" fill="currentColor" stroke="none"/><rect x="13" y="8" width="5" height="12" rx="1" fill="currentColor" stroke="none"/>',
  est:   '<rect x="3" y="14" width="5" height="6" rx="1" fill="currentColor" stroke="none"/><rect x="10" y="9" width="5" height="11" rx="1" fill="currentColor" stroke="none"/><rect x="17" y="3" width="5" height="17" rx="1" fill="currentColor" stroke="none"/>',
  obj:   '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/>',                      // a person
  poss:  '<circle cx="9" cy="8" r="3"/><path d="M3 19c0-3.5 2.5-5.5 6-5.5s6 2 6 5.5"/><rect x="16" y="14" width="5" height="5" rx="1"/>',   // a person and their thing
  refl:  '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="9.5" r="2.6"/><path d="M7 18c0-3 2.2-4.8 5-4.8s5 1.8 5 4.8"/>',   // a person in a circle
  "pron-other": '<circle cx="9" cy="8" r="3"/><path d="M3 19c0-3.5 2.5-5.5 6-5.5s6 2 6 5.5M17 10h5M17 14h5"/>',   // a person and "="
};

function markerSvg(type) {
  const inner = ICONS[type];
  if (!inner) return null;                 // "extra" forms have no picture, only the word
  const wrap = document.createElement("span");
  wrap.className = "dial-mark";
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return wrap;
}

// ---------- Opening the dial ----------
// anchor    the base button: { rect, label, bg, imgSrc } (a snapshot, so the dial does not depend on the grid)
// entries   [{ word, type, slot }] from dialFor() in js/forms.js
// markers   show the little picture on each chip
// pointer   the finger that is still down: { id, x, y } (x, y = where it went down); null = open for taps only
// onChoose(entry, chipEl)   a form was chosen (the app decides when to call close())
// onClose()                 the dial went away (chosen, cancelled, screen turned...)
// Returns { close, isOpen(), chip(word), layout }.
export function openDial({ anchor, entries, markers, pointer, onChoose, onClose }) {
  const layer = document.createElement("div");
  layer.id = "dial-layer";
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-label", "Forms of " + anchor.label);
  layer.style.visibility = "hidden";          // measured first, shown once placed
  document.body.append(layer);

  const vw = window.innerWidth, vh = window.innerHeight, vmin = Math.min(vw, vh) / 100;
  // Big, high-contrast chips: at least 64 px tall (about 72 px on a 1024 x 768 iPad) and wider than a button.
  const chipH = Math.round(Math.max(64, Math.min(96, 9.4 * vmin)));
  const fontPx = Math.round(Math.max(22, Math.min(40, 3.7 * vmin)));
  const minW = Math.round(Math.max(112, 15 * vmin));

  const chipEls = new Map();      // slot -> element
  for (const e of entries) {
    const chip = document.createElement("div");
    chip.className = "dial-chip";
    chip.dataset.form = e.word;
    chip.dataset.slot = e.slot;
    chip.dataset.type = e.type;
    chip.setAttribute("role", "button");
    chip.setAttribute("aria-label", e.word);
    chip.style.height = chipH + "px";
    chip.style.minWidth = minW + "px";
    chip.style.fontSize = fontPx + "px";
    if (markers) { const m = markerSvg(e.type); if (m) chip.append(m); }
    const word = document.createElement("span");
    word.className = "dial-word";
    word.textContent = e.word;
    chip.append(word);
    layer.append(chip);
    chipEls.set(e.slot, chip);
  }

  // The centre: a copy of the button's colour, with its symbol faint behind the word.
  const hub = document.createElement("div");
  hub.className = "dial-hub";
  hub.style.background = anchor.bg || "#fff";
  if (anchor.imgSrc) {
    const img = document.createElement("img");
    img.src = anchor.imgSrc;
    img.alt = "";
    img.draggable = false;
    hub.append(img);
  }
  const hubWord = document.createElement("span");
  hubWord.textContent = anchor.label;
  hub.append(hubWord);
  layer.append(hub);

  // Place everything.
  const lay = computeDialLayout({
    rect: anchor.rect, vw, vh, chipH, safe: safeInsets(),
    chips: [...chipEls].map(([slot, el]) => ({ slot, w: Math.ceil(el.getBoundingClientRect().width) })),
  });
  for (const c of lay.chips) {
    const el = chipEls.get(c.slot);
    el.style.left = c.left + "px"; el.style.top = c.top + "px"; el.style.width = c.width + "px";
  }
  Object.assign(hub.style, {
    left: lay.hub.left + "px", top: lay.hub.top + "px", width: lay.hub.width + "px", height: lay.hub.height + "px",
  });
  layer.style.visibility = "";

  // ---- Reading the finger ----
  let closed = false;
  let mode = pointer ? "slide" : "tap";       // slide = the opening finger is still down; tap = waiting for a tap; done = chosen
  let entered = false;                         // during this slide the finger has been on a chip
  let hot = null;                              // the chip lit up under the finger
  const chipAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest(".dial-chip") : null;
  };
  const setHot = (chip) => {
    if (hot === chip) return;
    if (hot) hot.classList.remove("hot");
    hot = chip;
    if (hot) hot.classList.add("hot");
  };
  const close = () => {
    if (closed) return;
    closed = true;
    stopSlide();
    window.removeEventListener("resize", close);
    layer.remove();
    if (onClose) onClose();
  };
  const choose = (chip) => {
    if (closed || mode === "done" || !chip) return;
    const entry = entries.find((e) => e.word === chip.dataset.form);
    if (!entry) return;
    mode = "done";                               // one choice only; the app closes the dial
    chip.classList.add("chosen");
    onChoose(entry, chip);
  };

  function onMove(e) {
    if (e.pointerId !== pointer.id || mode !== "slide") return;
    if (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) < MOVE_PX) return;
    const chip = chipAt(e.clientX, e.clientY);
    setHot(chip);
    if (chip) entered = true;
  }
  function onUp(e) {
    if (e.pointerId !== pointer.id || mode !== "slide") return;
    stopSlide();
    const moved = Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) >= MOVE_PX;
    const chip = moved ? chipAt(e.clientX, e.clientY) : null;
    setHot(null);
    if (chip) { choose(chip); return; }            // lifted on a form: chosen
    if (entered) { close(); return; }              // slid onto a form, then away, and lifted: cancelled
    mode = "tap";                                  // plain lift: the dial stays open for a tap
  }
  function onCancel(e) {
    if (e.pointerId === pointer.id) close();
  }
  function stopSlide() {
    document.removeEventListener("pointermove", onMove, true);
    document.removeEventListener("pointerup", onUp, true);
    document.removeEventListener("pointercancel", onCancel, true);
  }
  if (pointer) {
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onCancel, true);
  }

  // Tap mode: a tap that starts AND ends on the same form chooses it; a tap that starts and ends off the
  // chips (dim area, centre word) cancels. The pointerup that ends the opening press has no matching
  // pointerdown on the layer, so it is ignored here.
  let tapDown = null;
  layer.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (mode !== "tap") return;
    tapDown = { chip: chipAt(e.clientX, e.clientY) };
    setHot(tapDown.chip);
  });
  layer.addEventListener("pointermove", (e) => {
    if (mode === "tap" && tapDown) setHot(chipAt(e.clientX, e.clientY) === tapDown.chip ? tapDown.chip : null);
  });
  layer.addEventListener("pointerup", (e) => {
    if (mode !== "tap" || !tapDown) return;
    const started = tapDown.chip, ended = chipAt(e.clientX, e.clientY);
    tapDown = null;
    setHot(null);
    if (started && started === ended) choose(started);
    else if (!started && !ended) close();
  });
  layer.addEventListener("pointercancel", () => { tapDown = null; setHot(null); });
  layer.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("resize", close);       // the iPad was turned: the layout is stale, so just close

  return {
    close,
    isOpen: () => !closed,
    chip: (word) => layer.querySelector(`.dial-chip[data-form="${CSS.escape(word)}"]`),
    layout: lay,
  };
}
