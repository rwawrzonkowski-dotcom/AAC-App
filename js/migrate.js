// Upgrading learner data saved by earlier versions of the app (profile "v1").
//
// WHY THIS EXISTS. Before Phase 1.5A everything an adult changed was stored by
// POSITION ("core:4,2" = the button in row 5, column 3 of the main board). That
// was safe while a position always held the same word. In Phase 1.5A the "here"
// button at that position became the "Chat" button, and "here" moved to the
// Places page. If the old data stayed keyed by position, a renamed label, a photo
// or a hide/show choice that belonged to "here" would suddenly appear on Chat.
//
// THE RULE NOW. Data about a BUILT-IN word is stored under the word's own id
// (profile.words["here"], photo key "w:here"), so it follows the word wherever
// the word lives, on either grid size. Only things an adult ADDED to an empty
// cell stay stored by position, because they belong to that cell.
//
// This file turns old position-keyed data into the new form. It also runs on
// backups made before Phase 1.5A. It uses the OLD layout (where "here" was at
// row 4, col 2) to know which word each old key meant.
import { buildModel, posKey, wordKey, SIZES } from "./boardmodel.js";

// The built-in items each category page had BEFORE Phase 1.6 (before pages were
// organized by row groups). They sat at row 0, columns 0, 1, 2 ... in this order.
// (Only needed to read very old data and backups: see legacyWordAt below.)
const LEGACY_PAGES = {
  food: ["cracker", "apple", "banana", "chips", "cheese", "sandwich", "pizza", "cookie"],
  drinks: ["water", "juice", "milk"],
  play: ["ball", "bubbles", "blocks", "swing", "slide", "tablet", "music", "book"],
  places: ["outside", "home", "school", "car", "park", "bed"],     // ("here" was added to row 0 in 1.5A)
  people: ["mom", "dad", "teacher", "friend", "he", "she"],        // ("About me" was added in 1.5A)
  favorites: [],
};

const KEY = /^([A-Za-z0-9_-]{1,40}):(\d{1,2}),(\d{1,2})$/;

// Which built-in word did this OLD key mean? (null = an empty cell)
export function legacyWordAt(board, key) {
  const m = KEY.exec(key);
  if (!m) return null;
  const page = m[1], r = +m[2], c = +m[3];
  if (page === "core") {
    if (r === 4 && c === 2) return "here";                    // the old button
    const b = buildModel(board, 45).main.find((x) => x.row === r && x.col === c);
    return b ? b.id : null;
  }
  if (r !== 0 || !(page in LEGACY_PAGES)) return null;
  return LEGACY_PAGES[page][c] || null;
}

// Old photo key -> new photo key.
export function mapLegacyKey(board, key) {
  const id = legacyWordAt(board, key);
  return id ? wordKey(id) : key;
}

// Convert old position-keyed `cells` into { words, cells, pins }.
export function migrateCells(board, oldCells) {
  const words = {};
  const cells = {};
  for (const [key, ov] of Object.entries(oldCells || {})) {
    const id = legacyWordAt(board, key);
    if (id) {
      const { custom, ...rest } = ov;                        // a built-in word's changes
      words[id] = { ...(words[id] || {}), ...rest };
    } else {
      cells[key] = ov;                                       // something added to an empty cell: stays put
    }
  }
  // (Before 1.6 this also "pinned" built-in words away from adult-added words. Pages are now
  // reorganized as a whole instead: see relocateAdultWords below.)
  const pins = {};
  return { words, cells, pins };
}

// ---------------------------------------------------------------------------------
// PHASE 1.6: category pages were reorganized into row groups (see js/boardmodel.js).
// Built-in words moved to new places, and some cells that used to be free now belong to
// a built-in word. Anything an adult ADDED to such a cell is KEPT and moved to the first
// free cell on the same page (on the 84 board rows 6-7 first, which the layout leaves
// free for adults). If a page has no free cell left (the 45-board Food page is full), the
// word goes to the first free cell on the Favorites page. Everything about built-in words
// (renamed label, photo, show/hide) is stored by word id, so it follows its word by itself.
// ---------------------------------------------------------------------------------
export const CURRENT_PROFILE_VERSION = 4;   // 3 = row-group category pages; 4 = Number pad on the Numbers page

