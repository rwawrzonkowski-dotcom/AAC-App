// The adult menu's structure (Beta 3.9): which settings pages exist, how they are grouped, which view shows them, what each row
// says on its right, and the search. Pure data and small functions: no screen code (that is js/adult.js), so it is easy to test.
//
// LAYOUT (inspired by iPad Settings): on an iPad, a list on the left (learner card, quick actions, search, grouped rows) and the
// chosen page on the right. On a phone, the list fills the screen and a page opens over it with "‹ Settings" to go back.
//
// TWO VIEWS (device-wide, chosen on the first setup screen and switchable in the menu's top bar):
//   parent     the everyday settings: board, speaking and touch, Model prompt, reports, scenes, backup.
//   clinician  everything, including Targets and sessions and Everyday data.
// Nothing is removed in the parent view, only tucked away; the passcode protects the whole menu either way.
import * as store from "./storage.js";

export const VIEWS = ["parent", "clinician"];
const VIEW_KEY = "adultView";
export const getView = () => { const v = store.load(VIEW_KEY, "parent"); return VIEWS.includes(v) ? v : "parent"; };
export const setView = (v) => store.save(VIEW_KEY, VIEWS.includes(v) ? v : "parent");

// Groups, in order. `scope` says whose settings these are: the learner's (follows them in backups) or this iPad's.
export const GROUPS = [
  { id: "board",    title: "Board",               scope: "learner" },
  { id: "speaking", title: "Speaking and touch",  scope: "learner" },
  { id: "teaching", title: "Teaching",            scope: "learner" },
  { id: "scenes",   title: "Scenes",              scope: "learner" },
  { id: "device",   title: "This iPad",           scope: "device" },
];

// Pages. icon = a short glyph on a colored tile; views = where the row shows; keywords = words a search should find (the setting names
// on that page plus everyday words an adult might type). `oldIds` are the section ids older code opens the menu at (startAt).
export const PAGES = [
  { id: "learner", title: "Learners", group: null, icon: "👤", color: "#64748b", views: VIEWS, oldIds: ["sec-learner", "sec-notice"],
    keywords: ["learner", "child", "student", "add learner", "switch learner", "rename", "delete learner", "name", "notes about the board"] },
  { id: "size", title: "Board size", group: "board", icon: "▦", color: "#2563eb", views: VIEWS, oldIds: ["sec-size"],
    keywords: ["board size", "45", "84", "grid", "locations", "buttons", "bigger board"] },
  { id: "stage", title: "Vocabulary stage", group: "board", icon: "⬆", color: "#0891b2", views: VIEWS, oldIds: ["sec-stage"],
    keywords: ["stage", "vocabulary", "reveal words", "hidden words", "gray buttons", "more words"] },
  { id: "buttons", title: "Buttons on the board", group: "board", icon: "⊞", color: "#7c3aed", views: VIEWS,
    keywords: ["show words button", "words button", "forms button", "word forms dial", "press and hold", "hold time", "form markers",
      "keyboard button", "abc", "keyboard", "camera button", "camera", "photo", "little-word strip", "little words", "a is and to"] },
  { id: "reading", title: "Reading and typing", group: "board", icon: "Aa", color: "#0f766e", views: VIEWS,
    keywords: ["show words only", "no pictures", "reading", "read", "speak each letter", "letters", "typing", "spelling"] },
  { id: "voice", title: "Voice", group: "speaking", icon: "🔊", color: "#db2777", views: VIEWS, oldIds: ["sec-voice"],
    keywords: ["voice", "speech", "pitch", "speed", "sentence speed", "pause between words", "volume", "loud", "child voice", "adult voice", "novelty voices", "accent"] },
  { id: "touch", title: "Touch", group: "speaking", icon: "✋", color: "#ea580c", views: VIEWS, oldIds: ["sec-touch"],
    keywords: ["touch", "hold to select", "ignore repeated taps", "accidental taps", "repeat", "motor"] },
  { id: "teaching", title: "Targets and sessions", group: "teaching", icon: "🎯", color: "#dc2626", views: ["clinician"], oldIds: ["sec-teaching"],
    keywords: ["teaching", "targets", "session", "start a session", "trials", "prompt ladder", "fading", "mastery", "teaching templates",
      "instructions", "longest a trial can run", "baseline"] },
  { id: "model", title: "Model prompt", group: "teaching", icon: "💡", color: "#ca8a04", views: VIEWS, oldIds: ["sec-model"],
    keywords: ["model prompt", "modeling", "ring", "critter", "animal", "opacity", "prompt", "aided language"] },
  { id: "reports", title: "Reports", group: "teaching", icon: "📈", color: "#16a34a", views: VIEWS, oldIds: ["sec-reports"],
    keywords: ["reports", "graphs", "progress", "parent summary", "printable summary", "print", "export", "csv", "spreadsheet"] },
  { id: "data", title: "Everyday data", group: "teaching", icon: "📊", color: "#4f46e5", views: ["clinician"], oldIds: ["sec-data"],
    keywords: ["everyday data", "recording", "record", "pause recording", "keep data", "clear data", "privacy"] },
  { id: "scenes", title: "Scenes and My things", group: "scenes", icon: "📷", color: "#0d9488", views: VIEWS, oldIds: ["sec-scenes"],
    keywords: ["scenes", "scene", "photo", "camera", "my things", "remember this", "match strictness", "object recognition", "download recognition"] },
  { id: "backup", title: "Backup and data safety", group: "device", icon: "💾", color: "#475569", views: VIEWS, oldIds: ["sec-backup"],
    keywords: ["backup", "restore", "save", "home screen", "data safety", "protected", "move to another ipad", "files"] },
  { id: "about", title: "About VOICE", group: "device", icon: "ⓘ", color: "#6b7280", views: VIEWS, oldIds: ["sec-about"],
    keywords: ["about", "version", "credits", "privacy", "where is the adult menu", "help", "contact"] },
];

