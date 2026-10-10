// Draws the core grid (9 x 5 = 45 cells, or 12 x 7 = 84) and handles presses.
//
// MOTOR PLANNING RULE: every word has a permanent (row, col). This file never
// sorts, filters-out, or reflows buttons. Words not yet revealed are drawn as
// blank gray tiles that still occupy their cell, so visible words never move.

// Every button now has an open-licensed symbol (the "image" field in
// data/core-board.json, credited in CREDITS.md). These emoji are only an
// internal FALLBACK, used if a symbol file ever fails to load. An adult's own
// photo (edit mode) always wins over the built-in symbol.
const PLACEHOLDERS = {
  i: "\u{1F9D1}", you: "\u{1FAF5}", it: "\u{1F4E6}", that: "\u{1F449}", what: "❓",
  where: "\u{1F4CD}", who: "\u{1F9D1}‍\u{1F91D}‍\u{1F9D1}", when: "\u{1F552}", why: "\u{1F914}",
  want: "\u{1F932}", like: "\u{1F44D}", get: "\u{1F91A}", go: "\u{1F6B6}", stop: "✋",
  help: "\u{1F198}", more: "➕", all: "\u{1F30D}", some: "\u{1F370}",
  do: "\u{1F6E0}️", make: "\u{1F9F1}", put: "\u{1F4E5}", turn: "\u{1F504}", look: "\u{1F440}",
  open: "\u{1F4D6}", eat: "\u{1F37D}️", drink: "\u{1F964}", bathroom: "\u{1F6BB}",
  can: "\u{1F4AA}", not: "\u{1F6AB}", finished: "✅", good: "\u{1F600}", different: "\u{1F500}",
  same: "\u{1F7F0}", up: "⬆️", in: "\u{1F4E5}", on: "\u{1F51B}",
  yes: "\u{1F44D}", no: "\u{1F44E}", here: "\u{1F4CC}",
  play: "\u{1F9E9}", people: "\u{1F46A}", favorites: "⭐", food: "\u{1F34E}",
  drinks: "\u{1F9C3}", places: "\u{1F3E0}",
  // category page items
  cracker: "\u{1F358}", apple: "\u{1F34E}", banana: "\u{1F34C}", chips: "\u{1F35F}",
  cheese: "\u{1F9C0}", sandwich: "\u{1F96A}", pizza: "\u{1F355}", cookie: "\u{1F36A}",
  water: "\u{1F4A7}", juice: "\u{1F9C3}", milk: "\u{1F95B}",
  ball: "⚽", bubbles: "\u{1FAE7}", blocks: "\u{1F9F1}", swing: "\u{1F3A0}",
  slide: "\u{1F6DD}", tablet: "\u{1F4F1}", music: "\u{1F3B5}", book: "\u{1F4D6}",
  outside: "\u{1F333}", home: "\u{1F3E0}", school: "\u{1F3EB}", car: "\u{1F697}",
  park: "\u{1F3DE}️", bed: "\u{1F6CF}️",
  mom: "\u{1F469}", dad: "\u{1F468}", teacher: "\u{1F9D1}‍\u{1F3EB}",
  friend: "\u{1F9D2}", he: "\u{1F466}", she: "\u{1F467}",
};

// Draw one page's cells (45 or 84 of them). Cells are placed by CSS grid
// row/column, so changing what is inside a cell can never change its size or
// position.
//   cells    = the descriptions from resolvePage() (js/boardmodel.js)
//   editing  = true shows hidden words (faded, dashed) and empty cells too.
//   photoUrl = function(photoKey) -> picture URL or null
//   backImage = symbol file for the Back button
//   cols, rows, size = the grid (9x5 = 45, 12x7 = 84)
// The picture always goes inside the same fixed-size ".cell-image" box, so a
// symbol, a photo or the emoji fallback can never change a cell's layout.
export function renderBoard(boardEl, cells, { editing, photoUrl, backImage, cols, rows, size }) {
  boardEl.innerHTML = "";
  boardEl.dataset.size = String(size);
  boardEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  boardEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  for (const d of cells) {
    const cell = document.createElement("div");
    cell.dataset.key = d.key;
    cell.style.gridRow = String(d.row + 1);
    cell.style.gridColumn = String(d.col + 1);
    // The word is named on the cell so a test (or a curious adult) can see which word sits where.
    if (d.wordId) cell.dataset.word = d.wordId;

    if (d.kind === "home") {
      cell.className = "cell tap type-home";
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label", "Back");
      cell.innerHTML = '<div class="cell-image"></div><div class="cell-label"><span class="lbl">Back</span></div>';
      showSymbol(cell.querySelector(".cell-image"), backImage, "\u2B05\uFE0F");
    } else if (d.kind === "word" && (d.visible || editing)) {
      cell.className = "cell tap type-" + d.wordType + (d.visible ? "" : " ghost");
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label", d.label);
      cell.innerHTML = '<div class="cell-image"><span class="placeholder"></span></div>' +
        '<div class="cell-label"><span class="lbl"></span></div>';
      const url = photoUrl(d.photoKey);
      const area = cell.querySelector(".cell-image");
      const letter = PLACEHOLDERS[d.base ? d.base.id : ""] || d.label.charAt(0).toUpperCase();
      if (url) {
        // The adult's own photo overrides the built-in symbol.
        const img = document.createElement("img");
        img.className = "photo";
        img.alt = "";
        img.src = url;
        area.replaceChildren(img);
      } else if (d.base && d.base.image) {
        showSymbol(area, d.base.image, letter);
      } else {
        area.querySelector(".placeholder").textContent = letter;   // adult-added word, no picture yet
      }
      cell.querySelector(".lbl").textContent = d.label;
    } else if (editing) {
      cell.className = "cell tap ghost empty-slot";   // empty cell, editable
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label", "Empty button");
      cell.innerHTML = '<div class="plus">+</div>';
    } else {
      cell.className = "cell hidden";                 // blank, gray, inert
      cell.setAttribute("aria-hidden", "true");
    }
    boardEl.appendChild(cell);
  }
  fitLabels(boardEl);
}

