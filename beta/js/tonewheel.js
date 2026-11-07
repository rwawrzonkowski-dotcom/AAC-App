// The TONE WHEEL (Beta 3.16): press and hold the message bar and 8 feelings appear in a ring around the finger, each always in the
// same spot (js/tones.js has the order and what each one does to the voice). The centre is "Normal".
//
// Choosing works like the forms dial (js/dial.js):
//   SLIDE   keep the finger down, slide onto a feeling, lift: the message is said once in that tone.
//           Rest on a feeling for 1 second (a lock fills in) and then lift: that feeling becomes the learner's MOOD, and every
//           message is said in it until the mood changes (or VOICE is reopened).
//           Slide back to the centre and lift: "Normal" (the mood is cleared and the message is said in the learner's own voice).
//   TAP     lift without sliding: the wheel stays open. Tap a feeling (once) or press and hold it 1 second (mood); tap the centre
//           for Normal; tap outside the ring to close.
// This file only draws the wheel and reads the finger; js/app.js decides what choosing does (onPick / onNormal).
import { TONES } from "./tones.js";
import { safeInsets } from "./ui.js";

export const LOCK_MS = 1000;
const MOVE_PX = 12;
const MARGIN = 8;
const TOP_CLEAR = 40;

// The ring's centre: at the finger, moved in just enough for the whole ring to fit on screen (pure, for tests).
export function wheelCentre({ x, y, vw, vh, radius, chip, safe = { x: 0, t: 0, b: 0 } }) {
  const reach = radius + chip / 2 + MARGIN;
  return {
    cx: Math.min(vw - reach - safe.x, Math.max(reach + safe.x, x)),
    // (kept at least TOP_CLEAR below the top: iPadOS and iOS keep the top band for their swipe-down gesture and can swallow taps there)
    cy: Math.min(vh - reach - safe.b, Math.max(reach - MARGIN + Math.max(TOP_CLEAR, safe.t + MARGIN), y)),
  };
}

// opts: { x, y (where the finger is), pointer ({ id, x, y } or null), mood (tone id or null), iconOf(tone) -> image url or null,
//         onPick(tone, { lock }), onNormal(), onClose() }
export function openToneWheel({ x, y, pointer, mood, iconOf, onPick, onNormal, onClose }) {
  const layer = document.createElement("div");
  layer.id = "tone-layer";
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-label", "Say the message as");
  document.body.append(layer);

  const vw = window.innerWidth, vh = window.innerHeight, vmin = Math.min(vw, vh) / 100;
  const chip = Math.round(Math.max(64, Math.min(104, 11 * vmin)));
  const radius = Math.round(chip * 1.45);
  const { cx, cy } = wheelCentre({ x, y, vw, vh, radius, chip, safe: safeInsets() });

  const ring = document.createElement("div");
  ring.className = "tone-ring";
  Object.assign(ring.style, { left: cx - radius - chip / 2 + "px", top: cy - radius - chip / 2 + "px", width: 2 * radius + chip + "px", height: 2 * radius + chip + "px" });
  layer.append(ring);

  const chips = TONES.map((t, i) => {
    const a = (i / TONES.length) * 2 * Math.PI - Math.PI / 2;          // 0 = straight up, then clockwise
    const el = document.createElement("div");
    el.className = "tone-chip" + (mood === t.id ? " is-mood" : "");
    el.dataset.tone = t.id;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", t.label);
    Object.assign(el.style, { left: cx + radius * Math.cos(a) - chip / 2 + "px", top: cy + radius * Math.sin(a) - chip / 2 + "px", width: chip + "px", height: chip + "px" });
    const src = iconOf(t);
    if (src) { const img = document.createElement("img"); img.src = src; img.alt = ""; img.draggable = false; el.append(img); }
    else { const q = document.createElement("span"); q.className = "tone-glyph"; q.textContent = t.id === "question" ? "?" : t.label[0]; el.append(q); }
    const lbl = document.createElement("span"); lbl.className = "tone-label"; lbl.textContent = t.label; el.append(lbl);
    const lock = document.createElement("span"); lock.className = "tone-lock"; lock.setAttribute("aria-hidden", "true"); lock.textContent = "🔒"; el.append(lock);
    layer.append(el);
    return el;
  });

  const hub = document.createElement("div");
  hub.className = "tone-hub";
  hub.setAttribute("role", "button");
  hub.setAttribute("aria-label", "Normal");
  const hs = Math.round(chip * 1.05);
  Object.assign(hub.style, { left: cx - hs / 2 + "px", top: cy - hs / 2 + "px", width: hs + "px", height: hs + "px" });
  hub.textContent = "Normal";
  layer.append(hub);

  // ---- Reading the finger ----
  let closed = false, mode = pointer ? "slide" : "tap", moved = false;
  let hot = null, lockTimer = null, locked = null;
  const toneOf = (el) => TONES.find((t) => t.id === el.dataset.tone);
  const at = (px, py) => {
    const el = document.elementFromPoint(px, py);
    if (!el) return null;
    return el.closest(".tone-chip") || el.closest(".tone-hub") || null;
  };
  const setHot = (el) => {
    if (hot === el) return;
    if (hot) hot.classList.remove("hot", "locking");
    clearTimeout(lockTimer);
    if (locked && locked !== el) { locked.classList.remove("locked"); locked = null; }
    hot = el;
    if (hot) {
      hot.classList.add("hot");
      if (hot.classList.contains("tone-chip")) {
        void hot.offsetWidth;
        hot.classList.add("locking");
        lockTimer = setTimeout(() => { if (hot === el) { el.classList.add("locked"); locked = el; } }, LOCK_MS);
      }
    }
  };
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(lockTimer);
    stopSlide();
    window.removeEventListener("resize", close);
    layer.remove();
    if (onClose) onClose();
  };
  const finish = (el) => {
    if (!el) { close(); return; }
    if (el.classList.contains("tone-hub")) { close(); onNormal(); return; }
    const lock = locked === el;
    el.classList.add("chosen");
    const t = toneOf(el);
    close();
    onPick(t, { lock });
  };

  function onMove(e) {
    if (e.pointerId !== pointer.id || mode !== "slide") return;
    if (!moved && Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) < MOVE_PX) return;
    moved = true;
    setHot(at(e.clientX, e.clientY));
  }
  function onUp(e) {
    if (e.pointerId !== pointer.id || mode !== "slide") return;
    stopSlide();
    if (!moved) { setHot(null); mode = "tap"; return; }       // a plain lift: stay open for a tap
    const el = at(e.clientX, e.clientY);
    if (el && el === hot) finish(el); else close();           // lifted on a feeling or the centre; anywhere else cancels
  }
  function onCancel(e) { if (e.pointerId === pointer.id) close(); }
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

  // Tap mode: press on a feeling and lift on it (a tap = once; held 1 s = mood); the centre = Normal; outside = close.
  let tapDown = null;
  layer.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (mode !== "tap") return;
    tapDown = at(e.clientX, e.clientY);
    setHot(tapDown);
  });
  layer.addEventListener("pointerup", (e) => {
    if (mode !== "tap") return;
    const started = tapDown, ended = at(e.clientX, e.clientY);
    tapDown = null;
    if (started && started === ended) finish(started);
    else if (!started && !ended) close();
    else setHot(null);
  });
  layer.addEventListener("pointercancel", () => { tapDown = null; setHot(null); });
  layer.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("resize", close);

  return { close, isOpen: () => !closed, chip: (id) => layer.querySelector(`.tone-chip[data-tone="${id}"]`), hub: () => hub, centre: { cx, cy } };
}
