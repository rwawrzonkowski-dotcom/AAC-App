// Scenes: the word side of things. Which VOICE word does a recognized thing suggest? Which related words go with it? What is a
// word's picture and spoken text for THIS learner? Where is a word's permanent spot on the board (so it can glow)?
//
// The two lists an adult can edit in a text editor are data/scene-words.json (recognition names -> VOICE words) and
// data/scene-related.json (object -> related words); both explain themselves at the top.
import { getBoardData } from "./boarddata.js";
import { getCurrent, getPhotoUrl } from "./profiles.js";
import { buildModel, getPage, pathToCore, resolvePage, posKey } from "./boardmodel.js";

let cfg = null;
export async function loadSceneConfig() {
  if (cfg) return cfg;
  const get = async (p) => { try { const r = await fetch(p); return r.ok ? await r.json() : {}; } catch (e) { return {}; } };
  const [words, related, places] = await Promise.all([get("data/scene-words.json"), get("data/scene-related.json"), get("data/scene-places.json")]);
  cfg = { classes: words.classes || {}, minConfidence: typeof words.minConfidence === "number" ? words.minConfidence : 0.4, related,
    places: places.places || {}, fromObjects: places.fromObjects || {} };
  return cfg;
}
export const minConfidence = () => (cfg ? cfg.minConfidence : 0.4);

// ---------- Words and their pictures ----------
// What a board word looks like and says for the current learner (their renamed label, spoken text and photo win).
// Returns null if the id is not a word on the board.
export function wordInfo(id) {
  const board = getBoardData();
  const base = id && board.words[id];
  if (!base) return null;
  const p = getCurrent();
  const ov = (p && p.words && p.words[id]) || {};
  const label = ov.label ?? base.label;
  const photo = getPhotoUrl("w:" + id);
  return { id, label, spoken: ov.spoken ?? base.spokenText ?? label, image: photo || base.image || null, isPhoto: !!photo };
}

// Words an adult can pick for a scene: the ordinary one-word or short-phrase words (not folder buttons, fill-in sentences or
// the number pad). Built once.
let vocab = null;
function vocabulary() {
  if (vocab) return vocab;
  const board = getBoardData();
  vocab = Object.entries(board.words)
    .filter(([, w]) => !w.loadBoard && !w.action && !w.template && w.label)
    .map(([id, w]) => ({ id, label: w.label, lower: w.label.toLowerCase() }));
  return vocab;
}
// Search by what the adult typed: words that start with it first, then words that contain it. At most `limit` results.
export function searchWords(query, limit = 40) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = [], has = [];
  for (const w of vocabulary()) {
    if (w.lower === q) starts.unshift(w);
    else if (w.lower.startsWith(q)) starts.push(w);
    else if (w.lower.includes(q)) has.push(w);
  }
  return [...starts, ...has].slice(0, limit).map((w) => wordInfo(w.id));
}
// Find the board word whose label is exactly this text (used when a typed word happens to be on the board).
export function wordByLabel(text) {
  const q = text.trim().toLowerCase();
  const hit = vocabulary().find((w) => w.lower === q);
  return hit ? wordInfo(hit.id) : null;
}

// ---------- Suggestions ----------
// What a recognized thing suggests: { label, spoken, wordId | null, checked }.
export function suggestionFor(className) {
  const m = (cfg && cfg.classes[className]) || {};
  const info = m.id ? wordInfo(m.id) : null;
  if (info) return { label: info.label, spoken: info.spoken, wordId: info.id, checked: m.checked !== false };
  const label = m.label || className;
  return { label, spoken: label, wordId: null, checked: m.checked !== false };
}

// A related entry is a word id or plain text. -> { label, spoken, wordId | null }
function relatedEntry(x) {
  const info = wordInfo(x);
  return info ? { label: info.label, spoken: info.spoken, wordId: info.id } : { label: x, spoken: x, wordId: null };
}
// Related words for one object. Looked up by the object's word id, then by its label.
export function relatedFor(item) {
  const r = cfg ? cfg.related : {};
  const list = (item.wordId && r[item.wordId]) || r[item.label.toLowerCase()] || [];
  return list.map(relatedEntry);
}
export function genericRelated() { return ((cfg && cfg.related._generic) || []).map(relatedEntry); }

