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

// The Chicago critters (Beta 3.31). Dibs the pigeon is the default and also gives adults tips (js/dibs.js).
export const ANIMALS = ["dibs", "chance", "ivy", "hiram", "monty", "sue", "train"];
export const CRITTER_INFO = {
  dibs:   { name: "Dibs",   story: "A Chicago pigeon. Dibs on the parking spot!" },
  chance: { name: "Chance", story: "Chance the Snapper, the Humboldt Park alligator." },
  ivy:    { name: "Ivy",    story: "A Chicago goose, like the one that nested at Wrigley Field." },
  hiram:  { name: "Hiram",  story: "A bulldog in a burgundy sweater, for Hiram H. Belding Elementary." },
  monty:  { name: "Monty",  story: "Monty and Rose, the Montrose Beach piping plovers." },
  sue:    { name: "Sue",    story: "Sue the T. rex, the Field Museum's famous skeleton." },
  train:  { name: "The L",  story: "Chicago's L train. Doors closing!" },
};
// The L (Beta 3.32) wears no costume: its "costume" choice is which L line it runs on, which colors its sign and stripe.
export const LINES = [
  { id: "line-red",    name: "Red Line",    value: "#c60c30", line: "Red Line: Howard to 95th/Dan Ryan." },
  { id: "line-blue",   name: "Blue Line",   value: "#00a1de", line: "Blue Line: O'Hare to Forest Park." },
  { id: "line-brown",  name: "Brown Line",  value: "#62361b", line: "Brown Line: Kimball to the Loop." },
  { id: "line-green",  name: "Green Line",  value: "#009b3a", line: "Green Line: Harlem/Lake to Ashland/63rd and Cottage Grove." },
  { id: "line-orange", name: "Orange Line", value: "#f9461c", line: "Orange Line: Midway to the Loop." },
  { id: "line-purple", name: "Purple Line", value: "#522398", line: "Purple Line: Linden to Howard." },
  { id: "line-pink",   name: "Pink Line",   value: "#e27ea6", line: "Pink Line: 54th/Cermak to the Loop." },
  { id: "line-yellow", name: "Yellow Line", value: "#f9e300", line: "Yellow Line: Dempster-Skokie to Howard." },
];
export const isTrain = (animal) => animal === "train";
/** The costume choices for a critter: the L lines for the L, the costumes for everyone else. */
export const costumesFor = (animal) => (isTrain(animal) ? LINES.map((l) => l.id) : ACCESSORIES);
/** A costume's (or L line's) name and its little comment. */
export const costumeInfo = (id) => { const l = LINES.find((x) => x.id === id); return l ? { name: l.name, line: l.line } : COSTUME_INFO[id] || COSTUME_INFO.none; };
const lineColor = (id) => (LINES.find((x) => x.id === id) || LINES[0]).value;
// Costumes. "line" is the little comment shown when an adult picks it.
export const ACCESSORIES = ["none", "horns", "cap-blue", "cap-black", "football", "stick", "scarf"];
export const COSTUME_INFO = {
  none:        { name: "No costume" },
  horns:       { name: "Bull horns",          line: "Red bull horns for basketball season." },
  "cap-blue":  { name: "Blue cap",            line: "A blue baseball cap for the North Side." },
  "cap-black": { name: "Black cap",           line: "A black baseball cap for the South Side." },
  football:    { name: "Football",            line: "A blue and orange football." },
  stick:       { name: "Hockey stick",        line: "A red and black hockey stick." },
  scarf:       { name: "Myrtle & gold scarf", line: "Feeling fearless and bold!" },
};
// Old choices (before Beta 3.31) -> the new critter or costume.
const OLD_ANIMAL = { puppy: "hiram", owl: "monty", frog: "chance", kitten: "dibs", bunny: "dibs" };
const OLD_ACCESSORY = { hat: "cap-blue", bow: "scarf", glasses: "none" };
/** Sue is a skeleton: she always keeps her bone color. */
export const recolorable = (animal) => animal !== "sue" && animal !== "train";
export const STYLES = ["ring", "critter", "both"];
export const SIZES = ["small", "medium", "large"];
export const ARRIVALS = ["hop", "peek", "appear"];

// "natural" (the default, Beta 3.31) = the critter's own colors; or one of eight friendly body colors.
export const NATURAL = "natural";
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

// Model a sentence (Beta 3.15): how long each step of the model takes.
export const MODEL_SPEEDS = ["slow", "medium", "fast"];
export const MODEL_STEP_MS = { slow: 1400, medium: 950, fast: 600 };

export const DEFAULT_MODEL = {
  style: "ring", ringOpacity: 100, critterOpacity: 100,
  animal: "dibs", color: NATURAL, accessory: "none", size: "medium", arrival: "hop",
  speed: "medium",            // Beta 3.15: how fast "Model a sentence" moves (slow / medium / fast)
};

