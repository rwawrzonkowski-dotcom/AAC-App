// Object recognition for Scenes (Phase 3, beta 3.0). Runs ENTIRELY on this iPad: no photo ever leaves the device, and nothing is
// fetched from the internet. Two libraries and one model file set are bundled in the app folder:
//   vendor/tf.min.js          TensorFlow.js 4.22.0 (Apache 2.0)
//   vendor/coco-ssd.min.js    COCO-SSD 2.2.3 (Apache 2.0): the code that turns the model's numbers into "cup, 91%, box..."
//   models/coco-ssd/*         the COCO-SSD model itself (about 18 MB, Apache 2.0), recognizes 80 everyday things
//
// NOTHING HERE RUNS AT APP START. The libraries and the model are loaded only when an adult starts a new scene (loadRecognizer()),
// so the board opens just as fast as before and the child's speech is never slowed down. They are not in the install cache either:
// the service worker (sw.js) keeps them in a separate "models" cache the first time they are used, or when the adult taps
// "Download object recognition for offline use" in the Scenes section (downloadForOffline() below).
//
// If recognition cannot load (for example no internet the very first time and not downloaded yet), the adult can still make a
// scene by drawing boxes by hand: callers treat a failed load as "no suggestions".

import { STORAGE_PREFIX } from "./channel.js";

// Files, with their sizes in bytes (used for the progress bars). Paths are relative to the app folder.
const MODEL_DIR = "models/coco-ssd/";
export const FILES = [
  { path: "vendor/tf.min.js", bytes: 1469843, type: "application/javascript" },
  { path: "vendor/coco-ssd.min.js", bytes: 9299, type: "application/javascript" },
  { path: MODEL_DIR + "model.json", bytes: 527315, type: "application/json" },
  { path: MODEL_DIR + "group1-shard1of5", bytes: 4194304, type: "application/octet-stream" },
  { path: MODEL_DIR + "group1-shard2of5", bytes: 4194304, type: "application/octet-stream" },
  { path: MODEL_DIR + "group1-shard3of5", bytes: 4194304, type: "application/octet-stream" },
  { path: MODEL_DIR + "group1-shard4of5", bytes: 4194304, type: "application/octet-stream" },
  { path: MODEL_DIR + "group1-shard5of5", bytes: 1257312, type: "application/octet-stream" },
];
export const TOTAL_BYTES = FILES.reduce((n, f) => n + f.bytes, 0);
// "beta-aac-models-v1" in the beta copy, "aac-models-v1" in the stable app. Must match MODELS_CACHE in sw.js (which never deletes it when it updates).
export const MODELS_CACHE = STORAGE_PREFIX + "aac-models-v1";

const abs = (path) => new URL(path, document.baseURI).href;

let detectorPromise = null;      // the loaded model, kept for the rest of this visit
let grab = false, grabbed = null; // see "feature maps" below
export const isLoaded = () => !!detectorPromise;
// Test hook: a page can replace the detector (the tests use this to feed in made-up detections). Never used by the app itself.
let override = null, overrideKeepsModel = false, overrideFeatures = null;
// `real: true` keeps loading the real model (so the feature maps are real) and only replaces the detections;
// `features` supplies made-up feature maps instead (the tests).
export function setDetectorForTests(fn, { real = false, features = null } = {}) { override = fn; overrideKeepsModel = real; overrideFeatures = features; }

function loadScript(path) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = abs(path);
    s.onload = resolve;
    s.onerror = () => reject(new Error("Could not load " + path));
    document.head.appendChild(s);
  });
}

// Load the libraries and the model. onProgress(fraction 0..1) is called while the model downloads. Resolves to a detector:
// an object with detect(canvas) -> [{ label: "cup", score: 0.9, box: {x, y, w, h} }] (box in pixels of the canvas).
export function loadRecognizer(onProgress = () => {}) {
  if (override && !overrideKeepsModel) return Promise.resolve({ detect: override, features: overrideFeatures });
  if (override) return loadReal(onProgress).then((r) => ({ ...r, detect: override }));
  return loadReal(onProgress);
}
function loadReal(onProgress) {
  if (detectorPromise) return detectorPromise;
  detectorPromise = (async () => {
    if (!window.tf) await loadScript("vendor/tf.min.js");
    onProgress(0.05);
    if (!window.cocoSsd) await loadScript("vendor/coco-ssd.min.js");
    const tf = window.tf;
    // Use the graphics chip when the device has one (iPads do); otherwise the plain processor, quietly.
    try {
      const c = document.createElement("canvas");
      if (!(c.getContext("webgl2") || c.getContext("webgl"))) await tf.setBackend("cpu");
    } catch (e) { await tf.setBackend("cpu"); }
    await tf.ready();
    const url = abs(MODEL_DIR + "model.json");
    const od = new window.cocoSsd.ObjectDetection("lite_mobilenet_v2", url);   // (the name only matters when no url is given)
    od.model = await tf.loadGraphModel(url, { onProgress: (f) => onProgress(0.05 + 0.9 * f) });
    // While `grab` is on, the model run that finds objects also hands back the two feature maps (extra outputs of the same run, so no extra work).
    const model = od.model, run = model.executeAsync.bind(model);
    model.executeAsync = async (x, outs) => {
      if (!grab) return run(x, outs);
      const r = await run(x, [...model.outputNodes, MAP_NODES.f16, MAP_NODES.f32]);
      const t32 = r.pop(), t16 = r.pop();
      try { grabbed = { f16: await mapOf(tf, t16), f32: await mapOf(tf, t32) }; } finally { t16.dispose(); t32.dispose(); }
      return r;
    };
    // Warm-up run, exactly as COCO-SSD's own load() does, so the first real photo is not slower.
    const zero = tf.zeros([1, 300, 300, 3], "int32");
    const out = await od.model.executeAsync(zero);
    await Promise.all(out.map((t) => t.data()));
    out.forEach((t) => t.dispose());
    zero.dispose();
    onProgress(1);
    return {
      backend: tf.getBackend(),
      // maxBoxes 20, minimum score 0.3 (the Scenes screen applies the adult-facing threshold from data/scene-words.json).
      // The returned list also carries `.maps`: the two feature maps of the very same run (see above), for My things.
      detect: async (canvas) => {
        grab = true; grabbed = null;
        let list;
        try { list = await od.detect(canvas, 20, 0.3); } finally { grab = false; }
        const out = list.map((d) => ({ label: d.class, score: d.score, box: { x: d.bbox[0], y: d.bbox[1], w: d.bbox[2], h: d.bbox[3] } }));
        out.maps = grabbed;
        grabbed = null;
        return out;
      },
      // Only the feature maps (no object search): used when teaching, on mirrored and re-framed copies of a photo.
      features: (canvas) => mapsOf(tf, od.model, canvas),
    };
  })();
  detectorPromise.catch(() => { detectorPromise = null; });      // a failed load can be tried again
  return detectorPromise;
}

