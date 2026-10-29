// Scenes on the child's screen (Phase 3, beta 3.0): the buttons in the context strip, and the full-screen tappable scene photo.
//
// THE STRIP. While a scene is active its buttons stand in the (otherwise empty) context strip under the message bar, left to right in
// the order the adult saved. Nothing on the board moves or changes size: the strip is its own row. Each button is a fixed size, so as
// many as fit are shown (about 10 to 12 on an iPad); with more, a small arrow at the right end shows the next set, in the same
// order. An "object" button shows the cropped photo of that thing; a "related" button shows the board's own symbol for the word.
// A tap only speaks (the same speech rules as the board: js/app.js does the speaking, adding the chip and the recording). If the word
// is on the board, its permanent spot glows gently for a moment; nothing is opened and nothing is navigated.
//
// ADULT CONTROLS on the strip use a 1-second hold with a filling ring (like the teaching session controls), so a child cannot reach
// them by accident: the scene name at the left opens the scene switcher; the photo button at the right end (only when the scene has
// "Show photo button" on) opens the scene photo.
//
// THE SCENE PHOTO. A full-screen layer over the board (the board underneath is not touched) with invisible hotspots over each approved
// object. A touch outlines the hotspot softly; a tap speaks it. Related words are not hotspots. A large Close button returns.
import { h, openOverlay } from "./ui.js";
import { attachHold } from "./hold.js";
import { attachPressHandling, fitLabels } from "./board.js";
import { getCurrent, saveProfile } from "./profiles.js";
import { listScenes } from "./scenedata.js";
import { wordInfo, spotFor } from "./scenewords.js";

const HOLD_MS = 1000;
const GAP = 5;                 // px between strip buttons
const GLOW_MS = 2600;

let hooks = null;              // set by init(): what this file needs from app.js
let scenes = [];               // the current learner's scenes (with their photo blobs), in order
let activeId = null;
let page = 0;                  // which set of buttons the strip shows
let urls = [];                 // object URLs made for the strip; released when it is rebuilt
let bar = null, itemsEl = null, layoutKey = "";
let glowEl = null, glowTimer = null;

// hooks: { appEl, stripEl, onTap(item, { how, sceneId, el }), holdMs(), blocked(), getPageId(), wordsButtonShown(), onActiveChanged() }
export function init(h2) {
  hooks = h2;
  bar = h("div", { id: "scene-bar" });
  itemsEl = h("div", { class: "sc-items" });
  hooks.stripEl.appendChild(bar);
  // One handler for all strip buttons (they are rebuilt often). Touch supports (hold to select, ignore repeats) apply as on the board.
  attachPressHandling(bar, (el) => {
    const sc = getActive();
    const item = sc && sc.items.find((i) => i.id === el.dataset.id);
    if (item) { hooks.onTap(item, { how: "scene", sceneId: sc.id, el }); glowFor(item); }
  }, ".sc-item", { holdMs: hooks.holdMs, blocked: hooks.blocked });
  window.addEventListener("resize", () => { clearTimeout(init.t); init.t = setTimeout(render, 150); });
}

export const getScenes = () => scenes;
export const getActive = () => scenes.find((s) => s.id === activeId) || null;

// Read this learner's scenes (at start, on a learner change, after the adult edits scenes).
export async function load() {
  const p = getCurrent();
  scenes = await listScenes(p.id);
  activeId = scenes.some((s) => s.id === p.activeScene) ? p.activeScene : null;
  page = 0;
  closePhotoScene();
  render();
  if (hooks.onActiveChanged) hooks.onActiveChanged();
}

// Make a scene the one on the strip (or null: "Clear scene"). Saved with the learner, so it is the same after a restart.
export async function setActive(id) {
  const p = getCurrent();
  activeId = scenes.some((s) => s.id === id) ? id : null;
  p.activeScene = activeId;
  await saveProfile(p);
  page = 0;
  closePhotoScene();
  render();
  if (hooks.onActiveChanged) hooks.onActiveChanged();
}

// app.js calls this on every board redraw: show the strip only on the child's board (not while the adult edits or chooses targets).
export function onRender(visible) {
  hooks.appEl.classList.toggle("scene-on", !!getActive() && visible);
  if (getActive() && visible) layout();
}

// ---------------------------------------------------------------- the strip
function release() { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; }
const url = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };

const RING = '<svg class="hold-ring" viewBox="0 0 40 40" aria-hidden="true"><circle class="ring-bg" cx="20" cy="20" r="16"/>' +
  '<circle class="ring-fg" cx="20" cy="20" r="16" pathLength="100"/></svg>';