// Where each costume sits on each critter, in the critter's 100 x 100 drawing: x, y = where the costume's anchor point goes,
// s = its size (1 = the whole 100 x 100 costume drawing), r = tilt in degrees. Costume drawings are 100 x 100 too; their anchor
// point is (50, 62) for hats and horns (the brim) and (50, 50) for the scarf and the things held in a hand.
const ANCHORS = {
  dibs:   { hat: [50, 16, 0.6, -6],   scarf: [50, 54, 0.56, 0],  hand: [82, 72, 0.34, -20] },
  chance: { hat: [50, 13, 0.52, -4],  scarf: [50, 56, 0.6, 0],   hand: [80, 70, 0.34, -20] },
  ivy:    { hat: [43, 16, 0.36, -12], scarf: [42, 46, 0.3, -8],  hand: [72, 74, 0.3, -20] },
  hiram:  { hat: [50, 21, 0.66, -5],  scarf: [50, 63, 0.6, 0],   hand: [84, 76, 0.34, -20] },
  monty:  { hat: [47, 26, 0.48, -8],  scarf: [48, 56, 0.5, 0],   hand: [78, 74, 0.3, -20] },
  sue:    { hat: [37, 13, 0.5, -10],  scarf: [54, 47, 0.34, 28], hand: [30, 63, 0.28, -20] },
};
const SLOT = { horns: ["hat", 62], "cap-blue": ["hat", 62], "cap-black": ["hat", 62], football: ["hand", 50], stick: ["hand", 50], scarf: ["scarf", 50] };

// ---------- Checking settings (used when restoring a backup) ----------
const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
const opacity = (v, fallback) => {
  const n = typeof v === "number" && isFinite(v) ? v : fallback;
  return Math.min(100, Math.max(0, Math.round(n / 5) * 5));
};

// Turn anything (missing, old, or from a file) into a complete, valid settings object.
export function cleanModel(raw) {
  const m = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = cleanFields(m);
  out.accessory = isTrain(out.animal) ? pick(m.accessory, costumesFor("train"), LINES[0].id)
    : pick(OLD_ACCESSORY[m.accessory] ?? m.accessory, ACCESSORIES, DEFAULT_MODEL.accessory);
  return out;
}
function cleanFields(m) {
  return {
    style: pick(m.style, STYLES, DEFAULT_MODEL.style),
    ringOpacity: opacity(m.ringOpacity, DEFAULT_MODEL.ringOpacity),
    critterOpacity: opacity(m.critterOpacity, DEFAULT_MODEL.critterOpacity),
    animal: pick(OLD_ANIMAL[m.animal] || m.animal, ANIMALS, DEFAULT_MODEL.animal),
    // A body color chosen before Beta 3.31 is kept (it now recolors the new critter); no color = the critter's own colors.
    // (The old default orange, never really chosen by most adults, becomes the new critter's own colors.)
    color: OLD_ANIMAL[m.animal] && String(m.color).toLowerCase() === "#f5a04a" ? NATURAL
      : pick(typeof m.color === "string" ? m.color.toLowerCase() : "", [NATURAL, ...COLORS.map((c) => c.value)], DEFAULT_MODEL.color),
    accessory: null,                // set just below: it depends on the critter
    size: pick(m.size, SIZES, DEFAULT_MODEL.size),
    arrival: pick(m.arrival, ARRIVALS, DEFAULT_MODEL.arrival),
    speed: pick(m.speed, MODEL_SPEEDS, "medium"),
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
  return Promise.all([...ANIMALS, ...ACCESSORIES.filter((a) => a !== "none").map((a) => "acc-" + a)].map((n) => loadSvg(n))).catch(() => {});
}

// The finished SVG text for one animal with an optional accessory.
/** The L line color for a line id (for previews that build their own picture). */
export const lineColorOf = lineColor;
export async function critterSvg(animal, accessory) {
  animal = pick(animal, ANIMALS, DEFAULT_MODEL.animal);
  let acc = "";
  if (accessory && SLOT[accessory] && !isTrain(animal)) {
    const [slot, y0] = SLOT[accessory];
    let [x, y, s, r] = ANCHORS[animal][slot];
    if (accessory === "stick") { s *= 1.7; y -= 8; }        // the stick is long: bigger, held a little higher
    acc = `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s}) translate(-50 -${y0})">${inner(await loadSvg("acc-" + accessory))}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">` +
         inner(await loadSvg(animal)) + acc + `</svg>`;
}

// Build one critter as an element, `px` pixels wide and high.
//   m         = the learner's model settings
//   customUrl = the learner's own picture (or null)
// The critter's own colors are drawn in its file; a chosen body color is the CSS variable --body on the "body" parts
// (styles.css, .recolor), so recoloring never needs a different file. With a picture of their own, the animal, color and
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
    const art = document.createElement("div");
    art.className = "critter-art";
    if (m.color !== NATURAL && recolorable(m.animal)) { art.classList.add("recolor"); el.style.setProperty("--body", m.color); }
    if (isTrain(m.animal)) el.style.setProperty("--line", lineColor(m.accessory));
    art.innerHTML = await critterSvg(m.animal, m.accessory);   // our own files, not user text
    el.append(art);
  }
  return el;
}
