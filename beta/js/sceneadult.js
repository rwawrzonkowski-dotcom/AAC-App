// Scenes: the adult screens (Phase 3, beta 3.0). Adult menu > Scenes.
//
//   - the Scenes section of the adult menu: this learner's scenes (use, edit, rename, reorder, delete), "New scene", "Clear scene",
//     and the button that downloads object recognition for offline use;
//   - making a scene: take or choose a photo -> the app finds things in it (on this iPad) -> the adult ticks the ones to keep, renames
//     them, draws a box by hand around anything it missed, picks related words, names the scene, and saves.
//
// Nothing is saved until the adult taps Save. The photo and the recognition never leave this iPad.
//
// Beta 3.1 added to this file: words that fit the scene's NAME (js/scenewords.js placeWordsFor, data/scene-places.json); "Remember this"
// (My things: js/things.js, js/thingsui.js) with remembered things found again in new photos; and the QUICK sheet (the camera button in the
// top bar, js/camerabtn.js) which is this same editor in a compact mode: everything suggested is pre-ticked, "Use now" saves and shows the
// scene, "More options" turns the compact sheet into the full editor.
import { h, openOverlay, askText, askConfirm } from "./ui.js";
import { getCurrent } from "./profiles.js";
import * as store from "./scenedata.js";
import * as strip from "./scenestrip.js";
import { loadRecognizer, offlineReady, downloadForOffline, removeOfflineCopy } from "./recognize.js";
import { loadSceneConfig, suggestionFor, relatedFor, genericRelated, placeWordsFor, searchWords, wordByLabel, wordInfo, minConfidence } from "./scenewords.js";
import { photoToCanvas, cropCanvas, canvasBlob, attachBoxDrawing } from "./photoboxes.js";
import * as things from "./things.js";
import { thingsSection } from "./thingsui.js";

// ---------------------------------------------------------------- the Scenes section of the adult menu
// ctx: { refresh() rebuilds the menu, closeMenu() }
export function scenesSection(ctx) {
  const cur = getCurrent();
  const scenes = strip.getScenes();
  const active = strip.getActive();
  const changed = async () => { await strip.load(); ctx.refresh(); };

  const rows = scenes.map((s, i) => {
    const thumb = h("img", { class: "sl-thumb", alt: "" });
    const u = URL.createObjectURL(s.photo);
    thumb.onload = () => URL.revokeObjectURL(u);
    thumb.src = u;
    const move = async (d) => {
      const list = scenes.slice();
      [list[i], list[i + d]] = [list[i + d], list[i]];
      await store.saveOrder(list);
      await changed();
    };
    return h("div", { class: "scene-row" + (active && active.id === s.id ? " is-active" : ""), "data-scene": s.id },
      thumb,
      h("div", { class: "sl-main" },
        h("div", { class: "sl-name", text: s.name }),
        h("div", { class: "muted sl-sub", text: `${s.items.length} ${s.items.length === 1 ? "button" : "buttons"}` + (active && active.id === s.id ? " · showing on the strip" : "") })),
      h("div", { class: "sl-btns" },
        h("button", { type: "button", class: "btn sl-use", text: active && active.id === s.id ? "Showing" : "Use", disabled: !!(active && active.id === s.id),
          onclick: async () => { await strip.setActive(s.id); ctx.refresh(); } }),
        h("button", { type: "button", class: "btn sl-edit", text: "Edit", onclick: () => editScene(s, changed) }),
        h("button", { type: "button", class: "btn sl-rename", text: "Rename", onclick: async () => {
          const name = await askText("Rename scene", s.name, "Save");
          if (!name) return;
          s.name = name; await store.putScene(s); await changed();
        } }),
        h("button", { type: "button", class: "btn sl-up", "aria-label": "Move up", text: "↑", disabled: i === 0, onclick: () => move(-1) }),
        h("button", { type: "button", class: "btn sl-down", "aria-label": "Move down", text: "↓", disabled: i === scenes.length - 1, onclick: () => move(1) }),
        h("button", { type: "button", class: "btn danger sl-delete", text: "Delete", onclick: async () => {
          const sure = await askConfirm(`Delete the scene "${s.name}" and its photo? This cannot be undone.`, "Delete scene");
          if (!sure) return;
          await store.deleteScene(cur.id, s.id);
          if (cur.activeScene === s.id) await strip.setActive(null);
          await changed();
        } })));
  });

  return h("section", { class: "panel", id: "sec-scenes" },
    h("h2", { text: "Scenes (for this learner)" }),
    h("p", { class: "muted", text: "A scene is a photo of a place or activity (kitchen, park, bath). The app suggests the things it finds in the photo; you approve them, " +
      "and they appear as buttons in the strip under the message bar, with the board’s own words for them glowing gently where they live. " +
      "The board never changes. Photos and object recognition stay on this iPad: nothing is sent anywhere." }),
    active ? h("p", { class: "teach-active", id: "scene-active", text: `Showing on the strip: ${active.name}` }) : h("p", { class: "muted", id: "scene-active", text: "No scene is showing on the strip." }),
    rows.length ? h("div", { class: "scene-list" }, rows) : h("p", { class: "muted", text: "No scenes yet." }),
    h("div", { class: "btn-row left" },
      h("button", { type: "button", class: "btn primary", id: "scene-new", text: "New scene", onclick: () => newScene(changed) }),
      h("button", { type: "button", class: "btn", id: "scene-clear", text: "Clear scene", disabled: !active,
        onclick: async () => { await strip.setActive(null); ctx.refresh(); } })),
    thingsSection(ctx),
    offlineBlock(ctx));
}