// ---------------------------------------------------------------- feature maps for My things ("Teach VOICE your things")
// Teach VOICE your things reuses the COCO-SSD model that is already bundled (no new download). Its first half is a MobileNetV2 "backbone" that turns
// the picture into grids of numbers. We read two of its layers, both from the SAME run that finds the objects (so recognizing remembered things
// costs no extra model run, which matters on a slow machine):
//   f32  "Conv_1/Relu6": the backbone's last feature layer, a 10 x 10 grid with 1280 numbers per square (what the picture is of);
//   f16  "expanded_conv_13/expand/Relu6": the layer before it, a 19 x 19 grid with 576 numbers per square (finer: colors, textures, parts).
// js/things.js averages these grids over a box (global average pooling over the box), subtracts the average everyday picture and scales
// the result to length 1 (L2 normalization): that list of numbers is the thing's "fingerprint".
export const MAP_NODES = {
  f16: "FeatureExtractor/MobilenetV2/expanded_conv_13/expand/Relu6",
  f32: "FeatureExtractor/MobilenetV2/Conv_1/Relu6",
};
export const MAP_PX = 300;       // the model resizes every picture to 300 x 300 first

async function mapOf(tf, t) {    // [1, h, w, c] tensor -> { data: Float32Array(h*w*c), h, w, c }
  const data = await t.data();
  const [, h, w, c] = t.shape;
  return { data: Float32Array.from(data), h, w, c };
}
// The feature maps of a picture, without looking for objects (used when teaching, on a mirrored or re-framed copy of the photo).
async function mapsOf(tf, model, canvas) {
  const x = tf.tidy(() => tf.browser.fromPixels(canvas).expandDims(0));
  let outs = null;
  try {
    outs = await model.executeAsync(x, [MAP_NODES.f16, MAP_NODES.f32]);
    return { f16: await mapOf(tf, outs[0]), f32: await mapOf(tf, outs[1]) };
  } finally {
    x.dispose();
    if (outs) outs.forEach((t) => t.dispose());
  }
}

// ---------------------------------------------------------------- offline copy
// Is every file already in the models cache?
export async function offlineReady() {
  if (!("caches" in window)) return false;
  try {
    const c = await caches.open(MODELS_CACHE);
    for (const f of FILES) if (!(await c.match(abs(f.path)))) return false;
    return true;
  } catch (e) { return false; }
}

// Fetch every file and keep it in the models cache. onProgress(fraction 0..1). Throws if it cannot finish.
export async function downloadForOffline(onProgress = () => {}) {
  if (!("caches" in window)) throw new Error("This browser cannot keep files for offline use.");
  const cache = await caches.open(MODELS_CACHE);
  let done = 0;
  for (const f of FILES) {
    const res = await fetch(abs(f.path));
    if (!res.ok) throw new Error("Download failed (" + f.path + ")");
    // Read in pieces so the progress bar moves smoothly.
    const parts = [];
    if (res.body && res.body.getReader) {
      const reader = res.body.getReader();
      let got = 0;
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        parts.push(value); got += value.length;
        onProgress((done + Math.min(got, f.bytes)) / TOTAL_BYTES);
      }
    } else parts.push(await res.arrayBuffer());
    await cache.put(abs(f.path), new Response(new Blob(parts), { headers: { "Content-Type": f.type } }));
    done += f.bytes;
    onProgress(done / TOTAL_BYTES);
  }
}

export async function removeOfflineCopy() {
  if ("caches" in window) { try { await caches.delete(MODELS_CACHE); } catch (e) { /* ignore */ } }
}
