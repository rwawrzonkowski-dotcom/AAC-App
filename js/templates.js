// Teaching instructions (Phase 2, Round A.1, beta): the wording templates, which template a new target starts with, the
// per-device edited templates, and the text a target actually shows. Nothing here draws a screen; the screens are in
// js/teachui.js (target settings, "Teaching templates") and js/session.js (the Instructions card in a session).
//
// THE PIECES
//   data/teaching-templates.json   10 templates. Each has a "clinical" and a "parent" wording for six fields (cue, setup,
//                                  when to teach, reinforcement, error correction, notes). {word} and {name} are tokens.
//                                  The wording was approved by the BCBA: never edit the JSON text from code.
//   edited templates               the adult can change any template field (menu > Teaching > Teaching templates). Edits are
//                                  kept on this device (localStorage "teachTemplates"), apply to every learner's targets and
//                                  travel in a backup of all learners.
//   a target's instructions        target.instructions = { templateId, overrides: { clinical: {field: text}, parent: {...} } }.
//                                  The text shown for a field is the target's override if it has one, otherwise the template
//                                  text (edited on this device, otherwise original), with {word} and {name} filled in.
import { load, save } from "./storage.js";
import { FIELD_IDS, VOICES, FALLBACK_TEMPLATE, fillTokens, unfillTokens, newInstructions } from "./teaching.js";

// ---------- The template file ----------
let data = null;               // { fields: [{id,label}], templates: [...] }
let byId = new Map();
let loading = null;

const FALLBACK_DATA = {      // only used if the JSON cannot be read (it is in the offline cache, so this should never happen)
  fields: FIELD_IDS.map((id) => ({ id, label: id })),
  templates: [{ id: FALLBACK_TEMPLATE, name: "General word", clinical: {}, parent: {} }],
};

export function loadTemplates() {
  if (!loading) {
    loading = fetch("data/teaching-templates.json").then((r) => r.json()).catch(() => FALLBACK_DATA).then((d) => {
      data = d && Array.isArray(d.templates) && d.templates.length ? d : FALLBACK_DATA;
      byId = new Map(data.templates.map((t) => [t.id, t]));
      return data;
    });
  }
  return loading;
}

export const fieldList = () => (data ? data.fields : FALLBACK_DATA.fields);
export const templateList = () => (data ? data.templates : FALLBACK_DATA.templates);
export const hasTemplate = (id) => byId.has(id);
export const getTemplate = (id) => byId.get(id) || byId.get(FALLBACK_TEMPLATE) || FALLBACK_DATA.templates[0];
const originalRaw = (id, voice, field) => { const t = getTemplate(id); return (t[voice] && typeof t[voice][field] === "string") ? t[voice][field] : ""; };

// ---------- Edited templates (per device, not per learner) ----------
// Stored as { templateId: { clinical: {field: text}, parent: {field: text} } }, only the fields that were changed.
const EDIT_KEY = "teachTemplates";
const MAX_TEXT = 3000;

// Make anything (storage, or a backup file) into a clean edits object.
export function cleanEdits(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [tid, per] of Object.entries(raw)) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(tid) || !per || typeof per !== "object") continue;
    for (const v of VOICES) {
      const src = per[v];
      if (!src || typeof src !== "object") continue;
      for (const f of FIELD_IDS) {
        if (typeof src[f] === "string") {
          (out[tid] = out[tid] || { clinical: {}, parent: {} })[v][f] = src[f].slice(0, MAX_TEXT);
        }
      }
    }
  }
  return out;
}
let edits = null;
export function getEdits() {
  if (!edits) edits = cleanEdits(load(EDIT_KEY, {}));
  return edits;
}
const persist = () => save(EDIT_KEY, edits);
export const hasEdits = () => Object.keys(getEdits()).length > 0;
export const editedCount = () => Object.keys(getEdits()).length;
export function replaceEdits(raw) { edits = cleanEdits(raw); persist(); }

// The wording of one template field on this device (edited, else original), with the {word} / {name} tokens still in it.
export function templateRaw(id, voice, field) {
  const e = getEdits()[id];
  return e && typeof e[voice][field] === "string" ? e[voice][field] : originalRaw(id, voice, field);
}
export const isTemplateFieldEdited = (id, voice, field) => { const e = getEdits()[id]; return !!e && typeof e[voice][field] === "string"; };
export function isTemplateEdited(id) { return !!getEdits()[id]; }

// Change one field of a template. Text equal to the original wording removes the edit.
export function setTemplateField(id, voice, field, text) {
  const all = getEdits();
  if (text === originalRaw(id, voice, field)) {
    const e = all[id];
    if (e) { delete e[voice][field]; if (!Object.keys(e.clinical).length && !Object.keys(e.parent).length) delete all[id]; }
  } else {
    (all[id] = all[id] || { clinical: {}, parent: {} })[voice][field] = String(text).slice(0, MAX_TEXT);
  }
  persist();
}
export function resetTemplateField(id, voice, field) { setTemplateField(id, voice, field, originalRaw(id, voice, field)); }
// "Restore original wording": both wordings of one template.
export function restoreTemplate(id) { delete getEdits()[id]; persist(); }