export const pageById = (id) => PAGES.find((p) => p.id === id) || null;
export const visibleIn = (page, view) => page.views.includes(view);
/** The page an older "startAt" section id points to (e.g. "sec-teaching" -> "teaching"). */
export const pageForOldId = (secId) => (PAGES.find((p) => (p.oldIds || []).includes(secId)) || {}).id || null;

/** Groups with their visible pages, in order, for one view. */
export function groupedPages(view) {
  return GROUPS.map((g) => ({ ...g, pages: PAGES.filter((p) => p.group === g.id && visibleIn(p, view)) })).filter((g) => g.pages.length);
}

// ---------- Search ----------
// Every word the adult types must appear in the page's title, group or one keyword phrase (start of a word counts: "cam" finds camera).
// Results are ranked: title match first, then keyword match; each result carries the phrase that matched, shown under the title.
const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").trim();
const hasWords = (text, words) => { const t = " " + norm(text) + " "; return words.every((w) => t.includes(" " + w)); };

/** Search the pages. Returns { results: [{ page, match }], hiddenCount } (hiddenCount = matches only in the other view). */
export function searchPages(query, view) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return { results: [], hiddenCount: 0 };
  const scored = [];
  for (const p of PAGES) {
    const group = (GROUPS.find((g) => g.id === p.group) || {}).title || "";
    let score = 0, match = "";
    if (hasWords(p.title, words)) score = 3;
    else if (hasWords(p.title + " " + group, words)) score = 2;
    else {
      const kw = p.keywords.find((k) => hasWords(k, words)) || (hasWords(p.keywords.join(" ") + " " + p.title, words) ? p.keywords.find((k) => words.some((w) => (" " + norm(k)).includes(" " + w))) : null);
      if (kw) { score = 1; match = kw; }
    }
    if (score) scored.push({ page: p, match, score });
  }
  scored.sort((a, b) => b.score - a.score || PAGES.indexOf(a.page) - PAGES.indexOf(b.page));
  const results = scored.filter((r) => visibleIn(r.page, view)).map(({ page, match }) => ({ page, match }));
  return { results, hiddenCount: scored.length - results.length };
}