// ---------- Words for the place (Beta 3.1) ----------
// An adult names the scene "Park": words that go with a park (swing, slide, push...) are offered, unchecked, in a group called "Words for Park".
// data/scene-places.json says which words go with which place. Two ways a place is found:
//   1. a keyword of the place is one of the words in the scene's name (not case sensitive; "parks" matches "park"; "bath time" matches "bathtime");
//   2. a thing in the photo implies it ("oven" or "dining table" -> Kitchen and food; "toilet" or "sink" -> Bath; "bed" -> Bedroom), even when the name has no keyword.
// Several places can match; their words are merged and a word is listed once. Returns
//   { places: [ { key, name, via } ], words: [ { wordId, why: ["Park and outside", ...] } ] }  (only words that are on the board)
const norm = (t) => " " + String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
export function placeWordsFor(sceneName, thingNames = []) {
  const places = cfg ? cfg.places : {};
  const text = norm(sceneName);
  const compact = text.replace(/ /g, "");
  const found = new Map();          // place key -> { key, name, via: Set }
  const hit = (key, via) => {
    const pl = places[key];
    if (!pl) return;
    if (!found.has(key)) found.set(key, { key, name: pl.name || key, via: new Set() });
    found.get(key).via.add(via);
  };
  for (const [key, pl] of Object.entries(places)) {
    for (const kw of pl.keywords || []) {
      const k = norm(kw);
      const kc = k.replace(/ /g, "");
      // a whole word, with or without a plural s ("park", "parks"), or (for longer keywords such as "bath-time") run together ("bathtime")
      if (text.includes(k) || text.includes(k.trimEnd() + "s ") || (kc.length >= 7 && compact.includes(kc))) hit(key, "name");
    }
  }
  const objs = cfg ? cfg.fromObjects : {};
  for (const nm of thingNames) {
    const key = objs[String(nm).toLowerCase()];
    if (key) hit(key, nm);
  }
  const words = new Map();
  for (const f of found.values()) {
    for (const id of places[f.key].words || []) {
      if (!getBoardData().words[id]) continue;
      if (!words.has(id)) words.set(id, []);
      if (!words.get(id).includes(f.name)) words.get(id).push(f.name);
    }
  }
  return { places: [...found.values()].map((f) => ({ key: f.key, name: f.name, via: [...f.via] })), words: [...words].map(([wordId, why]) => ({ wordId, why })) };
}

// ---------- Where is a word on the board? ----------
// The cell to glow for a word, given the page the board is showing now. Nothing moves and nothing is opened:
//  - the word is on the page that is showing -> its own cell;
//  - the word is on a page BELOW the one showing (a category or folder) -> the button on the showing page that opens that way;
//  - otherwise null (the word's spot is not on screen, so there is nothing to glow).
// Returns a cell key, or "words-btn" (the Words button in the top bar), or null. Only buttons the child can see count: a hidden
// (gray) word or a hidden folder button gives null.
export function spotFor(wordId, currentPageId, { wordsButtonShown }) {
  if (!wordId) return null;
  const profile = getCurrent();
  const model = buildModel(getBoardData(), profile.gridSize);
  const pageIds = ["core", ...Object.keys(model.pages)];
  const cache = new Map();
  const cellsOf = (pid) => {
    if (!cache.has(pid)) cache.set(pid, resolvePage(getPage(model, profile, pid), profile, model));
    return cache.get(pid);
  };
  const candidates = [];
  for (const pid of pageIds) {
    const page = getPage(model, profile, pid);
    if (!page || !page.items.some((it) => it.id === wordId)) continue;
    const word = cellsOf(pid).find((d) => d.kind === "word" && d.wordId === wordId && d.visible);
    if (!word) continue;
    const chain = pathToCore(model, profile, pid);          // [this page, its parent, ..., "core"]
    if (chain[chain.length - 1] !== "core") continue;
    // Every opening button on the way must be visible to the child.
    let ok = true;
    for (let i = 0; i < chain.length - 1 && ok; i++) {
      const child = getPage(model, profile, chain[i]);
      if (!child.at) { ok = wordsButtonShown; continue; }     // the Words menu is opened by the top-bar button
      ok = cellsOf(chain[i + 1]).some((d) => d.row === child.at.row && d.col === child.at.col && d.kind === "word" && d.visible);
    }
    if (ok) candidates.push({ chain, word });
  }
  candidates.sort((a, b) => a.chain.length - b.chain.length);
  for (const { chain, word } of candidates) {
    const at = chain.indexOf(currentPageId);
    if (at < 0) continue;
    if (at === 0) return word.key;
    const child = getPage(model, profile, chain[at - 1]);
    return child.at ? posKey(model.size, currentPageId, child.at.row, child.at.col) : "words-btn";
  }
  return null;
}

