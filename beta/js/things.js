// My things (Beta 3.1, "Teach VOICE your things"): objects an adult taught VOICE by photo, so that later photos can suggest them by name.
//
// EXAMPLE: Sam's own dinosaur is not one of the 80 things the recognition model knows. The adult draws a box around it in one photo and
// leaves "Remember this" on. VOICE saves the little picture and a "fingerprint" of it (1280 numbers, see js/recognize.js). In a later photo
// VOICE slides windows over the picture, fingerprints each one and offers "Remembered: dinosaur" with a box where the fingerprints agree.
// Everything happens on this iPad; no photo, picture or fingerprint is ever sent anywhere.
//
// STORAGE: IndexedDB store "things", one row per remembered thing, key "<learnerId>|<thingId>" (per learner; deleting a learner deletes them).
//   thing = { id, learnerId, label, spoken, wordId | null, created, picture: Blob (256 px jpeg), views: [Float32Array(1856)], photos: n }
// `views` are the fingerprints (raw: 1280 + 576 numbers each): the photo as taken, its mirror image, and the photo zoomed in and out around the
// thing (so a different distance or side does not matter). "Teach again" adds the views of another photo of the same thing.
// BACKUP (file version 16): written with the scenes ("Include scenes and photos"); fingerprints as base64 text.
import * as db from "./db.js";

export const MAX_THINGS = 60;       // per learner
export const MAX_VIEWS = 36;        // fingerprints kept per thing (older ones are dropped first, the very first photo is kept)

const key = (learnerId, id) => learnerId + "|" + id;
export const newThingId = () => "th" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export async function listThings(learnerId) {
  const rows = await db.getPrefix("things", learnerId + "|");
  return rows.map((r) => r.value).filter((t) => t && t.id).sort((a, b) => a.created - b.created);
}
export const putThing = (t) => db.put("things", key(t.learnerId, t.id), t);
export const deleteThing = (learnerId, id) => db.del("things", key(learnerId, id));
export const deleteThings = (learnerId) => db.delPrefix("things", learnerId + "|");

// ---------------------------------------------------------------- strictness (adult menu > Scenes > My things > Match strictness)
// A remembered match must reach this score (0 to 1; see `score`). Tuned on the tests described in the README ("Match strictness").
export const STRICTNESS = ["low", "medium", "high"];
export const THRESHOLDS = { low: 0.62, medium: 0.70, high: 0.78 };
export const STRICTNESS_LABEL = { low: "Low (suggests more, wrong more often)", medium: "Medium", high: "High (suggests fewer, wrong less often)" };

// ---------------------------------------------------------------- fingerprints
// The recognition model's feature maps (js/recognize.js: `f32` 10x10x1280 and `f16` 19x19x576) are averaged over a box. The raw result is a list of
// 1280 + 576 numbers (`raw`). To compare, each half is made relative to the average everyday picture (data/embed-mean.json) and scaled to length 1;
// two things look alike when their halves point the same way (cosine), the finer half (f16) counting WEIGHT_F16 of the score.
export const LEN32 = 1280, LEN16 = 576, RAW_LEN = LEN32 + LEN16;
// (TUNE is read on every comparison; the tests change it to try other settings. The app never does.)
export const TUNE = { weightF16: 0.7, useMean: true };
let MEAN = { f32: new Float32Array(LEN32), f16: new Float32Array(LEN16) };
export function setMean(m) {
  if (m && m.f32 && m.f32.length === LEN32 && m.f16 && m.f16.length === LEN16) MEAN = { f32: Float32Array.from(m.f32), f16: Float32Array.from(m.f16) };
}
let meanLoaded = null;
export function loadMean() {
  if (!meanLoaded) meanLoaded = fetch("data/embed-mean.json").then((r) => (r.ok ? r.json() : null)).then(setMean).catch(() => {});
  return meanLoaded;
}

