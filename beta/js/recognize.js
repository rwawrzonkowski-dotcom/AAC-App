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
export const isLoaded = () => !!detectorPromise;
// Test hook: a page can replace the detector (the tests use this to feed in made-up detections). Never used by the app itself.
let override = null;
export function setDetectorForTests(fn) { override = fn; }

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
  if (override) return Promise.resolve({ detect: override });
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
    // Warm-up run, exactly as COCO-SSD's own load() does, so the first real photo is not slower.
    const zero = tf.zeros([1, 300, 300, 3], "int32");
    const out = await od.model.executeAsync(zero);
    await Promise.all(out.map((t) => t.data()));
    out.forEach((t) => t.dispose());
    zero.dispose();
    onProgress(1);
    return {
      backend: tf.getBackend(),
      // maxBoxes 20, minimum score 0.3 (the Scenes screen applies the adult-facing threshold from data/scene-words.json)
      detect: async (canvas) => (await od.detect(canvas, 20, 0.3)).map((d) => ({
        label: d.class, score: d.score, box: { x: d.bbox[0], y: d.bbox[1], w: d.bbox[2], h: d.bbox[3] } })),
    };
  })();
  detectorPromise.catch(() => { detectorPromise = null; });      // a failed load can be tried again
  return detectorPromise;
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
