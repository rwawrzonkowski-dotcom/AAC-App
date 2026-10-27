// Small helpers for the adult-facing screens (overlays, prompts).
// The child's board does not use these.

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