// Prepared fingerprint (used for comparing): both halves relative to the mean, scaled to length 1 and by the half's weight.
export function prep(raw) {
  const out = new Float32Array(RAW_LEN);
  const half = (from, len, mean, weight, at) => {
    let n = 0;
    const m = TUNE.useMean ? mean : null;
    for (let i = 0; i < len; i++) { const v = raw[from + i] - (m ? m[i] : 0); out[at + i] = v; n += v * v; }
    const k = Math.sqrt(weight) / (Math.sqrt(n) || 1);
    for (let i = 0; i < len; i++) out[at + i] *= k;
  };
  half(0, LEN32, MEAN.f32, 1 - TUNE.weightF16, 0);
  half(LEN32, LEN16, MEAN.f16, TUNE.weightF16, LEN32);
  return out;
}
function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
// The best score of a prepared fingerprint against one thing (its prepared views are cached on the object).
export function score(q, thing) {
  if (!thing._p) thing._p = thing.views.map(prep);
  let best = -1;
  for (const v of thing._p) { const s = dot(q, v); if (s > best) best = s; }
  return best;
}

// ----- averaging a feature map over a box
// An "integral image" makes the average over ANY rectangle cost the same: I[y][x] = the sum of every square above and to the left. The sum over a
// rectangle with fractional edges is exact when the four corner values are read with bilinear interpolation (the map is constant inside a square).
export function integral(map) {
  const { h, w, c, data } = map;
  const W1 = w + 1;
  const I = new Float64Array((h + 1) * W1 * c);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = ((y + 1) * W1 + (x + 1)) * c, up = (y * W1 + (x + 1)) * c, left = ((y + 1) * W1 + x) * c, diag = (y * W1 + x) * c, src = (y * w + x) * c;
      for (let k = 0; k < c; k++) I[at + k] = data[src + k] + I[up + k] + I[left + k] - I[diag + k];
    }
  }
  return { h, w, c, I };
}
const _corner = (ii, x, y, out, sign) => {         // add sign * F(x, y) to out, F = bilinear read of the integral image (x, y in squares)
  const { h, w, c, I } = ii, W1 = w + 1;
  x = Math.min(w, Math.max(0, x)); y = Math.min(h, Math.max(0, y));
  let xi = Math.floor(x), yi = Math.floor(y);
  if (xi >= w) xi = w - 1;
  if (yi >= h) yi = h - 1;
  const fx = x - xi, fy = y - yi;
  const a = (yi * W1 + xi) * c, b = a + c, d = ((yi + 1) * W1 + xi) * c, e = d + c;
  const w00 = (1 - fx) * (1 - fy) * sign, w10 = fx * (1 - fy) * sign, w01 = (1 - fx) * fy * sign, w11 = fx * fy * sign;
  for (let k = 0; k < c; k++) out[k] += w00 * I[a + k] + w10 * I[b + k] + w01 * I[d + k] + w11 * I[e + k];
};
// The average of the map over a box {x, y, w, h} (fractions of the photo). -> Float64Array(c)
export function pool(ii, box, out = new Float64Array(ii.c)) {
  out.fill(0);
  const x0 = box.x * ii.w, y0 = box.y * ii.h, x1 = (box.x + box.w) * ii.w, y1 = (box.y + box.h) * ii.h;
  _corner(ii, x1, y1, out, 1); _corner(ii, x0, y1, out, -1); _corner(ii, x1, y0, out, -1); _corner(ii, x0, y0, out, 1);
  const area = Math.max(1e-6, (x1 - x0) * (y1 - y0));
  for (let k = 0; k < out.length; k++) out[k] /= area;
  return out;
}
// Both maps of a photo, ready to be averaged over any box.
export function integrals(maps) { return { f32: integral(maps.f32), f16: integral(maps.f16) }; }
const t32 = new Float64Array(LEN32), t16 = new Float64Array(LEN16);
// The raw fingerprint (1280 + 576 numbers) of a box.
export function describe(ints, box) {
  const raw = new Float32Array(RAW_LEN);
  raw.set(pool(ints.f32, box, t32), 0);
  raw.set(pool(ints.f16, box, t16), LEN32);
  return raw;
}

const clamp01 = (b) => {
  const x = Math.min(1, Math.max(0, b.x)), y = Math.min(1, Math.max(0, b.y));
  return { x, y, w: Math.max(0.01, Math.min(1 - x, b.x + b.w - x)), h: Math.max(0.01, Math.min(1 - y, b.y + b.h - y)) };
};

