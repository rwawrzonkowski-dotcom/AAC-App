// Word prediction for the keyboard (Beta 3.28). Off by default (adult menu > Reading).
//
// Three FIXED slots above the keys show up to three words that start with what has been typed. The slots never move and
// the keys never move; only the words in the slots change. Nothing is shown until a letter is typed.
//
// Where the words come from (all on this device):
//   - the learner's own words: everything on their board (built-in labels, renamed labels, words an adult added),
//     the word forms (went, going...) and the Dolch sight words;
//   - the order: words this learner has used most in the last 4 weeks first (everyday data), then Dolch sight words,
//     then other board words, then word forms; shorter words before longer ones, then A to Z.
// Only single words of letters (and an apostrophe) are offered, never phrases ("I want that") or folder names.
import { listDaily, localDate } from "./everyday.js";

const WORD = /^[a-z][a-z']{1,29}$/;
const USE_DAYS = 28;
let base = null;          // Map word -> tier (1 Dolch, 2 board word, 3 word form)
let baseFor = null;       // the board object it was built from
let extra = new Map();    // this learner's own labels -> tier 2
let uses = new Map();     // word -> times used in the last 4 weeks
let ready = null;

const clean = (s) => String(s || "").trim().toLowerCase().replace(/’/g, "'");

async function fetchJson(url) {
  try { return await (await fetch(url)).json(); } catch { return null; }
}

/** Build the word list for this board (once) and for this learner (each time the keyboard opens). */
export function prepare(board, profile) {
  ready = (async () => {
    if (baseFor !== board) {
      const m = new Map();
      const add = (w, tier) => { w = clean(w); if (WORD.test(w) && (!m.has(w) || m.get(w) > tier)) m.set(w, tier); };
      for (const w of Object.values(board.words || {})) {
        if (!w || w.loadBoard || w.template || w.action || w.wordType === "category") continue;
        add(w.label, 2); add(w.spokenText, 2);
      }
      const forms = await fetchJson("data/word-forms.json");
      if (forms) for (const [k, v] of Object.entries(forms)) if (Array.isArray(v)) for (const fam of v) if (Array.isArray(fam)) fam.forEach((w) => add(w, 3));
      const dolch = await fetchJson("data/dolch.json");
      if (dolch) for (const [k, v] of Object.entries(dolch)) if (k !== "source" && typeof v === "string") v.split(/\s+/).forEach((w) => add(w, 1));
      base = m; baseFor = board;
    }
    extra = new Map();
    for (const ov of Object.values(profile.words || {})) if (ov && WORD.test(clean(ov.label))) extra.set(clean(ov.label), 2);
    for (const c of Object.values(profile.cells || {})) if (c && c.custom && !c.opens && WORD.test(clean(c.label))) extra.set(clean(c.label), 2);
    uses = new Map();
    try {
      const since = localDate(Date.now() - USE_DAYS * 86400000);
      for (const day of await listDaily(profile.id)) {
        if (day.date < since) continue;
        for (const [key, n] of Object.entries(day.wordCounts || {})) {
          let w;
          if (key.startsWith("~")) w = key.slice(1);
          else if (key.includes("+")) w = key.slice(key.indexOf("+") + 1);
          else w = (profile.words[key] && profile.words[key].label) || (board.words[key] && board.words[key].label);
          w = clean(w);
          if (WORD.test(w)) uses.set(w, (uses.get(w) || 0) + (Number(n) || 0));
        }
      }
    } catch { /* no everyday data: the order falls back to the word lists */ }
  })();
  return ready;
}

/** Up to n words that start with `typed` (not the typed word itself). [] before prepare() has finished. */
export function predict(typed, n = 3) {
  const t = clean(typed);
  if (!t || !base) return [];
  const seen = new Map(base);
  for (const [w, tier] of extra) seen.set(w, Math.min(tier, seen.get(w) ?? 9));
  for (const w of uses.keys()) if (!seen.has(w)) seen.set(w, 2);
  const out = [];
  for (const [w, tier] of seen) if (w.length > t.length && w.startsWith(t)) out.push({ w, tier, u: uses.get(w) || 0 });
  out.sort((a, b) => b.u - a.u || a.tier - b.tier || a.w.length - b.w.length || (a.w < b.w ? -1 : 1));
  return out.slice(0, n).map((x) => x.w);
}
