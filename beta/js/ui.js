// Small helpers for the adult-facing screens (overlays, prompts).
// The child's board does not use these.

// The app's name is written V.O.I.C.E. (Nov 17). Screen readers would spell it letter by letter, so wherever it appears
// on screen it is wrapped in <span role="text" aria-label="VOICE">, which VoiceOver reads as the word "voice", and in
// aria labels it is written VOICE. watchName() (called once from app.js) does this for every page change, so code
// can simply write "V.O.I.C.E." in its text.
const NAME = "V.O.I.C.E.";
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "TITLE", "OPTION"]);
function wrapText(node) {
  const p = node.parentNode;
  if (!p || p.nodeType !== 1 || p.classList.contains("app-name") || SKIP.has(p.nodeName) || !node.nodeValue.includes(NAME)) return;
  const frag = document.createDocumentFragment();
  node.nodeValue.split(NAME).forEach((part, i) => {
    if (i) frag.append(h("span", { class: "app-name", role: "text", "aria-label": "VOICE" }, NAME));
    if (part) frag.append(part);
  });
  p.replaceChild(frag, node);
}
function wrapIn(root) {
  if (root.nodeType === 3) { wrapText(root); return; }
  if (root.nodeType !== 1 || !root.textContent.includes(NAME)) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found = []; for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue.includes(NAME)) found.push(n);
  found.forEach(wrapText);
}
function fixAria(el) {
  if (el.nodeType !== 1) return;
  for (const a of ["aria-label", "title"]) { const v = el.getAttribute(a); if (v && v.includes(NAME)) el.setAttribute(a, v.split(NAME).join("VOICE")); }
}
export function watchName() {
  wrapIn(document.body);
  document.querySelectorAll("[aria-label],[title]").forEach(fixAria);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") wrapText(m.target);
      else if (m.type === "attributes") fixAria(m.target);
      else m.addedNodes.forEach((n) => { wrapIn(n); if (n.nodeType === 1) { fixAria(n); n.querySelectorAll("[aria-label],[title]").forEach(fixAria); } });
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["aria-label", "title"] });
}

// h("div", {class: "x", onclick: fn}, child1, "text", ...) -> an element.
export function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "value") value = v; // set last, after min/max/step exist
    else if (k === "checked" || k === "disabled" || k === "selected") e[k] = !!v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  if (value !== undefined) e.value = value;
  return e;
}

// The phone's unusable edge strips in pixels, { x, t, b }: x is the same on both sides (the larger of the
// left and right insets), t = top (camera cutout), b = bottom (home bar). All 0 on iPads and computers.
// Read from the CSS variables in styles.css (one place decides them, including the test hook).
export function safeInsets() {
  const probe = h("div", { "aria-hidden": "true" });
  probe.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
    "padding:var(--safe-t) var(--safe-x) var(--safe-b) var(--safe-x)";
  document.body.append(probe);
  const cs = getComputedStyle(probe);
  const px = (v) => parseFloat(v) || 0;
  const out = { x: px(cs.paddingLeft), t: px(cs.paddingTop), b: px(cs.paddingBottom) };
  probe.remove();
  return out;
}

// Show `content` on a dimmed full-screen layer. Returns {close, sheet}.
// Layers stack: a later overlay appears on top of an earlier one.
export function openOverlay(content, { sheetClass = "" } = {}) {
  const sheet = h("div", { class: "sheet adult " + sheetClass, role: "dialog" }, content);
  const layer = h("div", { class: "overlay" }, sheet);
  document.body.appendChild(layer);
  return { sheet, close: () => layer.remove() };
}

// Ask for a line of text. Resolves to the text, or null if cancelled.
export function askText(title, initial = "", okLabel = "Save") {
  return new Promise((resolve) => {
    const input = h("input", { type: "text", class: "text-input", maxlength: 40, value: initial });
    const done = (v) => { o.close(); resolve(v); };
    const ok = () => { const t = input.value.trim(); if (t) done(t); };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") ok(); });
    const o = openOverlay([
      h("h2", { text: title }),
      input,
      h("div", { class: "btn-row" },
        h("button", { class: "btn", type: "button", text: "Cancel", onclick: () => done(null) }),
        h("button", { class: "btn primary", type: "button", text: okLabel, onclick: ok })),
    ], { sheetClass: "small" });
    setTimeout(() => input.focus(), 50);
  });
}

// Yes/no question. Resolves to true or false.
export function askConfirm(message, okLabel = "OK") {
  return new Promise((resolve) => {
    const done = (v) => { o.close(); resolve(v); };
    const o = openOverlay([
      h("p", { class: "confirm-text", text: message }),
      h("div", { class: "btn-row" },
        h("button", { class: "btn", type: "button", text: "Cancel", onclick: () => done(false) }),
        h("button", { class: "btn danger", type: "button", text: okLabel, onclick: () => done(true) })),
    ], { sheetClass: "small" });
  });
}

// A short note at the bottom of the screen for adults (no sound; it ignores touches and goes away by itself).
// Used by the camera button and the adult-menu circle. Uses the .cam-toast look in styles.css.
let toastTimer = null;
export function toast(text, ms = 2600) {
  document.querySelectorAll(".cam-toast").forEach((t) => t.remove());
  const t = h("div", { class: "cam-toast", role: "status", text });
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
}