// ---------------------------------------------------------------- teaching
// Fingerprints of a thing drawn at `box` (fractions) in `canvas` (the photo): the photo as taken, its mirror image, and the photo zoomed in and out
// around the thing (so a different distance or side does not matter). Each is its own run of the recognition backbone (det.features), about 1 s each
// on a slow computer and a fraction of that on an iPad. Returns raw fingerprints.
const ZOOMS = [1, "flip", 1.6, 0.62];
export async function fingerprintsFor(det, canvas, box) {
  if (!det || !det.features) throw new Error("Recognition is not available");
  const W = canvas.width, H = canvas.height;
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const out = [];
  for (const z of ZOOMS) {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "#7c7468"; g.fillRect(0, 0, W, H);
    let b = box;
    if (z === "flip") { g.translate(W, 0); g.scale(-1, 1); g.drawImage(canvas, 0, 0); b = { ...box, x: 1 - box.x - box.w }; }
    else if (z === 1) g.drawImage(canvas, 0, 0);
    else {
      g.drawImage(canvas, 0, 0, W, H, cx * W * (1 - z), cy * H * (1 - z), W * z, H * z);
      b = { x: cx + (box.x - cx) * z, y: cy + (box.y - cy) * z, w: box.w * z, h: box.h * z };
      const inside = clamp01(b);
      if (inside.w * inside.h < 0.7 * b.w * b.h) continue;        // zoomed in too far: part of the thing would be cut off
      b = inside;
    }
    const maps = await det.features(c);
    out.push(describe(integrals(maps), b));
  }
  return out;
}

// Add fingerprints to a thing, keeping at most MAX_VIEWS (the first photo's views stay; the oldest of the rest go first).
export function addViews(thing, views) {
  const first = thing.views.slice(0, 4);
  thing.views = [...thing.views, ...views];
  if (thing.views.length > MAX_VIEWS) thing.views = [...first, ...thing.views.slice(thing.views.length - (MAX_VIEWS - first.length))];
  thing.photos = (thing.photos || 1) + 1;
  delete thing._p;
}

// ---------------------------------------------------------------- finding remembered things in a new photo
export function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
}
// Boxes to try: five sizes (the box's width as a fraction of the photo's shorter side... see below), each wide, square and tall, stepping by a third of the size.
export function gridBoxes(W, H) {
  const m = Math.min(W, H), out = [];
  for (const f of [0.12, 0.18, 0.27, 0.4, 0.6]) {
    for (const [ax, ay] of [[1, 1], [1.5, 1], [1, 1.5]]) {
      const bw = Math.min(1, f * m * ax / W), bh = Math.min(1, f * m * ay / H);
      const sx = Math.max(bw / 2, 0.04), sy = Math.max(bh / 2, 0.04);
      for (let y = 0; y <= 1 - bh + 1e-6; y += sy) for (let x = 0; x <= 1 - bw + 1e-6; x += sx) out.push({ x, y, w: bw, h: bh });
    }
  }
  return out;
}
// Nearby boxes around a good one, to tighten it: smaller and bigger, wider and taller, shifted by up to half a box.
function refineBoxes(b) {
  const out = [];
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  for (const k of [0.7, 0.85, 1, 1.2, 1.4]) for (const a of [0.8, 1, 1.25]) {
    const w = b.w * k * Math.sqrt(a), h = b.h * k / Math.sqrt(a);
    for (const dx of [-0.5, 0, 0.5]) for (const dy of [-0.5, 0, 0.5]) out.push(clamp01({ x: cx + dx * b.w - w / 2, y: cy + dy * b.h - h / 2, w, h }));
  }
  return out;
}