// ---------- What a target shows ----------
// Instructions of a target (always an object after the migration; this keeps old, unmigrated objects safe).
const instr = (t) => t.instructions || (t.instructions = newInstructions(FALLBACK_TEMPLATE));
export const overrideOf = (t, voice, field) => { const o = instr(t).overrides[voice]; return o && typeof o[field] === "string" ? o[field] : null; };
export const hasOverrides = (t) => VOICES.some((v) => Object.keys(instr(t).overrides[v] || {}).length > 0);
export const overrideCount = (t) => VOICES.reduce((n, v) => n + Object.keys(instr(t).overrides[v] || {}).length, 0);

// The wording with tokens still in it: the target's own, else the template's.
export function instructionRaw(t, voice, field) {
  const o = overrideOf(t, voice, field);
  return o !== null ? o : templateRaw(instr(t).templateId, voice, field);
}
// The wording as the adult reads it: {word} = the target's label, {name} = the learner's name.
export const instructionText = (t, voice, field, learnerName) => fillTokens(instructionRaw(t, voice, field), t.label, learnerName);

// The adult edited a field and what is on screen is `shown`. Keep it as an override unless it reads the same as the template.
// (The word and the learner's name are turned back into {word} and {name}, so copying the text to another target still works.)
export function setOverride(t, voice, field, shown, learnerName) {
  const ins = instr(t);
  const tmpl = fillTokens(templateRaw(ins.templateId, voice, field), t.label, learnerName);
  if (shown === tmpl) { delete ins.overrides[voice][field]; return; }
  ins.overrides[voice][field] = unfillTokens(String(shown).slice(0, MAX_TEXT), t.label, learnerName);
}
export function resetOverride(t, voice, field) { delete instr(t).overrides[voice][field]; }
export function clearOverrides(t) { instr(t).overrides = { clinical: {}, parent: {} }; }
export const templateIdOf = (t) => instr(t).templateId;
export const templateNameOf = (t) => getTemplate(instr(t).templateId).name;

// Copy the instructions of one target onto another (a plain deep copy).
export function copyInstructions(from, to) {
  const ins = instr(from);
  to.instructions = { templateId: ins.templateId, overrides: JSON.parse(JSON.stringify(ins.overrides)) };
}

// ---------- Which template a new target starts with ----------
// The BCBA's approved rules (data/teaching-templates.json > "assignment"): the word first, then the page the word was chosen on
// (or the folder it sits in, or the page that folder belongs to), then "general". The JSON describes this in plain language; the
// lists below are that description resolved to the app's real word ids and page ids. Judgment calls are marked "(judged)".

// 1. By word id. (Real ids: "all done" = im-done and done, "I need a break" = need-break, "thank you" = thank-you.)
const WORDS = {
  "request-items": ["eat", "drink"],                                                    // (judged) the two main-board requests for things
  "request-actions": ["more", "want", "get", "go", "open", "put", "turn", "make", "do", "again",
    "need", "give", "come", "bathroom", "read", "sleep"],                               // (judged) need, give, come, bathroom, read, sleep
  "help-break": ["help", "help-me", "help-me-please", "break", "need-break", "finished", "im-done", "done", "stop", "stop-it", "no", "wait",
    "leave-me-alone", "not-now", "too-much", "my-body"],                                // (judged) help-me*, stop-it, leave-me-alone, not-now, too-much, my-body
  "social": ["hi", "hello", "bye", "please", "thank-you", "thank", "sorry", "good-job", "yes-please", "no-thank-you"],   // (judged) the last four
  "commenting": ["look", "see", "like"],
  "yes-no-questions": ["yes", "what", "where", "who", "when", "why", "how"],           // ("no" is in help-break: the BCBA's rule for the overlap)
  "concepts": ["big", "little", "hot", "cold", "same", "different", "up", "down", "in", "on", "off", "out",
    "slow", "fast", "all", "some", "many", "much", "any", "every", "both", "over", "under", "around", "away"],   // (judged) slow, fast and the quantity/place words
  "feelings-body": ["feel", "hurt"],                                                    // (judged) main-board feel and hurt
  // Function words and pronouns stay "general" even on the Little words pages, which are otherwise concept pages.
  "general": ["a", "an", "the", "and", "but", "or", "so", "if", "because", "of", "to", "for", "with", "from", "at", "by", "as", "into",
    "upon", "about", "there", "these", "those", "which", "very", "only", "too", "just", "this", "that", "it", "its", "is", "am", "are",
    "was", "were", "be", "been", "has", "had", "have", "does", "did", "dont", "will", "would", "could", "may", "must", "shall", "let",
    "can", "not", "he", "she", "we", "they", "me", "him", "her", "us", "them", "i", "you", "myself", "my", "your", "his", "our", "their",
    "body-back", "love", "good", "try"],
};
const WORD_TEMPLATE = Object.create(null);
for (const [tid, ids] of Object.entries(WORDS)) for (const id of ids) WORD_TEMPLATE[id] = tid;

