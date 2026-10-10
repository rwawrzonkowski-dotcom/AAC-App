// What Model mode shows on each step: a ring around the button, the critter, or both.
//
// IMPORTANT (motor planning): nothing here is part of the board. The ring is a
// glow drawn around the button (it takes no room), and the critter lives on its
// own see-through layer on top of the whole screen (#critter-layer). That layer
// never catches a tap (pointer-events: none), so a child can always still tap the
// board, and nothing on the board moves, resizes or reflows.
import { buildCritter, critterTop, SIZE_PCT } from "./critters.js";

export const RING_MS = 1200;         // how long the ring on the tapped button stays
export const RING_PATH_MS = 800;     // ... and on each button of the path back
export const STEP_PAUSE_MS = 600;    // pause on each page while stepping back (ring only)

const CRITTER_STAY_MS = 1200;        // the critter is fully there for about this long ...
const CRITTER_FADE_MS = 300;         // ... then fades out over this long
export const CRITTER_TOTAL_MS = CRITTER_STAY_MS + CRITTER_FADE_MS;

// Which prompts are actually showing for these settings. Opacity 0 means "off".
export const usesRing = (m) => (m.style === "ring" || m.style === "both") && m.ringOpacity > 0;
export const usesCritter = (m) => (m.style === "critter" || m.style === "both") && m.critterOpacity > 0;

// How long to pause on each page while stepping back to the main board.
export const stepPauseMs = (m) => (usesCritter(m) ? CRITTER_TOTAL_MS : STEP_PAUSE_MS);

const reducedMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

// ---------- The ring ----------
// The pulsing ring is CSS on the button (class "model-ring", see styles.css).
// The ring opacity is passed to it as the number --ring-a (0 to 1).
function showRing(cell, ms, pct) {
  cell.style.setProperty("--ring-a", String(pct / 100));
  cell.classList.remove("model-ring");
  void cell.offsetWidth;                      // restart the pulse
  cell.classList.add("model-ring");
  setTimeout(() => { cell.classList.remove("model-ring"); cell.style.removeProperty("--ring-a"); }, ms);
}

// ---------- The critter ----------
let layer = null;
let token = 0;           // changes whenever a critter is cleared, so a slow one can notice
let timers = [];

function getLayer() {
  if (!layer || !layer.isConnected) {
    layer = document.createElement("div");
    layer.id = "critter-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.append(layer);
  }
  return layer;
}

// Remove any critter right now (end of Model mode, a new step, a different learner).
export function clearCritter() {
  token++;
  timers.forEach(clearTimeout);
  timers = [];
  if (layer) layer.replaceChildren();
}

// Keyframes for the hop: from just off-screen at the bottom left, in an arc, to a landing.
function hopFrames(dx, dy, side) {
  const frames = [];
  const lift = Math.max(side * 0.9, Math.abs(dy) * 0.3);   // how high the arc rises above a straight line
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const e = 1 - (1 - t) * (1 - t);                        // slows down as it lands
    const x = dx * (1 - e);
    const y = dy * (1 - e) - 4 * lift * e * (1 - e);
    const tilt = -18 * (1 - e);
    frames.push({ offset: t * 0.86, transform: `translate(${x}px, ${y}px) rotate(${tilt}deg)` });
  }
  // a small squash when it lands
  frames.push({ offset: 0.93, transform: "scale(1.12, 0.88)" });
  frames.push({ offset: 1, transform: "none" });
  return frames;
}

// Show the critter on `cell`. Resolves to the critter element (or null if none was shown).
async function showCritter(cell, m, customUrl) {
  clearCritter();
  const op = m.critterOpacity / 100;
  if (op <= 0) return null;
  const mine = token;
  const rect = cell.getBoundingClientRect();                 // where the button is right now
  const side = Math.max(8, Math.round(Math.min(rect.width, rect.height) * SIZE_PCT[m.size]));
  const el = await buildCritter(m, customUrl, side);
  if (mine !== token) return null;                           // cleared while loading

  const arrival = reducedMotion() ? "appear" : m.arrival;
  const left = Math.round((rect.width - side) / 2), top = critterTop(rect.height, side);

  // The "slot" is a box exactly over the button; the critter sits in the picture part of it.
  const slot = document.createElement("div");
  slot.className = "critter-slot";
  Object.assign(slot.style, { left: rect.left + "px", top: rect.top + "px", width: rect.width + "px", height: rect.height + "px" });
  if (arrival === "peek") {                                  // only shows inside the button's edges
    slot.style.overflow = "hidden";
    slot.style.borderRadius = getComputedStyle(cell).borderRadius;
  }
  el.style.left = left + "px";
  el.style.top = top + "px";
  el.style.opacity = String(op);
  el.dataset.arrival = arrival;
  slot.append(el);
  getLayer().append(slot);

  let arriveMs = 0;
  if (arrival === "hop") {
    arriveMs = 800;
    const dx = -side * 1.3 - (rect.left + left);                       // starts just off the left edge ...
    const dy = window.innerHeight + side * 0.3 - (rect.top + top);     // ... and just below the bottom
    el.animate(hopFrames(dx, dy, side), { duration: arriveMs, easing: "linear", fill: "both" });
  } else if (arrival === "peek") {
    arriveMs = 500;
    el.animate([
      { transform: `translateY(${rect.height - top}px)` },
      { transform: `translateY(${-side * 0.06}px)`, offset: 0.75 },
      { transform: "none" },
    ], { duration: arriveMs, easing: "ease-out", fill: "both" });
  } else {
    arriveMs = 280;
    el.animate([{ opacity: 0, transform: "scale(0.75)" }, { opacity: op, transform: "none" }],
      { duration: arriveMs, easing: "ease-out", fill: "both" });
  }

  timers.push(setTimeout(() => {
    el.animate([{ opacity: op }, { opacity: 0 }], { duration: CRITTER_FADE_MS, fill: "forwards" });
  }, CRITTER_STAY_MS));
  timers.push(setTimeout(() => slot.remove(), CRITTER_TOTAL_MS + 50));
  return el;
}

// ---------- One step ----------
// Show the learner's chosen prompt on the button `cell`.
//   m         = the learner's model settings (profile.model)
//   customUrl = the learner's own critter picture, if they have one
//   ringMs    = how long the ring stays
export function runPrompt(cell, m, customUrl, ringMs) {
  if (!cell) return;
  if (usesRing(m)) showRing(cell, ringMs, m.ringOpacity);
  if (usesCritter(m)) showCritter(cell, m, customUrl);
}