// Look for the learner's remembered things in a photo (no model run: the feature maps came with the detection run).
//   maps       the photo's feature maps ({ f16, f32 } from det.detect(...).maps or det.features(...))
//   things     listThings() for the learner
//   detected   boxes the object detector found, as fractions: [{ x, y, w, h }] (always tried, so a detected box is a candidate as well)
//   W, H       the photo's size in pixels (only for the shape of the windows)
// Returns [{ thing, score, box (fractions), detectedIndex | -1 }], at most one per thing, best first.
export function findRemembered(maps, things, detected, W, H, strictness = "medium") {
  if (!things.length || !maps) return [];
  const thr = typeof strictness === "number" ? strictness : (THRESHOLDS[strictness] ?? THRESHOLDS.medium);     // (a number = an exact threshold, for the tests)
  const ints = integrals(maps);
  const best = new Map();      // thing id -> { thing, s, box, idx }
  const consider = (box, idx) => {
    const q = prep(describe(ints, box));
    for (const t of things) {
      const s = score(q, t);
      const cur = best.get(t.id);
      if (!cur || s > cur.s) best.set(t.id, { thing: t, s, box, idx });
    }
  };
  detected.forEach((b, i) => consider(clamp01(b), i));
  for (const b of gridBoxes(W, H)) consider(b, -1);
  // Second look: around each thing's best spot, in smaller steps.
  for (const cur of [...best.values()]) {
    if (cur.s < thr - 0.1) continue;
    const keep = cur.idx;
    for (const b of refineBoxes(cur.box)) {
      const q = prep(describe(ints, b));
      const s = score(q, cur.thing);
      const now = best.get(cur.thing.id);
      if (s > now.s) best.set(cur.thing.id, { thing: cur.thing, s, box: b, idx: -1 });
    }
    void keep;
  }
  const out = [];
  for (const b of best.values()) if (b.s >= thr) out.push({ thing: b.thing, score: b.s, box: b.box, detectedIndex: b.idx });
  out.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const m of out) if (!kept.some((k) => iou(k.box, m.box) > 0.5)) kept.push(m);       // two things must not claim the same spot
  return kept;
}

// ---------------------------------------------------------------- backup
const b64 = (f32) => { const u = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Float32Array(u.buffer); };
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
}
function dataUrlToBlob(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,/.exec(typeof dataUrl === "string" ? dataUrl : "");
  if (!m) return null;
  try { const bin = atob(dataUrl.slice(m[0].length)); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: m[1] }); } catch (e) { return null; }
}

export async function exportThings(learnerId) {
  const list = [];
  for (const t of await listThings(learnerId)) {
    list.push({ id: t.id, label: t.label, spoken: t.spoken, wordId: t.wordId || null, created: t.created, photos: t.photos || 1,
      picture: await blobToDataUrl(t.picture), views: t.views.map(b64) });
  }
  return { list };
}

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const WORD_ID = /^[A-Za-z0-9_:,@.+~-]{1,80}$/;
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const txt = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
// Read the `things` part of a backup file; anything unreadable is skipped. Returns { list } or null.
export function cleanThingsBackup(raw) {
  if (!isObj(raw) || !Array.isArray(raw.list)) return null;
  const list = [], seen = new Set();
  for (const t of raw.list.slice(0, MAX_THINGS)) {
    if (!isObj(t) || typeof t.id !== "string" || !ID.test(t.id) || seen.has(t.id)) continue;
    const label = txt(t.label, 40).trim();
    const picture = dataUrlToBlob(t.picture);
    if (!label || !picture || !Array.isArray(t.views)) continue;
    const views = [];
    for (const v of t.views.slice(0, MAX_VIEWS)) {
      try { const f = typeof v === "string" ? unb64(v) : null; if (f && f.length === RAW_LEN && f.every(Number.isFinite)) views.push(f); } catch (e) { /* skip */ }
    }
    if (!views.length) continue;
    seen.add(t.id);
    list.push({ id: t.id, label, spoken: txt(t.spoken, 80) || label, wordId: typeof t.wordId === "string" && WORD_ID.test(t.wordId) ? t.wordId : null,
      created: Number.isFinite(t.created) ? t.created : Date.now(), photos: Math.max(1, Math.round(Number(t.photos)) || 1), picture, views });
  }
  if (!list.length && raw.list.length) return null;
  return { list };
}

// Replace this learner's remembered things with the ones from a backup.
export async function importThings(learnerId, data) {
  await deleteThings(learnerId);
  await db.batch(data.list.map((t) => ({ store: "things", key: key(learnerId, t.id), value: { ...t, learnerId } })));
}
