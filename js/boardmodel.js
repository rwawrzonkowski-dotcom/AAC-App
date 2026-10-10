// The board "model": which word sits in which cell, for one grid size.
// No drawing and no learner data in here, just the fixed layout.
//
// MOTOR PLANNING: on a given grid size a word's (row, col) is permanent. The
// layouts live in data/core-board.json:
//   - the main grid is written out row by row ("layouts" > "45" / "84" > "main")
//   - a page's items are listed in order; they fill the page left to right, top
//     to bottom from the top-left, skipping the Back cell. Adding an item to the
//     END of a page's list therefore never moves the items before it.
//
// Two grid sizes exist: 45 (9 columns x 5 rows) and 84 (12 x 7). Each learner uses one.

export const SIZES = { 45: { cols: 9, rows: 5 }, 84: { cols: 12, rows: 7 } };
export const MAX_DEPTH = 2;   // main board = 0, a page from it = 1, a page from that = 2 (3 taps to a word)

// Every cell has a permanent key that is used to store things an adult adds there.
//   45 board: "<page>:<row>,<col>"        e.g. "favorites:0,0"
//   84 board: "<page>:<row>,<col>@84"     e.g. "favorites:0,0@84"
// (The "@84" keeps the two boards' data apart: a word an adult adds to an empty
// cell belongs to that grid size only.)
export function posKey(size, pageId, row, col) {
  return `${pageId}:${row},${col}` + (Number(size) === 84 ? "@84" : "");
}

// Key for a built-in word's own data (renamed label, photo, show/hide, filled blank).
// It follows the word to whatever cell the word has on the other grid size.
export const wordKey = (wordId) => "w:" + wordId;

const models = new Map();

// Build (and remember) the model for one grid size.
export function buildModel(board, size) {
  size = Number(size) === 84 ? 84 : 45;
  const cached = models.get(board);
  if (cached && cached[size]) return cached[size];

  const { cols, rows } = SIZES[size];
  const geo = board.layouts[String(size)];
  const word = (id) => ({ id, ...board.words[id] });

  // Main grid: one entry per cell
  const main = [];
  geo.main.forEach((rowIds, row) => rowIds.forEach((id, col) => main.push({ ...word(id), row, col })));

  // Which pages exist on this size, and the items on each (filtered by "sizes")
  const onSize = (o) => !o.sizes || o.sizes.includes(size);
  const defs = {};
  for (const [pid, p] of Object.entries(board.pages)) {
    if (!onSize(p)) continue;
    defs[pid] = {
      id: pid, name: p.name,
      itemIds: p.items.map((it) => (typeof it === "string" ? { id: it } : it)).filter(onSize).map((it) => it.id),
    };
  }

  // Where is each page opened from? (the main grid, or an item on another page)
  const openerOf = {};   // pageId -> { parent, openerId }
  for (const b of main) if (b.loadBoard && defs[b.loadBoard]) openerOf[b.loadBoard] = { parent: "core", openerId: b.id };
  for (const d of Object.values(defs)) {
    for (const id of d.itemIds) {
      const w = board.words[id];
      if (w.loadBoard && defs[w.loadBoard]) openerOf[w.loadBoard] = { parent: d.id, openerId: id };
    }
  }

  // Lay each page out. The Back cell sits where the opening button sits, which
  // for a page opened from another page depends on that page's own layout,
  // so lay pages out on demand and remember the result.
  const pages = {};
  function layout(pid) {
    if (pages[pid]) return pages[pid];
    const d = defs[pid];
    const o = openerOf[pid];
    let at = null, parent = null, depth = 1;
    if (o) {
      parent = o.parent;
      if (parent === "core") {
        const b = main.find((x) => x.id === o.openerId);
        at = { row: b.row, col: b.col };
      } else {
        const pp = layout(parent);
        const it = pp.items.find((x) => x.id === o.openerId);
        at = { row: it.row, col: it.col };
        depth = pp.depth + 1;
      }
    }
    const items = [];
    let i = 0;
    for (let r = 0; r < rows && i < d.itemIds.length; r++) {
      for (let c = 0; c < cols && i < d.itemIds.length; c++) {
        if (at && at.row === r && at.col === c) continue;   // the Back cell
        items.push({ ...word(d.itemIds[i]), row: r, col: c });
        i++;
      }
    }
    pages[pid] = { id: pid, name: d.name, parent, at, depth, items, builtin: true };
    return pages[pid];
  }
  for (const pid of Object.keys(defs)) if (openerOf[pid]) layout(pid);   // pages nobody opens are not reachable

  const model = { size, cols, rows, main, pages, word };
  models.set(board, { ...(cached || {}), [size]: model });
  return model;
}