// 2. By page (a folder counts as part of the page it belongs to; a page not listed here uses the page it is a folder of).
const PAGES = {
  "request-items": ["food", "more-food", "mf-desserts", "mf-sauces", "mf-fast", "mf-meals", "mf-snacks", "mf-fruit", "mf-veg", "mf-dairy",
    "drinks", "dr-juice", "dr-milk", "dr-hot", "dr-water", "dr-party", "dr-things",
    "play", "t-sensory", "t-pretend", "t-building", "t-vehicles", "t-art", "t-music",
    "favorites", "w-things", "th-school", "th-tech", "th-household", "th-bathroom", "th-bedroom",
    "ch-requests"],                                                                     // (judged) the Chat requests folder
  "request-actions": ["w-actions", "ac-routine", "ac-school", "ac-play", "ac-body", "ac-kitchen"],
  "labeling": ["animals", "a-pets", "a-farm", "a-zoo", "a-ocean", "a-bugs", "a-birds", "a-dinos", "a-forest",
    "people", "pe-family", "pe-school", "pe-helpers", "pe-pretend", "pe-friends",
    "places", "pl-home", "pl-school", "pl-stores", "pl-food", "pl-fun", "pl-outdoors", "pl-travel", "pl-health",
    "fe-parts",                                                                         // (judged) "Body parts" is Feelings > Body parts
    "w-clothes", "cl-accessories", "cl-weather", "cl-dressing", "w-outside", "ou-weather", "ou-space", "ou-plants"],
  "social": ["chat", "ch-play"],                                                        // (the Chat page itself is refined by row group below)
  "commenting": ["ch-compliments"],                                                     // (judged) compliments are comments
  "yes-no-questions": ["ch-questions"],
  "feelings-body": ["feelings", "fe-more", "fe-sick", "fe-calm", "fe-sensory", "fe-care"],
  "concepts": ["w-colors", "w-numbers", "nu-math", "nu-money", "nu-big", "w-describing", "ds-opposites", "ds-shapes", "ds-textures",
    "ds-taste", "ds-sizes", "w-time", "ti-days", "ti-months", "ti-seasons", "ti-routine", "ti-clock", "w-little", "w-more-little"],
  "general": ["aboutme", "w-past", "words"],                                            // About me, Past tense and the Words menu: no specific teaching pattern
};
const PAGE_TEMPLATE = Object.create(null);
for (const [tid, ids] of Object.entries(PAGES)) for (const id of ids) PAGE_TEMPLATE[id] = tid;

// The Chat page is a mix, so its row groups decide (the group is read from the real board data).
const CHAT_GROUPS = { "Greetings": "social", "Turns and play": "social", "Comments": "commenting", "Manners and protest": "social", "Help": "help-break" };

// info = { wordId, pageId, path }  (path = the pages after the main board that lead to pageId, as saved on a target)
export function assignTemplate(board, info) {
  const byWord = WORD_TEMPLATE[info.wordId];
  if (byWord) return byWord;
  const chain = [info.pageId, ...[...(info.path || [])].reverse()].filter((p, i, a) => p && p !== "core" && a.indexOf(p) === i);
  for (const pid of chain) {
    if (pid === "chat" && board && board.pages && board.pages.chat) {
      const g = (board.pages.chat.groups || []).find((grp) => [...grp.words, ...(grp.adds || [])].some((e) => (typeof e === "string" ? e : e.id) === info.wordId));
      if (g && CHAT_GROUPS[g.name]) return CHAT_GROUPS[g.name];
    }
    if (PAGE_TEMPLATE[pid]) return PAGE_TEMPLATE[pid];
  }
  return FALLBACK_TEMPLATE;
}

// Give a target that has no instructions yet (new, from Round A, or from an older backup) the starting template. Returns true if it changed.
export function ensureInstructions(board, t) {
  if (t.instructions && hasTemplateId(t.instructions.templateId)) return false;
  const keep = t.instructions ? t.instructions.overrides : null;          // (an unknown template id from the future keeps its overrides)
  t.instructions = newInstructions(assignTemplate(board, t));
  if (keep) t.instructions.overrides = keep;
  return true;
}
const hasTemplateId = (id) => typeof id === "string" && id.length > 0 && (byId.size === 0 || byId.has(id));