// ---------- Where does a word live, for the tags on the Scenes screens (Beta 3.6)? ----------
// { status: "visible" | "hidden" | "none", where: "" | "Animals" | "Animals › Pets" | "Words menu › ..." }
//  visible: the child can reach the word now (the word and every folder button on the way are showing);
//  hidden:  the word has a permanent spot on this board but it is not revealed yet at this stage (or a folder on the way is hidden);
//  none:    the word is not on this board size at all.
export function whereIs(wordId, { wordsButtonShown = true } = {}) {
  if (!wordId) return { status: "none", where: "" };
  const profile = getCurrent();
  const model = buildModel(getBoardData(), profile.gridSize);
  const cache = new Map();
  const cellsOf = (pid) => {
    if (!cache.has(pid)) cache.set(pid, resolvePage(getPage(model, profile, pid), profile, model));
    return cache.get(pid);
  };
  const nameOf = (chain) => chain.slice(0, -1).reverse().map((pid) => {
    const pg = getPage(model, profile, pid);
    return pg && !pg.at ? "Words menu" : (pg && pg.name) || "";   // the Words menu opens from the top bar
  }).filter(Boolean).join(" › ");
  let hidden = null;
  const found = [];
  for (const pid of ["core", ...Object.keys(model.pages)]) {
    const page = getPage(model, profile, pid);
    if (!page || !page.items.some((it) => it.id === wordId)) continue;
    const chain = pathToCore(model, profile, pid);
    if (chain[chain.length - 1] !== "core") continue;
    const word = cellsOf(pid).find((d) => d.kind === "word" && d.wordId === wordId);
    if (!word) continue;
    let ok = !!word.visible;
    for (let i = 0; i < chain.length - 1 && ok; i++) {
      const child = getPage(model, profile, chain[i]);
      if (!child.at) { ok = wordsButtonShown; continue; }
      ok = cellsOf(chain[i + 1]).some((d) => d.row === child.at.row && d.col === child.at.col && d.kind === "word" && d.visible);
    }
    if (ok) found.push(chain);
    else if (!hidden || chain.length < hidden.length) hidden = chain;
  }
  if (found.length) {
    found.sort((a, b) => a.length - b.length);
    return { status: "visible", where: nameOf(found[0]) };
  }
  if (hidden) return { status: "hidden", where: nameOf(hidden) };
  return { status: "none", where: "" };
}

// The tag for a scene row: { text, cls, title }.
export function placeTag(wordId, opts) {
  if (!wordId) return { text: "Scene only", cls: "only", title: "Not a board word: this button lives in the scene strip only" };
  const w = whereIs(wordId, opts);
  if (w.status === "visible") return { text: w.where ? "On board · " + w.where : "On board", cls: "on",
    title: w.where ? "On the board inside " + w.where + ". Tapping it in the strip makes that folder button glow." : "On the main board. Tapping it in the strip makes its button glow." };
  if (w.status === "hidden") return { text: w.where ? "Hidden for now · " + w.where : "Hidden for now", cls: "hidden",
    title: "This word has a permanent spot on the board but is not revealed at this stage yet. It still works in the scene strip; nothing glows." };
  return { text: "Not on this board", cls: "only", title: "This VOICE word is not on this board size. It works in the scene strip only." };
}
