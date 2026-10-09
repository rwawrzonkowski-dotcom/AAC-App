// Builds the 9 x 5 core grid from data/core-board.json.
//
// MOTOR PLANNING RULE: every word has a permanent (row, col). This file never
// sorts, filters-out, or reflows buttons. Words not yet revealed are drawn as
// blank gray tiles that still occupy their cell, so visible words never move.

// TODO (step 10): replace these emoji placeholders with real photos/symbols.
// The image area has a fixed proportion, so swapping will not change layout.
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
        d.kind = "home";                             // Home button: not editable
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
export function renderBoard(boardEl, cells, { editing, photoUrl }) {
  boardEl.innerHTML = "";
  for (const d of cells) {
    const cell = document.createElement("div");
    cell.dataset.key = d.key;
    cell.style.gridRow = String(d.row + 1);
    cell.style.gridColumn = String(d.col + 1);

    if (d.kind === "home") {
      cell.className = "cell tap type-home";
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label", "Home");
      cell.innerHTML = '<div class="cell-image"><span class="placeholder">\u{1F3E0}</span></div>' +
        '<div class="cell-label">Home</div>';
    } else if (d.kind === "word" && (d.visible || editing)) {
      cell.className = "cell tap type-" + d.wordType + (d.visible ? "" : " ghost");
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label", d.label);
      cell.innerHTML = '<div class="cell-image"><span class="placeholder"></span></div>' +
        '<div class="cell-label"></div>';
      const url = photoUrl(d.key);
      if (url) {
        const img = document.createElement("img");
        img.className = "photo";
        img.alt = "";
        img.src = url;
        cell.querySelector(".cell-image").replaceChildren(img);
      } else {
        cell.querySelector(".placeholder").textContent =
          PLACEHOLDERS[d.base ? d.base.id : ""] || d.label.charAt(0).toUpperCase();
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

// Pointer handling shared by the grid: darken on press, fire on pointerup only
// if the finger is still on the same button it started on (slide-off = ignored).
export function attachPressHandling(container, onActivate, selector = ".cell.tap") {
  let down = null;
  const clear = () => { if (down) down.classList.remove("pressed"); down = null; };

  container.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(selector);
    if (!el) return;
    down = el;
    el.classList.add("pressed");
  });
  container.addEventListener("pointerup", (e) => {
    if (!down) return;
    const start = down;
    clear();
    // Touch pointers are captured to the start element, so check what is under the finger.
    const under = document.elementFromPoint(e.clientX, e.clientY);
    if (under && under.closest(selector) === start) onActivate(start);
  });
  container.addEventListener("pointercancel", clear);
  container.addEventListener("pointerleave", clear);
  // Moving off the button visually un-presses it (and the tap is ignored).
  container.addEventListener("pointermove", (e) => {
    if (!down) return;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    down.classList.toggle("pressed", !!under && under.closest(selector) === down);
  });
}
