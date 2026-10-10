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
import { buildModel, posKey, wordKey } from "./boardmodel.js";

// How many built-in items each category page had before Phase 1.5A. They sat at
// row 0, columns 0, 1, 2 ... in the order they are listed in the board file.
const LEGACY_PAGE_ITEMS = { food: 8, drinks: 3, play: 8, places: 6, people: 6, favorites: 0 };

// Pages and items added in 1.5A to pages that already existed. If an adult had
// put their own word in the cell where such an item now belongs, the item gets
// the next free cell instead (a "pin"), so the adult's word never moves.
const NEW_ITEMS = [["places", "here"], ["people", "aboutme"]];

const KEY = /^([A-Za-z0-9_-]{1,40}):(\d{1,2}),(\d{1,2})$/;

// Which built-in word did this OLD key mean? (null = an empty cell)
export function legacyWordAt(board, key) {
  const m = KEY.exec(key);
  if (!m) return null;
  const page = m[1], r = +m[2], c = +m[3];
  const model = buildModel(board, 45);
  if (page === "core") {
    if (r === 4 && c === 2) return "here";                    // the old button
    const b = model.main.find((x) => x.row === r && x.col === c);
    return b ? b.id : null;
  }
  if (r !== 0 || !(page in LEGACY_PAGE_ITEMS)) return null;
  const p = model.pages[page];
  return p && c < LEGACY_PAGE_ITEMS[page] && p.items[c] ? p.items[c].id : null;
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
  // Items new to existing pages: keep any adult-added word where it was.
  const pins = {};
  const model = buildModel(board, 45);
  for (const [pageId, wordId] of NEW_ITEMS) {
    const page = model.pages[pageId];
    const item = page.items.find((x) => x.id === wordId);
    if (!cells[posKey(45, pageId, item.row, item.col)]) continue;     // cell is free: no pin needed
    const taken = new Set(page.items.map((x) => x.row + "," + x.col));
    if (page.at) taken.add(page.at.row + "," + page.at.col);
    let placed = false;
    for (let r = item.row; r < model.rows && !placed; r++) {
      for (let c = 0; c < model.cols && !placed; c++) {
        if (r === item.row && c <= item.col) continue;
        if (taken.has(r + "," + c) || cells[posKey(45, pageId, r, c)]) continue;
        pins[`45:${pageId}:${wordId}`] = [r, c];
        placed = true;
      }
    }
  }
  return { words, cells, pins };
}
