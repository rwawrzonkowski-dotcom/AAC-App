// Switch scanning (Beta 3.21): for learners who choose with one or two switches (big buttons that act like keyboard keys, such as a
// Bluetooth switch interface) or by touching anywhere on the screen. Rows first, then the buttons in the chosen row.
//
//   ONE SWITCH (default, "auto scanning"): press the switch to start. The highlight steps through the rows on its own (every "speed"
//     seconds); press when the row with the word is lit; it then steps through that row's buttons; press again to choose. After a choice
//     it starts again at the first row. If no press comes for "loops" full rounds it stops and waits (rows) or goes back to rows (buttons).
//   TWO SWITCHES ("step scanning"): switch 1 moves the highlight one step; switch 2 chooses (opens the row, or chooses the button).
//     Nothing moves on its own.
//
// SWITCH KEYS: switch interfaces send keys. One switch: Space, Enter or 1. Two switches: Space or 1 = move, Enter or 3 = choose.
// "Touch the screen as a switch" makes a touch anywhere (except the adult circle) the switch (one-switch mode: choose; two-switch mode:
// move with the left half of the screen, choose with the right half).
// Scanning never moves a word: the highlight is an outline drawn over the buttons in their own places. The last "row" is the message
// bar: Speak (the message bar), Delete and Clear, so a switch user can say a whole sentence.
//
// js/app.js gives: groups() -> [[element, ...], ...] (the rows on screen now, top to bottom, then the message-bar row), choose(element),
// settings() -> the learner's scan settings or null when scanning must not run (Edit mode, Model mode, an adult sheet open...),
// cue(element) -> say the button quietly (auditory scanning).
export const DEFAULT_SCAN = { mode: "off", speed: 1.5, loops: 2, screen: false, cues: false };
export const SCAN_MODES = ["off", "one", "two"];

export function cleanScan(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const num = (v, d, lo, hi) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    mode: SCAN_MODES.includes(o.mode) ? o.mode : "off",
    speed: Math.round(num(o.speed, DEFAULT_SCAN.speed, 0.5, 5) * 10) / 10,
    loops: Math.round(num(o.loops, DEFAULT_SCAN.loops, 1, 5)),
    screen: o.screen === true,
    cues: o.cues === true,
  };
}

const MOVE_KEYS = new Set([" ", "Spacebar", "1"]);
const CHOOSE_KEYS = new Set(["Enter", "3"]);

export function createScanner({ groups, choose, settings, cue, host = document }) {
  let level = "idle";        // "idle" | "rows" | "items"
  let rowIdx = -1, itemIdx = -1, rounds = 0;
  let timer = null;
  let lit = [];              // elements outlined now

  const paint = (els, cls) => { for (const e of lit) e.classList.remove("scan-row", "scan-item"); lit = els.filter(Boolean); for (const e of lit) e.classList.add(cls); };
  const unpaint = () => { for (const e of lit) e.classList.remove("scan-row", "scan-item"); lit = []; };
  const rows = () => groups().filter((g) => g.length);

  function stop() { clearInterval(timer); timer = null; level = "idle"; rowIdx = itemIdx = -1; unpaint(); }
  function show() {
    const r = rows();
    if (!r.length) { stop(); return; }
    if (level === "rows") {
      rowIdx = ((rowIdx % r.length) + r.length) % r.length;
      paint(r[rowIdx], "scan-row");
      const s = settings();
      if (s && s.cues) cue(r[rowIdx][0], "row");
    } else if (level === "items") {
      const row = r[Math.min(rowIdx, r.length - 1)] || [];
      if (!row.length) { level = "rows"; show(); return; }
      itemIdx = ((itemIdx % row.length) + row.length) % row.length;
      paint([row[itemIdx]], "scan-item");
      const s = settings();
      if (s && s.cues) cue(row[itemIdx], "item");
    }
  }
  // One step forward (the auto timer, or switch 1 in two-switch mode).
  function step() {
    const s = settings();
    if (!s) { stop(); return; }
    const r = rows();
    if (level === "rows") {
      rowIdx++;
      if (rowIdx >= r.length) { rowIdx = 0; rounds++; }
      if (s.mode === "one" && rounds >= s.loops) { stop(); return; }           // nobody pressed: wait for the next press
    } else if (level === "items") {
      const row = r[rowIdx] || [];
      itemIdx++;
      if (itemIdx >= row.length) { itemIdx = 0; rounds++; }
      if (s.mode === "one" && rounds >= s.loops) { level = "rows"; rounds = 0; }   // back to the rows
    }
    show();
  }
  function restartTimer() {
    clearInterval(timer); timer = null;
    const s = settings();
    if (s && s.mode === "one" && level !== "idle") timer = setInterval(step, Math.round(s.speed * 1000));
  }
  function startRows() { level = "rows"; rowIdx = 0; itemIdx = -1; rounds = 0; show(); restartTimer(); }

  // The "choose" switch (the only switch in one-switch mode).
  function select() {
    const s = settings();
    if (!s) return;
    if (level === "idle") { startRows(); return; }
    const r = rows();
    if (level === "rows") {
      const row = r[rowIdx] || [];
      if (row.length === 1) { const el = row[0]; unpaint(); choose(el); startRows(); return; }   // a row of one: choose it at once
      level = "items"; itemIdx = 0; rounds = 0; show(); restartTimer(); return;
    }
    const el = (r[rowIdx] || [])[itemIdx];
    unpaint();
    if (el && el.isConnected) choose(el);
    startRows();                          // the page may have changed: start again at the top of whatever is on screen now
  }
  // Switch 1 in two-switch mode.
  function move() {
    if (level === "idle") { level = "rows"; rowIdx = 0; itemIdx = -1; rounds = 0; show(); return; }
    step();
  }

  function onKey(e) {
    const s = settings();
    if (!s || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const isMove = MOVE_KEYS.has(e.key), isChoose = CHOOSE_KEYS.has(e.key);
    if (!isMove && !isChoose) return;
    e.preventDefault();
    if (s.mode === "one") select();
    else if (isMove) move();
    else select();
  }
  function onScreen(e) {
    const s = settings();
    if (!s || !s.screen) return;
    if (e.target.closest && (e.target.closest("#adult-hold") || e.target.closest(".overlay") || e.target.closest(".listener-view"))) return;
    e.preventDefault(); e.stopPropagation();
    if (s.mode === "one") select();
    else if (e.clientX < window.innerWidth / 2) move();
    else select();
  }
  host.addEventListener("keydown", onKey, true);
  host.addEventListener("pointerdown", onScreen, true);
  // The screen switch also swallows the rest of that touch, so nothing underneath reacts.
  const swallow = (e) => { const s = settings(); if (s && s.screen && !(e.target.closest && (e.target.closest("#adult-hold") || e.target.closest(".overlay") || e.target.closest(".listener-view")))) { e.preventDefault(); e.stopPropagation(); } };
  host.addEventListener("pointerup", swallow, true);
  host.addEventListener("click", swallow, true);

  return {
    stop,
    /** Settings changed or the screen changed: keep going if allowed, or stop. */
    sync() {
      const s = settings();
      if (!s) { stop(); return; }
      if (level !== "idle") { show(); restartTimer(); }
    },
    get level() { return level; },
  };
}