// The "download for offline use" block: status, the button, a progress bar.
function offlineBlock(ctx) {
  const status = h("p", { class: "muted", id: "scene-offline-status", text: "Checking…" });
  const bar = h("progress", { id: "scene-offline-progress", max: "100", value: "0", hidden: true });
  const btn = h("button", { type: "button", class: "btn", id: "scene-offline", text: "Download object recognition for offline use (18 MB)" });
  const remove = h("button", { type: "button", class: "link-btn", id: "scene-offline-remove", text: "Remove the downloaded copy", hidden: true });
  const paint = async () => {
    const ready = await offlineReady();
    status.textContent = ready ? "Object recognition is saved on this iPad: new scenes work without internet."
      : "Not saved for offline use yet. It downloads by itself the first time you make a scene while online (about 19 MB with its small code library, once); tap the button to get it now.";
    btn.disabled = ready; remove.hidden = !ready;
  };
  btn.addEventListener("click", async () => {
    btn.disabled = true; bar.hidden = false; bar.value = 0;
    status.textContent = "Downloading… keep this screen open.";
    try {
      await downloadForOffline((f) => { bar.value = Math.round(f * 100); });
      bar.hidden = true;
    } catch (e) {
      bar.hidden = true;
      status.textContent = "The download did not finish (" + (e && e.message ? e.message : "no connection") + "). Try again with internet.";
      btn.disabled = false;
      return;
    }
    paint();
  });
  remove.addEventListener("click", async () => { await removeOfflineCopy(); paint(); });
  paint();
  return h("div", { class: "scene-offline" }, h("h3", { text: "Object recognition" }), status, bar,
    h("div", { class: "btn-row left" }, btn, remove));
}

// ---------------------------------------------------------------- making a new scene
// Step 1: take or choose a photo. Step 2: find things. Step 3: the editor.
function newScene(onDone) {
  const input = h("input", { type: "file", accept: "image/*", id: "scene-file", class: "file-hidden" });
  const o = openOverlay([
    h("h2", { text: "New scene" }),
    h("p", { class: "muted", text: "Take a photo of the place or activity, or choose one you already have. On an iPad you will be offered the camera or your photos." }),
    h("div", { class: "btn-row left" },
      h("label", { class: "btn primary", for: "scene-file", id: "scene-choose", text: "Take or choose a photo" }), input),
    h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn", text: "Cancel", onclick: () => o.close() })),
  ], { sheetClass: "small" });
  input.addEventListener("change", async () => {
    const f = input.files && input.files[0];
    input.value = "";
    if (!f) return;
    o.close();
    await startFromPhoto(f, { onDone });
  });
}