// Any page by id for this learner: "core", a built-in page, or an adult-made page.
// Returns { id, name, parent, at, depth, items, builtin } or null.
export function getPage(model, profile, pageId) {
  if (pageId === "core") return { id: "core", name: "", parent: null, at: null, depth: 0, items: model.main, builtin: true };
  if (model.pages[pageId]) return model.pages[pageId];
  const ap = profile.pages && profile.pages[pageId];
  if (ap && Number(ap.size) === model.size) {
    return { id: pageId, name: ap.name, parent: ap.parent, at: ap.at, depth: ap.depth, items: [], builtin: false };
  }
  return null;
}

// The chain of pages from this one up to the main board: [page, parent, ..., "core"]
export function pathToCore(model, profile, pageId) {
  const out = [];
  let id = pageId;
  for (let n = 0; id && n < 6; n++) {
    out.push(id);
    if (id === "core") break;
    const p = getPage(model, profile, id);
    id = p ? p.parent : null;
  }
  return out;
}

// What is in each cell of one page, for one learner. Returns one description per
// cell in row-by-row order. Nothing is ever moved: a cell is always at its own
// (row, col), whether it is visible, hidden, or empty.
//
// Each description d has:
//   key, row, col        the cell (key is the storage/DOM key, see posKey)
//   kind                 "home" (Back), "word" or "empty"
//   base                 the built-in word (or null for an adult-added one)
//   ov                   the adult's changes for this button (may be {})
//   label, spoken, wordType, loadBoard, visible, custom, photoKey ...
export function resolvePage(page, profile, model) {
  const { cols, rows, size } = model;
  const byPos = new Map();
  for (const it of page.items) {
    const pin = profile.pins && profile.pins[`${size}:${page.id}:${it.id}`];   // set only by migration (see js/migrate.js)
    const r = pin ? pin[0] : it.row, c = pin ? pin[1] : it.col;
    byPos.set(r + "," + c, it);
  }
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const key = posKey(size, page.id, row, col);
      const d = { key, row, col, base: null, ov: {}, page: page.id };
      const base = byPos.get(row + "," + col) || null;
      const custom = profile.cells[key];

      if (page.at && page.at.row === row && page.at.col === col) {
        d.kind = "home";                              // Back button: not editable
        d.visible = true;
      } else if (base) {
        const ov = profile.words[base.id] || {};
        const stageGated = page.id === "core";
        d.kind = "word";
        d.base = base;
        d.wordId = base.id;
        d.ov = ov;
        d.photoKey = wordKey(base.id);
        d.label = ov.label ?? base.label;
        d.wordType = base.wordType;
        d.loadBoard = base.loadBoard || null;
        d.stageGated = stageGated;
        // Sentence buttons ("My name is ___"): speak the sentence with the blank filled in.
        if (base.template) {
          d.template = base.template;
          d.blank = !!base.blank;
          d.fill = (ov.fill || "").trim();
          d.spoken = ov.spoken ?? (d.blank ? base.template.replace("___", d.fill) : base.template);
          d.sentence = true;
        } else {
          d.spoken = ov.spoken ?? base.spokenText ?? d.label;
        }
        // Main grid: stage rule. Pages: always visible (the page can only be opened
        // when its button is visible). A blank sentence stays hidden until filled in.
        d.defaultVisible = stageGated ? base.stage <= profile.stage : true;
        d.visible = (ov.show ?? d.defaultVisible) && !(d.blank && !d.fill);
      } else if (custom && custom.custom && custom.label) {
        d.kind = "word";                              // something the adult added
        d.custom = true;
        d.ov = custom;
        d.photoKey = key;
        d.label = custom.label;
        const opens = custom.opens && profile.pages[custom.opens] ? custom.opens : null;
        d.loadBoard = opens;                          // an adult-made page opens like a category
        d.opens = opens;
        d.spoken = custom.spoken ?? custom.label;
        d.wordType = opens ? "category" : "noun";
        d.defaultVisible = true;
        d.visible = custom.show ?? true;
      } else {
        d.kind = "empty";
        d.photoKey = key;
        d.visible = false;
      }
      cells.push(d);
    }
  }
  return cells;
}
