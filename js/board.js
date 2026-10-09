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
};

// Create the grid. `onWord(button)` is called when a visible word is tapped.
export function renderBoard(boardEl, board, currentStage, onWord) {
  boardEl.innerHTML = "";
  const byId = new Map();

  // Render in the order given in the data file; CSS places each cell by row/col.
  for (const b of board.buttons) {
    const visible = b.stage <= currentStage;
    const cell = document.createElement("div");
    cell.className = "cell " + (visible ? "type-" + b.wordType : "hidden");
    cell.style.gridRow = String(b.row + 1);
    cell.style.gridColumn = String(b.col + 1);
    cell.dataset.id = b.id;

    if (visible) {
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label", b.label);
      cell.innerHTML =
        '<div class="cell-image"><span class="placeholder"></span></div>' +
        '<div class="cell-label"></div>';
      cell.querySelector(".placeholder").textContent =
        PLACEHOLDERS[b.id] || b.label.charAt(0).toUpperCase();
      cell.querySelector(".cell-label").textContent = b.label;
      byId.set(b.id, b);
    } else {
      cell.setAttribute("aria-hidden", "true");
    }
    boardEl.appendChild(cell);
  }

  attachPressHandling(boardEl, (cell) => {
    const b = byId.get(cell.dataset.id);
    if (b) onWord(b);
  });
}

// Pointer handling shared by the grid: darken on press, fire on pointerup only
// if the finger is still on the same button it started on (slide-off = ignored).
export function attachPressHandling(container, onActivate, selector = ".cell:not(.hidden)") {
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