// A photo has been chosen (File or Blob): find things (and the learner's remembered things) in it, then open the editor.
// quick: the compact camera-button sheet (everything suggested is pre-ticked); otherwise the full editor.
export async function startFromPhoto(file, { quick = false, onDone = async () => {} } = {}) {
  const msg = h("p", { class: "confirm-text", id: "scene-finding", text: "Finding things…" });
  const bar = h("progress", { max: "100", value: "0", id: "scene-finding-progress" });
  let skipped = false, wake = () => {};
  const o = openOverlay([
    h("h2", { text: "Finding things…" }), msg, bar,
    h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn", id: "scene-skip", text: "Skip: I will add things by hand",
      onclick: () => { skipped = true; wake(); } })),
  ], { sheetClass: "small" });
  let canvas;
  try { canvas = await photoToCanvas(file); }
  catch (e) { o.close(); await askConfirm("That picture could not be opened. " + (e && e.message ? e.message : ""), "OK"); return; }
  await loadSceneConfig();
  const cur = getCurrent();
  const W = canvas.width, H = canvas.height;
  let rows = [], note = "";
  const work = (async () => {
    msg.textContent = "Getting object recognition ready (the first time only)…";
    const det = await loadRecognizer((f) => { bar.value = Math.round(f * 100); });
    msg.textContent = "Finding things…";
    bar.removeAttribute("value");                 // an unfilled bar means "working"
    const found = await det.detect(canvas);
    // The things the detector found, as boxes (fractions of the photo).
    const detRows = [];
    for (const d of found) {
      if (d.score < minConfidence()) continue;
      const x = Math.max(0, d.box.x / W), y = Math.max(0, d.box.y / H);
      const box = { x, y, w: Math.min(1 - x, d.box.w / W), h: Math.min(1 - y, d.box.h / H) };
      if (box.w < 0.03 || box.h < 0.03) continue;
      const sug = suggestionFor(d.label);
      const r = makeRow("object", sug, box, quick ? true : sug.checked, d.score);
      r.cocoClass = d.label;                     // (the model's own name; kept for the place suggestions)
      detRows.push(r);
    }
    // This learner's remembered things (My things): their fingerprints are compared with every part of this photo, using the two feature
    // maps that came with the object search (no extra model run; js/things.js). Needs the recognizer and the mean (data/embed-mean.json).
    let matches = [];
    const mine = await things.listThings(cur.id);
    if (mine.length) {
      msg.textContent = "Looking for your remembered things…";
      try {
        await things.loadMean();
        const maps = found.maps || (det.features ? await det.features(canvas) : null);
        matches = things.findRemembered(maps, mine, detRows.map((r) => r.box), W, H, cur.matchStrictness);
      } catch (e) { console.warn("Could not look for remembered things:", e); }
    }
    return { detRows, matches };
  })();
  work.catch(() => {});                           // (a failure is reported below; this stops a second, unhandled report)
  const gaveUp = new Promise((r) => { wake = r; });
  try {
    const res = await Promise.race([work, gaveUp]);
    if (!skipped && res) rows = mergeRemembered(res.detRows, res.matches);
  } catch (e) {
    note = "Object recognition could not start (it needs to download once while online). You can still make the scene by drawing a box around each thing.";
    console.warn("Object recognition not available:", e);
  }
  o.close();
  rows.sort((a, b) => (a.box.x + a.box.w / 2) - (b.box.x + b.box.w / 2));       // left to right in the photo
  await openEditor({ canvas, rows, quick, note: note || (skipped ? "" : rows.length ? "" : "Nothing was found. Draw a box around each thing instead."), onDone });
}

// A remembered match outranks the generic recognition label on the same spot ("Remembered: Sam's dinosaur" instead of "teddy bear"):
// detected rows that cover the same region are replaced by the remembered row (which keeps the detector's box when it was found there).
const centerIn = (a, b) => { const cx = b.x + b.w / 2, cy = b.y + b.h / 2; return cx >= a.x && cx <= a.x + a.w && cy >= a.y && cy <= a.y + a.h; };
const sameRegion = (a, b) => things.iou(a, b) > 0.25 || centerIn(a, b) || centerIn(b, a);
export function mergeRemembered(detRows, matches) {
  let rows = detRows.slice();
  for (const m of matches) {
    const hit = rows.filter((r) => !r.remembered && sameRegion(m.box, r.box));
    const box = hit.length ? (m.detectedIndex >= 0 && detRows[m.detectedIndex] && hit.includes(detRows[m.detectedIndex]) ? detRows[m.detectedIndex].box : hit[0].box) : m.box;
    rows = rows.filter((r) => !hit.includes(r));
    const row = makeRow("object", { label: m.thing.label, spoken: m.thing.spoken, wordId: m.thing.wordId }, box, true, m.score);
    row.remembered = { thingId: m.thing.id, score: m.score, replaced: hit.map((r) => r.label) };
    row.remember = false;                         // ("Teach again" with this photo is off unless the adult ticks it)
    rows.push(row);
  }
  return rows;
}

async function editScene(scene, onDone) {
  await loadSceneConfig();
  const canvas = await photoToCanvas(scene.photo);
  const rows = scene.items.map((it) => ({ id: it.id, kind: it.kind, label: it.label, spoken: it.spoken, wordId: it.wordId || null, box: it.box || null, on: true, crop: it.crop || null, from: [], remember: false }));
  await openEditor({ scene, canvas, rows, onDone });
}

let rowSeq = 0;
// remember: the "Remember this" box (My things). Things from the detector start OFF; things drawn by hand start ON (set where they are drawn).
function makeRow(kind, sug, box, on, score) {
  return { id: "r" + Date.now().toString(36) + (rowSeq++), kind, label: sug.label, spoken: sug.spoken || sug.label, wordId: sug.wordId || null, box: box || null, on, crop: null, from: [], score, remember: false };
}
const keyOf = (r) => r.wordId || "t:" + r.label.toLowerCase();

