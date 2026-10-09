// Builds the 9 x 5 core grid from data/core-board.json.
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

export const ROWS = 5;
export const COLS = 9;

// Every cell has a permanent key: "<page>:<row>,<col>".
export const cellKey = (pageId, row, col) => `${pageId}:${row},${col}`;

// Work out what is in each of the 45 cells of one page, for one learner.
//   page    = { id, buttons: [...], homeAt: {row, col} | null }
//   profile = the learner (stage + the adult's changes)
// Returns 45 descriptions in row-by-row order. Nothing is ever moved: a cell is
// always at its own (row, col), whether it is visible, hidden, or empty.
export function resolvePage(page, profile) {
  const byPos = new Map(page.buttons.map((b) => [b.row + "," + b.col, b]));
  const cells = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const key = cellKey(page.id, row, col);
      const ov = profile.cells[key] || {};          // the adult's changes, if any
      const base = byPos.get(row + "," + col) || null;
      const d = { key, row, col, base, ov };

      if (page.homeAt && page.homeAt.row === row && page.homeAt.col === col) {
        d.kind = "home";                             // Back button: not editable
        d.visible = true;
      } else if (base) {
        d.kind = "word";
        d.label = ov.label ?? base.label;
        d.spoken = ov.spoken ?? base.spokenText ?? d.label;
        d.wordType = base.wordType;
        d.loadBoard = base.loadBoard || null;        // set for category buttons
        // Main board: stage rule. Category pages: always visible (the page can
        // only be opened when its category button is visible).
        d.defaultVisible = page.id === "core" ? base.stage <= profile.stage : true;
        d.visible = ov.show ?? d.defaultVisible;     // adult override wins
      } else if (ov.custom && ov.label) {
        d.kind = "word";                             // a word the adult added
        d.custom = true;
        d.label = ov.label;
        d.spoken = ov.spoken ?? ov.label;
        d.wordType = "noun";
        d.loadBoard = null;
        d.defaultVisible = true;
        d.visible = ov.show ?? true;
      } else {
        d.kind = "empty";
        d.visible = false;
      }
      cells.push(d);
    }
  }
  return cells;
}

// Draw the 45 cells. Cells are placed by CSS grid row/column, so changing what
// is inside a cell can never change its size or position.
//   editing  = true shows hidden words (faded, dashed) and empty cells too.
//   photoUrl = function(cellKey) -> picture URL or null
//   backImage = symbol file for the Back button
// The picture always goes inside the same fixed-size ".cell-image" box, so a
// symbol, a photo or the emoji fallback can never change a cell's layout.
export function renderBoard(boardEl, cells, { editing, photoUrl, backImage }) {
  boardEl.innerHTML = "";
  for (const d of cells) {
    const cell = document.createElement("div");
    cell.dataset.key = d.key;
    cell.style.gridRow = String(d.row + 1);
    cell.style.gridColumn = String(d.col + 1);

    if (d.kind === "home") {
      cell.className = "cell tap type-home";
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label", "Back");
      cell.innerHTML = '<div class="cell-image"></div><div class="cell-label">Back</div>';
      showSymbol(cell.querySelector(".cell-image"), backImage, "\u2B05\uFE0F");
    } else if (d.kind === "word" && (d.visible || editing)) {
      cell.className = "cell tap type-" + d.wordType + (d.visible ? "" : " ghost");
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label", d.label);
      cell.innerHTML = '<div class="cell-image"><span class="placeholder"></span></div>' +
        '<div class="cell-label"></div>';
      const url = photoUrl(d.key);
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
      cell.querySelector(".cell-label").textContent = d.label;
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