const KEY_ANY = /^([A-Za-z0-9_-]{1,40}):(\d{1,2}),(\d{1,2})(@84)?$/;
function parseKey(key) {
  const m = KEY_ANY.exec(key);
  return m ? { page: m[1], row: +m[2], col: +m[3], size: m[4] ? 84 : 45 } : null;
}

// cells = adult-added things by position; pages = adult-made pages.
// Returns { cells, pages, moves } (new copies; the inputs are not changed).
//   moves = [{ from, to, label, pageName, toPageName, size, fromRC, toRC }]  (to = null if no room anywhere)
export function relocateAdultWords(board, cells, pages) {
  const outCells = { ...(cells || {}) };
  const outPages = JSON.parse(JSON.stringify(pages || {}));
  const moves = [];

  for (const size of [45, 84]) {
    const model = buildModel(board, size);
    const { rows, cols } = SIZES[size];
    const sx = size === 84 ? "@84" : "";
    const builtIn = (pid) => board.pages[pid] && model.pages[pid];

    // Cells a built-in word (or the Back button) now owns on this page.
    const owned = (pid) => {
      const pg = model.pages[pid];
      const set = new Set(pg.items.map((x) => x.row + "," + x.col));
      if (pg.at) set.add(pg.at.row + "," + pg.at.col);
      return set;
    };
    const taken = (pid, set, r, c) => set.has(r + "," + c) || outCells[`${pid}:${r},${c}${sx}`];
    // First free cell on a page. On the 84 board prefer the two bottom rows (left free on purpose).
    const firstFree = (pid) => {
      const set = owned(pid);
      const order = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) order.push([r, c]);
      if (size === 84) order.sort((a, b) => (b[0] >= 5) - (a[0] >= 5) || a[0] - b[0] || a[1] - b[1]);
      return order.find(([r, c]) => !taken(pid, set, r, c)) || null;
    };

    const conflicts = Object.keys(outCells).map((k) => ({ k, p: parseKey(k) }))
      .filter((x) => x.p && x.p.size === size && builtIn(x.p.page) && outCells[x.k] && outCells[x.k].custom)
      .filter((x) => owned(x.p.page).has(x.p.row + "," + x.p.col))
      .sort((a, b) => a.p.page.localeCompare(b.p.page) || a.p.row - b.p.row || a.p.col - b.p.col);

    for (const { k, p } of conflicts) {
      const cell = outCells[k];
      let toPage = p.page;
      let spot = firstFree(toPage);
      if (!spot && toPage !== "favorites") { toPage = "favorites"; spot = firstFree(toPage); }
      const move = { from: k, label: cell.label || "", pageName: board.pages[p.page].name, size, fromRC: [p.row, p.col] };
      if (!spot) { move.to = null; moves.push(move); continue; }       // nowhere to go: left in place (not shown)
      const to = posKey(size, toPage, spot[0], spot[1]);
      delete outCells[k];
      outCells[to] = cell;
      if (cell.opens && outPages[cell.opens]) {                        // a page button: its page follows it
        outPages[cell.opens].parent = toPage;
        outPages[cell.opens].at = { row: spot[0], col: spot[1] };
        outPages[cell.opens].depth = model.pages[toPage].depth + 1;
      }
      Object.assign(move, { to, toPageName: board.pages[toPage].name, toRC: spot });
      moves.push(move);
    }
  }
  return { cells: outCells, pages: outPages, moves };
}

// The photo-key changes that go with those moves: { oldKey: newKey }.
export function moveMap(moves) {
  return Object.fromEntries(moves.filter((m) => m.to).map((m) => [m.from, m.to]));
}

// A short, plain-language note about each move, for the adult.
export function describeMoves(moves) {
  return moves.map((m) => {
    const at = (rc) => `row ${rc[0] + 1}, column ${rc[1] + 1}`;
    const where = m.size === 84 ? "the 84-location board" : "the 45-location board";
    if (!m.to) return `"${m.label}" (${m.pageName} page, ${at(m.fromRC)}, ${where}) could not be moved: no free spot was left.`;
    return `"${m.label}" moved from ${m.pageName} page, ${at(m.fromRC)} to ${m.toPageName} page, ${at(m.toRC)} (${where}).`;
  });
}