// ---------------------------------------------------------------- the editor
// init: { scene?, canvas, rows (object rows), note?, onDone() }
async function openEditor(init) {
  const cur = getCurrent();
  const { canvas, scene } = init;
  const W = canvas.width, H = canvas.height;
  const photoBlob = scene ? scene.photo : await canvasBlob(canvas);
  const photoUrl = URL.createObjectURL(photoBlob);
  const st = {
    name: scene ? scene.name : "", showPhoto: scene ? !!scene.showPhoto : false,
    objects: init.rows.filter((r) => r.kind === "object"),
    related: new Map(init.rows.filter((r) => r.kind === "related").map((r) => [keyOf(r), r])),
    order: [], drawing: false, dirty: false, thumbs: new Map(),
    quick: !!init.quick,            // the compact camera-button sheet; "More options" turns it into the full editor
  };
  // The strip order starts as the ticked rows: a new scene's suggestions left to right in the photo, or an existing scene's saved order.
  st.order = init.rows.filter((r) => r.on).map((r) => r.id);

  const allRows = () => [...st.objects, ...st.related.values()];
  const rowById = (id) => allRows().find((r) => r.id === id);
  const thumb = (r) => {
    if (r.kind !== "object") return null;
    if (!st.thumbs.has(r.id)) st.thumbs.set(r.id, cropCanvas(canvas, r.box, 96).toDataURL("image/jpeg", 0.8));
    return st.thumbs.get(r.id);
  };
  const setOn = (r, on) => {
    r.on = on; st.dirty = true;
    st.order = st.order.filter((id) => id !== r.id);
    if (!on) return;
    // A thing from the photo joins after the last photo thing already in the order (so photo things come first); a related word joins the end.
    // The adult can still move anything with the arrows.
    let at = st.order.length;
    if (r.kind === "object") { at = 0; st.order.forEach((id, i) => { const o2 = rowById(id); if (o2 && o2.kind === "object") at = i + 1; }); }
    st.order.splice(at, 0, r.id);
  };

  // ----- layout
  const nameInput = h("input", { type: "text", class: "text-input", id: "scene-name", maxlength: 40, placeholder: "Kitchen, Park, Bath…", value: st.name });
  nameInput.addEventListener("input", () => { st.dirty = true; drawRelatedOnly(); });     // (renaming updates the place words at once)
  const note = h("p", { class: "muted", id: "scene-note", text: init.note || "" });
  const photoEl = h("div", { class: "se-photo", id: "scene-photo" });
  photoEl.style.aspectRatio = W + " / " + H;
  const img = h("img", { alt: "", draggable: "false" });
  img.src = photoUrl;
  const boxesEl = h("div", { class: "se-boxes" });
  photoEl.append(img, boxesEl);
  const drawBtn = h("button", { type: "button", class: "btn", id: "scene-draw", text: "Add a thing by hand: drag a box on the photo", onclick: () => {
    st.drawing = !st.drawing; paintDraw(); } });
  const hint = h("p", { class: "muted", id: "scene-draw-hint", hidden: true, text: "Drag a rectangle around the thing, then choose its word." });
  const objectsEl = h("div", { class: "se-list", id: "scene-objects" });
  const placeHead = h("h3", { id: "scene-place-head" });
  const placeNote = h("p", { class: "muted", id: "scene-place-note" });
  const placeEl = h("div", { class: "se-list", id: "scene-place" });
  const placeBox = h("div", { class: "qhide", id: "scene-place-box", hidden: true }, placeHead, placeNote, placeEl);
  const relatedEl = h("div", { class: "se-list", id: "scene-related" });
  const orderEl = h("div", { class: "se-list", id: "scene-order" });
  const msg = h("p", { class: "backup-status", id: "scene-msg", role: "status" });
  const photoToggle = h("input", { type: "checkbox", id: "scene-showphoto" });
  photoToggle.checked = st.showPhoto;
  photoToggle.addEventListener("change", () => { st.showPhoto = photoToggle.checked; st.dirty = true; });

  const nameBlock = h("div", { class: "qhide", id: "scene-name-block" },
    h("label", { class: "field-label", for: "scene-name", text: "Scene name" }), nameInput, note);
  const body = h("div", { class: "se-grid" + (st.quick ? " quick" : ""), id: "scene-grid" },
    h("div", { class: "se-left" }, photoEl, drawBtn, hint),
    h("div", { class: "se-right" },
      nameBlock,
      st.quick && init.note ? h("p", { class: "muted", id: "scene-quick-note", text: init.note }) : null,
      h("h3", { text: "Things in the photo" }),
      h("p", { class: "muted", id: "scene-things-help", text: st.quick ? "Everything found is ticked. Untick what you do not want, or draw a box around anything it missed."
        : "Tick the ones to keep. You can change a name: it is what the button says." }), objectsEl,
      placeBox,
      h("div", { class: "qhide" },
        h("h3", { text: "Related words" }), h("p", { class: "muted", text: "Words that go with these things. Tick any you want as buttons (they use the board’s pictures)." }), relatedEl,
        h("div", { class: "btn-row left" }, h("button", { type: "button", class: "btn", id: "scene-add-related", text: "Add another word…", onclick: async () => {
          const w = await pickWord("Add a related word");
          if (!w) return;
          addRelated(w, true); drawAll();
        } })),
        h("h3", { text: "Order on the strip" }), h("p", { class: "muted", text: "The strip always shows these left to right in this order. Keep it the same so the child can learn where each one is." }), orderEl,
        h("label", { class: "check-line", for: "scene-showphoto" }, photoToggle, h("span", { text: "Show a photo button on the strip (opens the photo; tapping a thing in it speaks)" }))),
      msg));
  const saveBtn = h("button", { type: "button", class: "btn primary", id: "scene-save", text: "Save scene" });
  const cancelBtn = h("button", { type: "button", class: "btn", id: "scene-cancel", text: "Cancel" });
  const useBtn = h("button", { type: "button", class: "btn primary big", id: "scene-use-now", text: "Use now" });
  const moreBtn = h("button", { type: "button", class: "btn", id: "scene-more-options", text: "More options" });
  const title = h("h2", { id: "scene-title" });
  const o = openOverlay([title, body,
    h("div", { class: "btn-row se-actions" }, cancelBtn, moreBtn, useBtn, saveBtn)], { sheetClass: "scene" + (st.quick ? " quick" : "") });
  // Compact (quick) mode shows only the photo, the things and Use now / More options; the full editor shows everything and Save scene.
  const paintMode = () => {
    body.classList.toggle("quick", st.quick);
    o.sheet.classList.toggle("quick", st.quick);
    title.textContent = st.quick ? "New scene from this photo" : scene ? "Edit scene" : "New scene";
    useBtn.hidden = moreBtn.hidden = !st.quick;
    saveBtn.hidden = st.quick;
    drawBtn.textContent = st.drawing ? "Done drawing" : st.quick ? "Add a thing by hand" : "Add a thing by hand: drag a box on the photo";
    const help = $q("scene-things-help");
    if (help) help.textContent = st.quick ? "Everything found is ticked. Untick what you do not want, or draw a box around anything it missed."
      : "Tick the ones to keep. You can change a name: it is what the button says.";
  };
  function $q(id) { return o.sheet.querySelector("#" + id); }

  const finish = () => { URL.revokeObjectURL(photoUrl); o.close(); };

  // ----- related words
  function addRelated(entry, on) {
    const k = entry.wordId || "t:" + entry.label.toLowerCase();
    let r = st.related.get(k);
    if (!r) { r = makeRow("related", entry, null, false); st.related.set(k, r); }
    if (on && !r.on) setOn(r, true);
    return r;
  }
  // Words for the place (Beta 3.1): the scene's name ("Park", "Bath time"...) and the things found in the photo ("oven", "toilet", "bed")
  // suggest the words of a place from data/scene-places.json. They are checkboxes, unchecked; a ticked one stays in the list even if the
  // name is changed later. Returns the rows (shared with the related words: one row per word).
  function placeRows() {
    const objKeys = new Set(st.objects.filter((r) => r.on).map(keyOf));
    const names = st.objects.flatMap((r) => [r.cocoClass, r.wordId, r.label]).filter(Boolean);
    const hit = placeWordsFor(nameInput.value, names);
    const out = new Map();
    for (const w of hit.words) {
      const info = wordInfo(w.wordId);
      if (!info || objKeys.has(info.id)) continue;
      let r = st.related.get(info.id);
      if (!r) { r = makeRow("related", { label: info.label, spoken: info.spoken, wordId: info.id }, null, false); st.related.set(info.id, r); }
      r.placeWhy = w.why;
      out.set(info.id, r);
    }
    for (const [k, r] of st.related) if (r.on && r.placeWhy && !out.has(k)) out.set(k, r);       // (stays once ticked)
    st.placeInfo = hit;
    return [...out.values()];
  }
  // Suggestions for the objects that are ticked, plus the generic ones. Rows stay in the list once they are ticked.
  function relatedRows() {
    const out = new Map();
    const placeKeys = new Set(placeRows().map(keyOf));
    const objKeys = new Set(st.objects.filter((r) => r.on).map(keyOf));
    const offer = (e, from) => {
      const k = e.wordId || "t:" + e.label.toLowerCase();
      if (objKeys.has(k) || placeKeys.has(k)) return;
      let r = st.related.get(k);
      if (!r) { r = makeRow("related", e, null, false); st.related.set(k, r); }
      r.from = r.from || [];
      if (!out.has(k)) { r.from = []; out.set(k, r); }
      if (!r.from.includes(from)) r.from.push(from);
    };
    for (const o2 of st.objects.filter((r) => r.on)) for (const e of relatedFor(o2)) offer(e, o2.label);
    for (const e of genericRelated()) offer(e, "any scene");
    for (const [k, r] of st.related) if (r.on && !out.has(k) && !placeKeys.has(k)) { r.from = r.from || []; out.set(k, r); }
    return [...out.values()];
  }

  // ----- drawing the pieces
  function drawBoxes() {
    boxesEl.replaceChildren();
    st.objects.forEach((r, i) => {
      const b = h("div", { class: "se-box" + (r.on ? " on" : ""), "data-row": r.id,
        onclick: () => { if (st.drawing) return; setOn(r, !r.on); drawAll(); } }, h("span", { class: "se-num", text: String(i + 1) }));
      Object.assign(b.style, { left: r.box.x * 100 + "%", top: r.box.y * 100 + "%", width: r.box.w * 100 + "%", height: r.box.h * 100 + "%" });
      boxesEl.append(b);
    });
  }
  function drawObjects() {
    objectsEl.replaceChildren(...(st.objects.length ? st.objects.map((r, i) => {
      const cb = h("input", { type: "checkbox", class: "se-check", "aria-label": "Keep " + r.label, checked: r.on, onchange: () => { setOn(r, cb.checked); drawAll(); } });
      const label = h("input", { type: "text", class: "text-input se-label", maxlength: 40, value: r.label, "aria-label": "Name of thing " + (i + 1) });
      label.addEventListener("input", () => {
        const text = label.value.trim();
        r.label = text; st.dirty = true;
        const w = text ? wordByLabel(text) : null;
        r.wordId = w ? w.id : null; r.spoken = w ? w.spoken : text;
        drawOrder(); drawBoxes();
      });
      label.addEventListener("change", () => { if (!label.value.trim()) { label.value = r.label = r.label || "thing"; } drawRelatedOnly(); });
      // "Remember this": teach VOICE this thing (My things). For a thing that is already remembered it reads "Teach again" (adds this photo to it).
      const rem = h("input", { type: "checkbox", class: "se-remember", "aria-label": (r.remembered ? "Teach again: " : "Remember ") + r.label, checked: !!r.remember,
        onchange: () => { r.remember = rem.checked; st.dirty = true; } });
      return h("div", { class: "se-row" + (r.on ? "" : " off") + (r.remembered ? " remembered" : ""), "data-row": r.id }, cb, h("span", { class: "se-num", text: String(i + 1) }),
        h("img", { class: "se-thumb", alt: "", src: thumb(r) }),
        h("div", { class: "se-labelcol" },
          r.remembered ? h("small", { class: "se-remembered", text: "Remembered: " + r.label }) : null,
          label),
        r.wordId && !r.remembered ? h("span", { class: "se-tag", title: "This word is on the board", text: "board word" }) : null,
        h("label", { class: "se-remlabel", title: "VOICE learns this thing from your photo, on this iPad only" }, rem,
          h("span", { text: r.remembered ? "Teach again" : "Remember this" })));
    }) : [h("p", { class: "muted", text: "Nothing yet. Use “Add a thing by hand”." })]));
  }
  function drawRelatedOnly() {
    const rows = relatedRows();
    drawPlace();
    relatedEl.replaceChildren(...rows.map((r) => {
      const cb = h("input", { type: "checkbox", class: "se-check", "aria-label": "Add " + r.label, checked: r.on, onchange: () => { setOn(r, cb.checked); drawOrder(); } });
      const wi = r.wordId ? wordInfo(r.wordId) : null;
      return h("label", { class: "se-row rel" + (r.on ? "" : " off"), "data-rel": r.label }, cb,
        wi && wi.image ? h("img", { class: "se-thumb sym", alt: "", src: wi.image }) : h("span", { class: "se-thumb txt", text: r.label.charAt(0).toUpperCase() }),
        h("span", { class: "se-rel-label", text: r.label }),
        h("small", { class: "muted", text: r.from.length ? "for " + r.from.join(", ") : "" }));
    }));
  }
  // The "Words for <name>" group.
  function drawPlace() {
    const rows = placeRows();
    const name = nameInput.value.trim();
    placeBox.hidden = !rows.length;
    if (!rows.length) { placeEl.replaceChildren(); return; }
    placeHead.textContent = "Words for " + (name || "this place");
    const pl = (st.placeInfo && st.placeInfo.places || []).map((p) => p.name);
    placeNote.textContent = "Words that go with " + (pl.length ? pl.join(" and ") : "this place") + ". Tick any you want as buttons; none are ticked for you.";
    placeEl.replaceChildren(...rows.map((r) => {
      const cb = h("input", { type: "checkbox", class: "se-check", "aria-label": "Add " + r.label, checked: r.on, onchange: () => { setOn(r, cb.checked); drawOrder(); } });
      const wi = r.wordId ? wordInfo(r.wordId) : null;
      return h("label", { class: "se-row rel place" + (r.on ? "" : " off"), "data-place": r.wordId || r.label }, cb,
        wi && wi.image ? h("img", { class: "se-thumb sym", alt: "", src: wi.image }) : h("span", { class: "se-thumb txt", text: r.label.charAt(0).toUpperCase() }),
        h("span", { class: "se-rel-label", text: r.label }));
    }));
  }
  function drawOrder() {
    const ids = st.order.filter((id) => rowById(id));
    orderEl.replaceChildren(...(ids.length ? ids.map((id, i) => {
      const r = rowById(id);
      const wi = r.wordId ? wordInfo(r.wordId) : null;
      const pic = r.kind === "object" ? h("img", { class: "se-thumb", alt: "", src: thumb(r) })
        : wi && wi.image ? h("img", { class: "se-thumb sym", alt: "", src: wi.image }) : h("span", { class: "se-thumb txt", text: r.label.charAt(0).toUpperCase() });
      const move = (d) => { const a = st.order.indexOf(id); [st.order[a], st.order[a + d]] = [st.order[a + d], st.order[a]]; st.dirty = true; drawOrder(); };
      return h("div", { class: "se-row ord", "data-row": id }, h("span", { class: "se-pos", text: String(i + 1) }), pic,
        h("span", { class: "se-rel-label", text: r.label }), h("small", { class: "muted", text: r.kind === "object" ? "photo" : "word" }),
        h("button", { type: "button", class: "btn se-mv se-up", "aria-label": "Move " + r.label + " earlier", text: "↑", disabled: i === 0, onclick: () => move(-1) }),
        h("button", { type: "button", class: "btn se-mv se-down", "aria-label": "Move " + r.label + " later", text: "↓", disabled: i === ids.length - 1, onclick: () => move(1) }));
    }) : [h("p", { class: "muted", text: "Nothing is ticked yet." })]));
  }
  function drawAll() { drawBoxes(); drawObjects(); drawRelatedOnly(); drawOrder(); }
  drawAll();

  // ----- drawing a box by hand
  function paintDraw() {
    drawBtn.classList.toggle("primary", st.drawing);
    drawBtn.textContent = st.drawing ? "Done drawing" : st.quick ? "Add a thing by hand" : "Add a thing by hand: drag a box on the photo";
    hint.hidden = !st.drawing;
    photoEl.classList.toggle("drawing", st.drawing);
  }
  attachBoxDrawing(photoEl, boxesEl, () => st.drawing, async (r) => {
    const w = await pickWord("What is this?");
    if (!w) return;
    const row = makeRow("object", { label: w.label, spoken: w.spoken || w.label, wordId: w.wordId || null }, r, true);
    row.remember = true;                                  // a thing the adult points out by hand starts with "Remember this" ON
    st.objects.push(row); setOn(row, true); st.dirty = true;
    drawAll();
  });

  // ----- save / cancel
  cancelBtn.addEventListener("click", async () => {
    if (st.dirty && !(await askConfirm("Leave without saving? Your changes to this scene will be lost.", "Leave"))) return;
    finish();
  });
  // The name a quick scene gets, e.g. "Scene Oct 29, 4:05 PM" (it can be renamed in Scenes).
  const quickName = () => "Scene " + new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  // Teach VOICE the things whose "Remember this" box is ticked (My things). Never stops the scene from being saved.
  async function rememberTicked() {
    const wanted = st.objects.filter((r) => r.on && r.remember);
    if (!wanted.length) return "";
    try {
      const det = await loadRecognizer();
      if (!det || !det.features) return "VOICE could not remember the things (recognition is not available).";
      await things.loadMean();
      const mine = await things.listThings(cur.id);
      let n = 0;
      for (const r of wanted) {
        const views = await things.fingerprintsFor(det, canvas, r.box);
        const same = (t) => (r.remembered && t.id === r.remembered.thingId) || (!r.remembered && ((r.wordId && t.wordId === r.wordId) || t.label.toLowerCase() === r.label.toLowerCase()));
        let t = mine.find(same);
        if (t) things.addViews(t, views);
        else {
          if (mine.length >= things.MAX_THINGS) return "VOICE is already remembering " + things.MAX_THINGS + " things. Delete one in Scenes > My things first.";
          t = { id: things.newThingId(), learnerId: cur.id, label: r.label, spoken: r.spoken || r.label, wordId: r.wordId || null, created: Date.now(), photos: 1,
            picture: await canvasBlob(cropCanvas(canvas, r.box), 0.85), views };
          mine.push(t);
        }
        await things.putThing(t);
        n++;
      }
      return "";
    } catch (e) {
      console.warn("Could not remember the things:", e);
      return "The scene was saved, but VOICE could not remember the things (" + (e && e.message ? e.message : "unknown problem") + ").";
    }
  }
  // Save the scene. `quickSave`: the "Use now" button (auto name, ends by showing the scene on the strip, nothing else changes).
  async function save(quickSave) {
    const btn = quickSave ? useBtn : saveBtn;
    const ids = st.order.filter((id) => rowById(id));
    if (!ids.length) { msg.textContent = "Tick at least one thing or word first."; return; }
    btn.disabled = true;
    try {
      const items = [];
      for (const id of ids) {
        const r = rowById(id);
        const w = r.wordId ? wordInfo(r.wordId) : null;
        const it = { id: r.id, kind: r.kind, label: r.label, spoken: w && r.label.toLowerCase() === w.label.toLowerCase() ? w.spoken : (r.spoken || r.label), wordId: r.wordId || null };
        if (r.kind === "object") {
          it.box = r.box;
          it.crop = r.crop || await canvasBlob(cropCanvas(canvas, r.box), 0.85);
        }
        items.push(it);
      }
      const all = await store.listScenes(cur.id);
      if (!scene && all.length >= store.MAX_SCENES) { msg.textContent = "There are too many scenes. Delete one first."; btn.disabled = false; return; }
      const typed = nameInput.value.trim();
      const rec = {
        id: scene ? scene.id : store.newSceneId(), learnerId: cur.id,
        name: typed || (init.quick ? quickName() : `Scene ${all.length + 1}`),
        order: scene ? scene.order : all.length, created: scene ? scene.created : Date.now(), showPhoto: st.showPhoto,
        photo: photoBlob, photoW: W, photoH: H, items,
      };
      await store.putScene(rec);
      const problem = await rememberTicked();
      finish();
      await strip.load();
      if (!scene) await strip.setActive(rec.id);        // a new scene starts showing on the strip right away
      await init.onDone();
      if (problem) await notice(problem);
    } catch (e) {
      console.warn("Could not save the scene:", e);
      msg.textContent = "The scene could not be saved: " + (e && e.message ? e.message : "unknown problem");
      btn.disabled = false;
    }
  }
  saveBtn.addEventListener("click", () => save(false));
  useBtn.addEventListener("click", () => save(true));
  moreBtn.addEventListener("click", () => { st.quick = false; paintMode(); drawAll(); });
  paintMode();
  drawAll();
}