// Make every label fit inside its button, whatever the screen size or grid.
// A label with a space may wrap onto two lines; otherwise (or after that) the
// letters shrink a little at a time. As a last resort a very long single word
// is broken across two lines. Only the TEXT changes size: the button and its
// picture area never move or resize.
export function fitLabels(boardEl) {
  for (const label of boardEl.querySelectorAll(".cell-label")) {
    const span = label.firstElementChild;
    if (!span) continue;
    span.style.fontSize = "";
    span.classList.remove("two-lines", "break-word");
    const overflows = () => span.scrollWidth > span.clientWidth + 0.5 || span.scrollHeight > label.clientHeight + 0.5;
    if (!overflows()) continue;
    const spaced = /\s/.test(span.textContent);
    if (spaced) {
      span.classList.add("two-lines");
      if (!overflows()) continue;
    }
    const base = parseFloat(getComputedStyle(span).fontSize);
    let px = base;
    // A single long word may shrink to 70% of its size; after that it may break in two.
    const floor = spaced ? 7 : base * 0.7;
    while (px > floor && overflows()) { px -= 0.5; span.style.fontSize = px + "px"; }
    if (!spaced && overflows()) {
      span.classList.add("two-lines", "break-word");
      while (px > 7 && overflows()) { px -= 0.5; span.style.fontSize = px + "px"; }
    }
  }
}

let fitTimer = null;
// Re-fit the labels when the window changes size (e.g. the iPad is rotated).
export function fitLabelsOnResize(boardEl) {
  window.addEventListener("resize", () => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => fitLabels(boardEl), 120);
  });
}

// Put a built-in symbol in an image area. If the file cannot be loaded, show the
// emoji fallback instead (same box, so nothing moves).
function showSymbol(area, src, fallbackEmoji) {
  const img = document.createElement("img");
  img.className = "symbol";
  img.alt = "";
  img.draggable = false;
  img.addEventListener("error", () => {
    const span = document.createElement("span");
    span.className = "placeholder";
    span.textContent = fallbackEmoji;
    area.replaceChildren(span);
  });
  img.src = src;
  area.replaceChildren(img);
}

// Pointer handling shared by the grid: darken on press, fire on pointerup only
// if the finger is still on the same button it started on (slide-off = ignored).
//
// Optional touch supports (used only for the child's board, see app.js):
//   options.holdMs()  -> milliseconds a finger must stay down before the button
//                        fires (0 = off). A ring fills while holding. Lifting
//                        early or sliding off cancels, with no speech.
//   options.blocked() -> true while taps must be ignored (the "ignore repeated
//                        taps" window). Nothing is shown and nothing happens.
export function attachPressHandling(container, onActivate, selector = ".cell.tap", options = {}) {
  let down = null;       // the button the finger is on
  let holdTimer = null;  // running only while a hold is in progress
  let holdOverlay = null;

  const clear = () => {
    if (down) down.classList.remove("pressed");
    down = null;
    clearTimeout(holdTimer);
    holdTimer = null;
    if (holdOverlay) { holdOverlay.remove(); holdOverlay = null; }
  };

  // The filling ring is an absolutely positioned layer inside the button, so
  // it cannot change the button's size or the image area.
  function startHold(el, ms) {
    holdOverlay = document.createElement("div");
    holdOverlay.className = "touch-hold";
    holdOverlay.style.setProperty("--hold-ms", ms + "ms");
    holdOverlay.innerHTML =
      '<svg viewBox="0 0 40 40" aria-hidden="true"><circle class="th-bg" cx="20" cy="20" r="16"/>' +
      '<circle class="th-fg" cx="20" cy="20" r="16" pathLength="100"/></svg>';
    el.appendChild(holdOverlay);
    holdTimer = setTimeout(() => {
      const start = down;
      clear();
      if (start) onActivate(start);   // held long enough: select it now
    }, ms);
  }

  container.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(selector);
    if (!el) return;
    if (options.blocked && options.blocked()) return;   // ignore-repeats window: show nothing
    clear();
    down = el;
    el.classList.add("pressed");
    const ms = options.holdMs ? options.holdMs() : 0;
    if (ms > 0) startHold(el, ms);
  });
  container.addEventListener("pointerup", (e) => {
    if (!down) return;
    const start = down;
    const wasHolding = holdTimer !== null;
    clear();
    if (wasHolding) return;           // released before the hold time: cancel, no speech
    // Touch pointers are captured to the start element, so check what is under the finger.
    const under = document.elementFromPoint(e.clientX, e.clientY);
    if (under && under.closest(selector) === start &&
        !(options.blocked && options.blocked())) onActivate(start);
  });
  container.addEventListener("pointercancel", clear);
  container.addEventListener("pointerleave", clear);
  // Moving off the button visually un-presses it (and the tap is ignored).
  container.addEventListener("pointermove", (e) => {
    if (!down) return;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const on = !!under && under.closest(selector) === down;
    if (!on && holdTimer !== null) { clear(); return; }   // slid off during a hold: cancel
    down.classList.toggle("pressed", on);
  });
}