const PHOTO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>' +
  '<circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="M4 18l5-5 3 3 3-4 5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

function holdButton(cls, onDone, ...kids) {
  const b = h("button", { type: "button", class: "sb-btn " + cls }, h("span", { class: "sb-ring" }), ...kids);
  b.firstChild.innerHTML = RING;
  attachHold(b, HOLD_MS, onDone);
  return b;
}

// Sizes come from the strip's height, so a button is about square at any screen size.
function metrics() {
  const barH = bar.clientHeight, barW = bar.clientWidth;
  const itemW = Math.max(48, Math.min(120, Math.round(barH * 1.0)));
  return { barH, barW, itemW, switchW: Math.round(itemW * 1.45), moreW: Math.round(itemW * 0.62), photoW: Math.round(itemW * 0.85) };
}

// Called on every board redraw: only rebuilds the strip when its size changed or it is empty (so a page change costs nothing).
function layout() {
  const key = activeId + "|" + bar.clientWidth + "x" + bar.clientHeight;
  if (key !== layoutKey || !bar.firstChild) render();
}

function render() {
  release();
  const sc = getActive();
  bar.replaceChildren();
  layoutKey = "";
  if (!sc) return;
  const m = metrics();
  if (m.barW < 100) return;              // the strip is not showing (a teaching session, or Edit mode)
  layoutKey = activeId + "|" + m.barW + "x" + m.barH;
  const withPhoto = !!sc.showPhoto && !!sc.photo;
  let avail = m.barW - m.switchW - GAP - (withPhoto ? m.photoW + GAP : 0);
  const n = sc.items.length;
  let perPage = Math.max(1, Math.floor((avail + GAP) / (m.itemW + GAP)));
  const paged = n > perPage;
  if (paged) { avail -= m.moreW + GAP; perPage = Math.max(1, Math.floor((avail + GAP) / (m.itemW + GAP))); }
  const pages = Math.max(1, Math.ceil(n / perPage));
  page = Math.min(page, pages - 1);

  const sw = holdButton("sc-switch", openSwitcher, h("span", { class: "sc-name", text: sc.name }));
  sw.style.width = m.switchW + "px";
  sw.setAttribute("aria-label", "Scene: " + sc.name + " (hold to change)");
  itemsEl = h("div", { class: "sc-items" });
  for (const it of sc.items.slice(page * perPage, page * perPage + perPage)) itemsEl.append(itemButton(it, m.itemW));
  bar.append(sw, itemsEl);
  if (paged) {
    const more = h("button", { type: "button", class: "sc-more", "aria-label": "More buttons", id: "scene-more",
      onclick: () => { page = (page + 1) % pages; render(); } },
      h("span", { class: "sc-arrow", text: "›" }), h("small", { text: (page + 1) + "/" + pages }));
    more.style.width = m.moreW + "px";
    bar.append(more);
  }
  if (withPhoto) {
    const ph = h("button", { type: "button", class: "sb-btn sc-photo", id: "scene-photo-btn", "aria-label": "Open the scene photo" },
      h("span", { class: "sb-ring" }), h("span", { class: "sc-photo-icon" }));
    ph.firstChild.innerHTML = RING;
    ph.querySelector(".sc-photo-icon").innerHTML = PHOTO_ICON;
    ph.style.width = m.photoW + "px";
    attachHold(ph, 400, openPhotoScene);        // a short hold (0.4 s): a child can open it, an accidental brush does not
    bar.append(ph);
  }
  fitLabels(itemsEl);
}

// One strip button. It reuses the board's button look (classes cell / cell-image / cell-label) so pictures and labels fit the same way.
function itemButton(it, w) {
  const el = h("div", { class: "cell tap sc-item " + (it.kind === "object" ? "sc-object" : "sc-related"), role: "button",
    "aria-label": it.label, "data-id": it.id });
  el.style.width = w + "px";
  const img = h("div", { class: "cell-image" });
  let src = null, cls = "symbol";
  if (it.kind === "object" && it.crop) { src = url(it.crop); cls = "photo"; }
  else if (it.wordId) { const wi = wordInfo(it.wordId); if (wi && wi.image) { src = wi.image; cls = wi.isPhoto ? "photo" : "symbol"; } }
  if (src) {
    const im = h("img", { class: cls, alt: "", draggable: "false" });
    im.src = src;
    img.append(im);
  } else el.classList.add("text-only");       // no picture: the word is drawn large across the button (as on the board)
  el.append(img, h("div", { class: "cell-label" }, h("span", { class: "lbl", text: it.label })));
  return el;
}

