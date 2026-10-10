// The model "critter": a small friendly animal that lands on a button in Model mode.
//
// This file knows what the settings can be (animals, colors, accessories, sizes,
// arrivals), how to check them (used when a backup is restored), and how to build
// the picture of one critter. Nothing here touches the board or the network: the
// drawings are ordinary SVG files in images/critters/ that the app caches.
//
// A learner's settings (profile.model) look like this:
//   { style: "ring" | "critter" | "both",   // what Model mode shows on each step
//     ringOpacity: 0..100, critterOpacity: 0..100,   // in steps of 5
//     animal, color, accessory, size, arrival }
// A learner's own picture (if any) is stored like a button photo under the key "critter".

export const ANIMALS = ["puppy", "kitten", "bunny", "frog", "owl"];
export const ACCESSORIES = ["none", "hat", "bow", "glasses"];
export const STYLES = ["ring", "critter", "both"];
export const SIZES = ["small", "medium", "large"];
export const ARRIVALS = ["hop", "peek", "appear"];

// Eight friendly colors for the animal's main body color.
export const COLORS = [
  { name: "Orange", value: "#f5a04a" },
  { name: "Brown",  value: "#b98760" },
  { name: "Gray",   value: "#aab4be" },
  { name: "Blue",   value: "#6bb7f0" },
  { name: "Green",  value: "#7cc576" },
  { name: "Pink",   value: "#f58fb4" },
  { name: "Purple", value: "#a98be8" },
  { name: "Yellow", value: "#f7d44a" },
];

// The critter's height and width, as a share of the shorter side of the button.
export const SIZE_PCT = { small: 0.45, medium: 0.65, large: 0.85 };

// Where the critter sits inside a button: centered across, and centered in the picture part
// (the top 66% of the button, the same share js/board.js gives the picture), so the word under
// the picture stays readable for the small and medium sizes. A large critter overlaps it a little.
export const critterTop = (cellHeight, side) => Math.max(0, Math.round((cellHeight * 0.66 - side) / 2));

export const DEFAULT_MODEL = {
  style: "ring", ringOpacity: 100, critterOpacity: 100,
  animal: "puppy", color: COLORS[0].value, accessory: "none", size: "medium", arrival: "hop",
};

// Where each accessory sits on each animal, in the animal's 100 x 100 drawing:
//   x, y = where the accessory's own center point goes; s = how big; r = tilt in degrees.
// (hat: y is the brim on top of the head; bow: the knot; glasses: between the eyes)
const ANCHORS = {
  puppy:  { hat: [50, 27, 0.62, -8], bow: [50, 73, 0.85, 0], glasses: [50, 40, 0.62, 0] },
  kitten: { hat: [50, 28, 0.62, -6],  bow: [50, 74, 0.85, 0], glasses: [50, 46, 0.65, 0] },
  bunny:  { hat: [50, 38, 0.52, -6], bow: [50, 78, 0.85, 0], glasses: [50, 52, 0.62, 0] },
  frog:   { hat: [50, 38, 0.5, 0],  bow: [50, 80, 0.85, 0], glasses: [50, 35, 0.88, 0] },
  owl:    { hat: [50, 25, 0.62, -6], bow: [50, 63, 0.8, 0],  glasses: [50, 43, 0.82, 0] },
};

// ---------- Checking settings (used when restoring a backup) ----------
const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
const opacity = (v, fallback) => {
  const n = typeof v === "number" && isFinite(v) ? v : fallback;
  return Math.min(100, Math.max(0, Math.round(n / 5) * 5));
};

// Turn anything (missing, old, or from a file) into a complete, valid settings object.
export function cleanModel(raw) {
  const m = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    style: pick(m.style, STYLES, DEFAULT_MODEL.style),
    ringOpacity: opacity(m.ringOpacity, DEFAULT_MODEL.ringOpacity),
    critterOpacity: opacity(m.critterOpacity, DEFAULT_MODEL.critterOpacity),
    animal: pick(m.animal, ANIMALS, DEFAULT_MODEL.animal),
    color: pick(typeof m.color === "string" ? m.color.toLowerCase() : "", COLORS.map((c) => c.value), DEFAULT_MODEL.color),
    accessory: pick(m.accessory, ACCESSORIES, DEFAULT_MODEL.accessory),
    size: pick(m.size, SIZES, DEFAULT_MODEL.size),
    arrival: pick(m.arrival, ARRIVALS, DEFAULT_MODEL.arrival),
  };
}

// ---------- The drawings ----------
const files = new Map();   // file name -> Promise of the SVG text

function loadSvg(name) {
  if (!files.has(name)) {
    const p = fetch(`images/critters/${name}.svg`).then((r) => {
      if (!r.ok) throw new Error("Could not load critter picture " + name);
      return r.text();
    });
    p.catch(() => files.delete(name));   // allow another try later
    files.set(name, p);
  }
  return files.get(name);
}

// Everything between <svg ...> and </svg>.
const inner = (svg) => (/<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg) || [])[1] || "";

// Start loading all the drawings now, so a critter can appear instantly later.
export function preloadCritterArt() {
  return Promise.all([...ANIMALS, "acc-hat", "acc-bow", "acc-glasses"].map((n) => loadSvg(n))).catch(() => {});
}

// The finished SVG text for one animal with an optional accessory.
export async function critterSvg(animal, accessory) {
  animal = pick(animal, ANIMALS, DEFAULT_MODEL.animal);
  let acc = "";
  if (accessory && accessory !== "none" && ANCHORS[animal][accessory]) {
    const [x, y, s, r] = ANCHORS[animal][accessory];
    acc = `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">${inner(await loadSvg("acc-" + accessory))}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">` +
         inner(await loadSvg(animal)) + acc + `</svg>`;
}

// Build one critter as an element, `px` pixels wide and high.
//   m         = the learner's model settings
//   customUrl = the learner's own picture (or null)
// The animal's body color is the CSS variable --body (see styles.css), so recoloring
// never needs a different file. With a picture of their own, the animal, color and
// accessory are not used.
export async function buildCritter(m, customUrl, px) {
  const el = document.createElement("div");
  el.className = "critter";
  el.style.width = el.style.height = px + "px";
  if (customUrl) {
    const img = document.createElement("img");
    img.className = "critter-photo";
    img.alt = "";
    img.draggable = false;
    img.src = customUrl;
    el.append(img);
  } else {
    el.style.setProperty("--body", m.color);
    const art = document.createElement("div");
    art.className = "critter-art";
    art.innerHTML = await critterSvg(m.animal, m.accessory);   // our own files, not user text
    el.append(art);
  }
  return el;
}
