// Voice picker (adult menu > Voice). Lists the voices INSTALLED ON THIS DEVICE, nothing is recorded or bundled.
//
//  * English voices are grouped by accent (from the language tag): United States, United Kingdom, Australia, Ireland,
//    India, South Africa, Scotland, New Zealand, Other English. Apple's novelty voices go in a last "Fun voices" group.
//  * "Show other languages" (collapsed by default) lists the rest, grouped by language, for bilingual families.
//  * Each voice shows a quality badge when it can be told from its name / voiceURI (Premium, Enhanced, Standard),
//    "On this device" or "Needs internet" (localService), and has a Preview button.
//  * Choosing a voice saves its voiceURI in the learner's voice settings (the same field as before).
//  * If the saved voice is not installed here, a notice says which voice is used instead. The saved choice is NOT
//    changed, so it works again on the device it came from.
// Nothing here touches the board.
import { h } from "./ui.js";
import { allVoices, currentVoice, onVoicesChanged, speak } from "./speech.js";
import { isIPad, isIPhone } from "./devicetips.js";

export const PREVIEW_SENTENCE = "I want more bubbles please";

// ---------- Detection rules ----------

// Apple's novelty / character voices (macOS and iOS). Names are compared without spaces, in lower case.
// To add one, add its name here. The voiceURI of these voices ends in the same name, e.g.
// "com.apple.speech.synthesis.voice.BadNews" or "...voice.Zarvox", so that is checked too.
// (Ordinary Apple voices such as Samantha, Daniel, Karen, Eddy, Flo, Reed, Rocko, Sandy, Shelley, Grandma and
// Grandpa are NOT novelty voices and are not in this list.)
export const NOVELTY_NAMES = [
  "Albert", "Bad News", "Bahh", "Bells", "Boing", "Bubbles", "Cellos", "Deranged", "Fred", "Good News",
  "Hysterical", "Jester", "Junior", "Kathy", "Organ", "Princess", "Ralph", "Superstar", "Trinoids", "Whisper",
  "Wobble", "Zarvox",
];
const NOVELTY_SET = new Set(NOVELTY_NAMES.map((n) => n.toLowerCase().replace(/\s+/g, "")));

// The voice's name without a trailing "(Enhanced)" / "(Premium)" / "(English (US))" part.
const baseName = (name) => String(name || "").replace(/\s*\(.*$/, "").trim();

// A voice is in English when its language tag starts with "en" ("en-US", "en_GB", "en").
export function isEnglish(v) {
  const l = String(v.lang || "").replace(/_/g, "-").toLowerCase();
  return l === "en" || l.startsWith("en-");
}

export function isNovelty(v) {
  if (!isEnglish(v)) return false;
  if (NOVELTY_SET.has(baseName(v.name).toLowerCase().replace(/\s+/g, ""))) return true;
  const uri = String(v.voiceURI || "");
  if (/speech\.synthesis\.voice\./i.test(uri)) {
    const last = uri.split(/speech\.synthesis\.voice\./i).pop().toLowerCase().replace(/[\s.]+/g, "");
    return NOVELTY_SET.has(last);
  }
  return false;
}

// "premium" | "enhanced" | "standard" | "" (unknown). iOS / macOS put the quality in the name ("Zoe (Premium)")
// and/or the voiceURI ("com.apple.voice.premium.en-US.Zoe", ".enhanced.", ".compact."). Android's "network"
// voices and others carry no quality word, so they get no badge.
export function qualityOf(v) {
  const t = (String(v.name || "") + " " + String(v.voiceURI || "")).toLowerCase();
  if (/premium/.test(t)) return "premium";
  if (/enhanced/.test(t)) return "enhanced";
  if (/\.compact\.|compact/.test(t)) return "standard";
  return "";
}
const QUALITY_RANK = { premium: 0, enhanced: 1, standard: 3, "": 2 };
const QUALITY_LABEL = { premium: "Premium", enhanced: "Enhanced", standard: "Standard" };

// The accent group of an English voice, by its language tag.
export const ENGLISH_GROUPS = [
  { key: "us", label: "United States" }, { key: "gb", label: "United Kingdom" }, { key: "au", label: "Australia" },
  { key: "ie", label: "Ireland" }, { key: "in", label: "India" }, { key: "za", label: "South Africa" },
  { key: "scot", label: "Scotland" }, { key: "nz", label: "New Zealand" }, { key: "other", label: "Other English" },
];
export function englishGroupKey(v) {
  const l = String(v.lang || "").replace(/_/g, "-").toLowerCase();
  if (l.includes("scotland")) return "scot";               // "en-scotland", "en-GB-scotland"
  const region = l.split("-")[1] || "";
  return ENGLISH_GROUPS.some((g) => g.key === region) ? region : "other";
}

// A language's name in English ("es" -> "Spanish"), falling back to the code.
function languageName(code) {
  try {
    const n = new Intl.DisplayNames(["en"], { type: "language" }).of(code);
    if (n && n !== code) return n;
  } catch (e) { /* older browsers */ }
  return code.toUpperCase();
}

// Sort: best quality first, then by name.
const byQualityThenName = (a, b) =>
  (QUALITY_RANK[qualityOf(a)] - QUALITY_RANK[qualityOf(b)]) || baseName(a.name).localeCompare(baseName(b.name));

// Everything the picker shows: { english: [{key,label,voices}], fun: [voices], others: [{key,label,voices}] }.
export function groupVoices(list) {
  const seen = new Set();
  const voices = list.filter((v) => v && !seen.has(v.voiceURI) && seen.add(v.voiceURI));
  const english = ENGLISH_GROUPS.map((g) => ({ ...g, voices: [] }));
  const fun = [];
  const others = new Map();
  for (const v of voices) {
    if (isEnglish(v)) {
      if (isNovelty(v)) fun.push(v);
      else english.find((g) => g.key === englishGroupKey(v)).voices.push(v);
    } else {
      const code = String(v.lang || "").replace(/_/g, "-").toLowerCase().split("-")[0] || "?";
      if (!others.has(code)) others.set(code, { key: code, label: languageName(code), voices: [] });
      others.get(code).voices.push(v);
    }
  }
  english.forEach((g) => g.voices.sort(byQualityThenName));
  fun.sort((a, b) => baseName(a.name).localeCompare(baseName(b.name)));
  const otherList = [...others.values()].sort((a, b) => a.label.localeCompare(b.label));
  otherList.forEach((g) => g.voices.sort(byQualityThenName));
  return { english: english.filter((g) => g.voices.length), fun, others: otherList };
}

// Shown name: without "(Enhanced)" / "(Premium)", which become badges.
// A trailing "(English (US))" (iOS adds it to some names) is dropped too: the language tag is shown beside the name.
const shownName = (v) => String(v.name || v.voiceURI || "Voice")
  .replace(/\s*\((enhanced|premium)\)/i, "").replace(/\s*\(English[^)]*\)+\s*$/i, "").trim();