// ---------------------------------------------------------------- glow on the board
// The word's permanent spot glows gently for a moment. Nothing is opened. (Does nothing when the spot is not on the screen.)
export function glowFor(item) {
  clearGlow();
  if (!item.wordId) return;
  const key = spotFor(item.wordId, hooks.getPageId(), { wordsButtonShown: hooks.wordsButtonShown() });
  if (!key) return;
  const el = key === "words-btn" ? document.getElementById("words-btn") : document.querySelector(`#board .cell[data-key="${key}"]`);
  if (!el) return;
  el.classList.add("scene-glow");
  glowEl = el;
  glowTimer = setTimeout(clearGlow, GLOW_MS);
}
export function clearGlow() {
  clearTimeout(glowTimer);
  if (glowEl) glowEl.classList.remove("scene-glow");
  glowEl = null;
}

// ---------------------------------------------------------------- scene switcher (hold the scene name)
function openSwitcher() {
  const o = openOverlay([
    h("h2", { text: "Choose a scene" }),
    h("div", { class: "pick-list" }, scenes.map((s) =>
      h("button", { type: "button", class: "seg pick-item" + (s.id === activeId ? " on" : ""), "data-scene": s.id, text: s.name,
        onclick: async () => { o.close(); await setActive(s.id); } }))),
    h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn", id: "switch-clear", text: "Clear scene (hide the buttons)", onclick: async () => { o.close(); await setActive(null); } }),
      h("button", { type: "button", class: "btn", text: "Cancel", onclick: () => o.close() })),
  ], { sheetClass: "small" });
}

// ---------------------------------------------------------------- the tappable scene photo
let ps = null;      // the open scene photo: { layer, url, close }
export const photoSceneOpen = () => !!ps;

export function openPhotoScene() {
  const sc = getActive();
  if (ps || !sc || !sc.photo) return;
  const photoUrl = URL.createObjectURL(sc.photo);
  const W = sc.photoW || 1280, H = sc.photoH || 960;
  const wrap = h("div", { class: "ps-wrap" });
  const img = h("img", { class: "ps-img", alt: "", draggable: "false" });
  img.src = photoUrl;
  wrap.append(img);
  for (const it of sc.items) {
    if (it.kind !== "object" || !it.box) continue;           // related words are not hotspots
    const b = it.box;
    const spot = h("div", { class: "ps-spot", role: "button", "aria-label": it.label, "data-id": it.id });
    Object.assign(spot.style, { left: b.x * 100 + "%", top: b.y * 100 + "%", width: b.w * 100 + "%", height: b.h * 100 + "%" });
    wrap.append(spot);
  }
  const said = h("div", { class: "ps-said", id: "ps-said" });
  const stage = h("div", { class: "ps-stage" }, wrap);
  const layer = h("div", { id: "photo-scene", class: "photo-scene", role: "dialog", "aria-label": sc.name },
    h("div", { class: "ps-top" }, h("div", { class: "ps-title", text: sc.name }), said,
      h("button", { type: "button", class: "ps-close", id: "ps-close", text: "Close", onclick: () => closePhotoScene() })),
    stage);
  document.body.appendChild(layer);
  // Fit the picture inside the stage, keeping its shape.
  const fit = () => {
    const cs = getComputedStyle(stage);
    const aw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ah = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const k = Math.min(aw / W, ah / H);
    wrap.style.width = Math.floor(W * k) + "px";
    wrap.style.height = Math.floor(H * k) + "px";
  };
  fit();
  const onResize = () => fit();
  window.addEventListener("resize", onResize);
  // A tap on a hotspot speaks it (same rules as the strip; touch supports apply).
  attachPressHandling(layer, (el) => {
    const item = sc.items.find((i) => i.id === el.dataset.id);
    if (!item) return;
    hooks.onTap(item, { how: "photo scene", sceneId: sc.id, el });
    said.textContent = item.label;
    el.classList.remove("ps-flash"); void el.offsetWidth; el.classList.add("ps-flash");
  }, ".ps-spot", { holdMs: hooks.holdMs, blocked: hooks.blocked });
  ps = { layer, close() {
    window.removeEventListener("resize", onResize);
    URL.revokeObjectURL(photoUrl);
    layer.remove();
    ps = null;
  } };
}

export function closePhotoScene() { if (ps) ps.close(); }