// A message with one OK button.
function notice(text) {
  return new Promise((resolve) => {
    const o = openOverlay([h("p", { class: "confirm-text", id: "scene-notice", text }),
      h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn primary", id: "scene-notice-ok", text: "OK", onclick: () => { o.close(); resolve(); } }))], { sheetClass: "small" });
  });
}

// ---------------------------------------------------------------- choosing a word
// Search every word on the board, or type a new one. Resolves to { label, spoken, wordId | null } or null if cancelled.
function pickWord(title) {
  return new Promise((resolve) => {
    const done = (v) => { o.close(); resolve(v); };
    const input = h("input", { type: "text", class: "text-input", id: "word-search", maxlength: 40, placeholder: "Search the board’s words, or type a new one" });
    const results = h("div", { class: "wp-results", id: "word-results" });
    const typed = h("button", { type: "button", class: "btn primary", id: "word-typed", hidden: true });
    const paint = () => {
      const q = input.value.trim();
      const list = searchWords(q);
      results.replaceChildren(...list.map((w) => {
        const b = h("button", { type: "button", class: "wp-item", "data-word": w.id, onclick: () => done({ label: w.label, spoken: w.spoken, wordId: w.id }) },
          w.image ? h("img", { alt: "", src: w.image }) : h("span", { class: "wp-none" }), h("span", { text: w.label }));
        return b;
      }));
      if (q && !list.length) results.append(h("p", { class: "muted", text: "No board word matches. You can use what you typed as a new word." }));
      typed.hidden = !q;
      typed.textContent = `Use “${q}” as a new word`;
    };
    input.addEventListener("input", paint);
    typed.addEventListener("click", () => {
      const q = input.value.trim();
      if (!q) return;
      const w = wordByLabel(q);
      done(w ? { label: w.label, spoken: w.spoken, wordId: w.id } : { label: q, spoken: q, wordId: null });
    });
    const o = openOverlay([h("h2", { text: title }), input, results,
      h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn", id: "word-cancel", text: "Cancel", onclick: () => done(null) }), typed)],
      { sheetClass: "editor" });
    setTimeout(() => input.focus(), 50);
  });
}