// "this iPad" / "this iPhone" / "this device" for the missing-voice notice.
export function deviceWord() {
  if (isIPad()) return "iPad";
  if (isIPhone()) return "iPhone";
  return "device";   // Android phones and tablets, computers
}

// The picker's remembered screen state (which groups are open). One per adult menu, so rebuilding the menu keeps it.
export function newPickerState() {
  return { open: new Set(), other: false, started: false };
}

// ---------- The picker ----------
//   voice    the learner's voice settings object (voiceURI is read and written here)
//   persist  saves them (adult.js: setVoiceSettings + saveProfile)
//   state    from newPickerState()
// Returns { el, stop }: the element for the Voice section and a function to call when the menu is rebuilt/closed.
export function createVoicePicker({ voice, persist, state }) {
  const status = h("p", { class: "muted vp-status", id: "voice-status", role: "status" });
  const current = h("p", { class: "vp-current", id: "voice-current" });
  const notice = h("p", { class: "vp-notice", id: "voice-missing", role: "status", hidden: true });
  const list = h("div", { class: "vp-list", id: "voice-list" });
  const el = h("div", { class: "vp", id: "voice-picker" }, current, notice, status, list);

  let signature = null;       // what was last drawn, so a repeated "voiceschanged" does not redraw everything
  let tries = 0;
  let timer = null;
  let n = 0;                  // running number for element ids

  function badge(text, cls) { return h("span", { class: "vp-badge " + cls, text }); }

  function previewButton(uri, label) {
    return h("button", { type: "button", class: "btn vp-preview", text: "Preview", "aria-label": "Preview " + label,
      // The learner's own pitch and speed, with this voice. Nothing is saved.
      onclick: () => speak(PREVIEW_SENTENCE, "sentence", { ...voice, voiceURI: uri }) });
  }

  function row(v) {
    const on = voice.voiceURI === v.voiceURI;
    const q = qualityOf(v);
    const name = shownName(v);
    const badges = h("span", { class: "vp-badges" },
      q ? badge(QUALITY_LABEL[q], "vp-q-" + q) : null,
      isNovelty(v) ? badge("Novelty", "vp-fun") : null,
      v.localService === true ? badge("On this device", "vp-local") : null,
      v.localService === false ? badge("Needs internet", "vp-online") : null);
    return h("div", { class: "vp-row" + (on ? " on" : ""), "data-uri": v.voiceURI },
      h("button", { type: "button", class: "vp-pick", id: "voice-opt-" + (n++), role: "radio", "aria-checked": on ? "true" : "false",
        "data-uri": v.voiceURI,
        onclick: () => { voice.voiceURI = v.voiceURI; persist(); draw(true); } },
        h("span", { class: "vp-check", "aria-hidden": "true", text: on ? "✓" : "" }),
        h("span", { class: "vp-main" },
          h("span", { class: "vp-name", text: name }),
          h("span", { class: "vp-lang", text: v.lang || "" })),
        badges),
      previewButton(v.voiceURI, name));
  }

  // A collapsible group. It starts open if it holds the chosen voice (or is the first English group).
  function group(key, label, voices, extraClass = "") {
    const d = h("details", { class: "vp-group " + extraClass, id: "voice-group-" + key, "data-group": key });
    d.open = state.open.has(key);
    d.addEventListener("toggle", () => { if (d.open) state.open.add(key); else state.open.delete(key); });
    d.append(h("summary", { text: `${label} (${voices.length})` }),
      h("div", { class: "vp-rows", role: "radiogroup", "aria-label": label }, voices.map(row)));
    return d;
  }

  function autoRow(all) {
    const on = !voice.voiceURI;
    const using = on ? currentVoice(voice) : null;
    return h("div", { class: "vp-row vp-auto" + (on ? " on" : ""), id: "voice-auto-row" },
      h("button", { type: "button", class: "vp-pick", id: "voice-opt-auto", role: "radio", "aria-checked": on ? "true" : "false",
        onclick: () => { voice.voiceURI = ""; persist(); draw(true); } },
        h("span", { class: "vp-check", "aria-hidden": "true", text: on ? "✓" : "" }),
        h("span", { class: "vp-main" },
          h("span", { class: "vp-name", text: "Automatic" }),
          h("span", { class: "vp-lang", text: "The best English voice on this device" + (using ? ": " + shownName(using) : "") }))),
      previewButton("", "the automatic voice"));
  }

  function draw(force) {
    const all = allVoices();
    const sig = all.map((v) => v.voiceURI).join("|") + "#" + voice.voiceURI + "#" + state.other;
    if (!force && sig === signature) return;
    signature = sig;
    n = 0;

    const found = all.find((v) => v.voiceURI === voice.voiceURI);
    const fallback = currentVoice(voice);
    const loaded = all.length > 0;

    // Which voice is chosen now
    if (!voice.voiceURI) {
      current.textContent = fallback ? "Voice: Automatic (using " + shownName(fallback) + ")" : "Voice: Automatic";
    } else if (found) {
      const q = qualityOf(found);
      current.textContent = "Voice: " + shownName(found) + (q && q !== "standard" ? " (" + QUALITY_LABEL[q] + ")" : "") +
        (isEnglish(found) ? "" : " [" + (found.lang || "") + "]");
    } else {
      current.textContent = "Voice: saved voice not found on this " + deviceWord();
    }

    // Saved voice that this device does not have: say so, keep the choice, use the fallback
    notice.hidden = !(loaded && voice.voiceURI && !found);
    if (!notice.hidden) {
      notice.textContent = "This learner's saved voice isn't on this " + deviceWord() + "; using " +
        (fallback ? shownName(fallback) : "the default voice") + ". The choice is kept, so it works again on the device it came from.";
    }

    status.textContent = loaded ? "" : (tries >= MAX_TRIES
      ? "No voices were found on this device. Open Get more voices below, then fully close and reopen VOICE."
      : "Loading the voices on this device…");

    list.replaceChildren();
    if (!loaded) return;

    const g = groupVoices(all);
    // First time: open the first English group and the group that holds the chosen voice
    if (!state.started) {
      state.started = true;
      if (g.english[0]) state.open.add(g.english[0].key);
      if (found) {
        const k = isEnglish(found) ? (isNovelty(found) ? "fun" : englishGroupKey(found)) : "lang-" + String(found.lang).toLowerCase().split(/[-_]/)[0];
        state.open.add(k);
        if (!isEnglish(found)) state.other = true;
      }
    }

    list.append(autoRow(all));
    if (!g.english.length && !g.fun.length) {
      list.append(h("p", { class: "muted", id: "voice-no-english", text: "No English voices were found on this device." }));
    }
    g.english.forEach((x) => list.append(group(x.key, x.label, x.voices)));
    if (g.fun.length) list.append(group("fun", "Fun voices", g.fun, "vp-fun-group"));

    if (g.others.length) {
      const count = g.others.reduce((s, x) => s + x.voices.length, 0);
      list.append(h("button", { type: "button", class: "btn vp-other-toggle", id: "voice-other-toggle", "aria-expanded": String(state.other),
        text: (state.other ? "Hide other languages" : "Show other languages") + ` (${count})`,
        onclick: () => { state.other = !state.other; draw(true); } }));
      if (state.other) {
        list.append(h("div", { class: "vp-others", id: "voice-others" },
          g.others.map((x) => group("lang-" + x.key, x.label, x.voices))));
      }
    }
  }

  // iOS hands out its voices late (sometimes seconds after the page opens): look again every half second for a few seconds
  const MAX_TRIES = 12;
  draw(true);
  const stopListen = onVoicesChanged(() => draw(false));
  if (!allVoices().length) {
    timer = setInterval(() => {
      tries++;
      if (allVoices().length || tries >= MAX_TRIES) { clearInterval(timer); timer = null; }
      draw(true);
    }, 500);
  }

  return { el, stop: () => { stopListen(); if (timer) clearInterval(timer); timer = null; } };
}
