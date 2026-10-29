// Text-to-speech using the browser's built-in Web Speech API.
// No audio files and no network are used.
//
// Voice settings belong to each learner's profile (adult menu > Voice). app.js hands the
// current learner's settings to setVoiceSettings():
//   voiceURI, pitch       which voice and how high
//   rate                  "Speed" for a SINGLE WORD (a word button, a letter, a form)
//   sentenceRate          "Sentence speed": anything of more than one word (a phrase button, a custom
//                         phrase, "thank you", a typed number like "one hundred five") and the
//                         message bar. Slower on purpose: one stream of words sounds much faster
//                         than the same words said one at a time.
//   pause                 "off" | "short" | "medium" | "long": the gap between chips when the
//                         message bar is played (see speakSequence below)
// EVERY spoken sound in the app goes through speak() or speakSequence() in this file, so every path
// uses the learner's voice and pitch, and the right speed.

const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
let voices = [];
let settings = { voiceURI: "", pitch: 1.5, rate: 1.05, sentenceRate: 0.9, pause: "off" };

export function setVoiceSettings(s) { settings = s; }

export const DEFAULT_SENTENCE_RATE = 0.9;
// Gap between chips (milliseconds) for each "Pause between words" choice.
export const PAUSE_MS = { off: 0, short: 250, medium: 500, long: 800 };
export const PAUSE_CHOICES = Object.keys(PAUSE_MS);
export const pauseMs = () => PAUSE_MS[settings.pause] || 0;
const sentenceRate = () => (typeof settings.sentenceRate === "number" ? settings.sentenceRate : DEFAULT_SENTENCE_RATE);

// More than one word? ("thank you", "I want juice", "one hundred five")
export const isPhrase = (text) => String(text).trim().split(/\s+/).length > 1;

// Voices load asynchronously on iOS/Chrome, so refresh when they arrive.
function refreshVoices() {
  if (synth) voices = synth.getVoices();
}

// English voices only; if the device has none, offer every voice.
export function listVoices() {
  refreshVoices();
  const english = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith("en"));
  return english.length ? english : voices.slice();
}

// Every voice the device offers, in every language (the voice picker sorts and groups them).
export function allVoices() {
  refreshVoices();
  return voices.slice();
}

// The voice that WOULD speak for these settings (the chosen one if installed, else the fallback), or null.
// The voice picker uses it to say which voice is really being used.
export function currentVoice(s = settings) {
  refreshVoices();
  return pickVoice(s);
}

// Let other code (the voice picker) know when the voice list changes.
export function onVoicesChanged(fn) {
  if (!synth) return () => {};
  synth.addEventListener("voiceschanged", fn);
  return () => synth.removeEventListener("voiceschanged", fn);
}

// The chosen voice if still installed; otherwise en-US, then any English.
function pickVoice(s = settings) {
  const chosen = s.voiceURI && voices.find((v) => v.voiceURI === s.voiceURI);
  return (
    chosen ||
    voices.find((v) => v.lang === "en-US" && v.localService) ||
    voices.find((v) => v.lang === "en-US") ||
    voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("en")) ||
    null
  );
}

export function initSpeech() {
  if (!synth) {
    console.warn("Speech synthesis is not available in this browser.");
    return;
  }
  refreshVoices();
  synth.addEventListener("voiceschanged", refreshVoices);

  // iOS only allows speech that starts inside a user gesture. On the very
  // first touch we "unlock" the engine with a silent utterance so the first
  // real word tap is not swallowed.
  const unlock = () => {
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      synth.speak(u);
    } catch (e) { /* ignore */ }
    window.removeEventListener("pointerdown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
}

// ---------- Speaking ----------
// Build one utterance with the learner's voice and pitch at the given speed.
function makeUtterance(text, rate, s = settings) {
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(s);
  if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = "en-US"; }
  u.pitch = s.pitch;
  u.rate = rate;
  u.volume = 1;                     // always full: the device's own volume is the only volume control (the silent unlock below is the one exception)
  return u;
}

// Speak text right now, interrupting anything already being spoken (including a message-bar playback).
//   kind "word"      -> the learner's Speed
//   kind "sentence"  -> Sentence speed
//   kind "auto" (default): one word -> Speed; more than one word -> Sentence speed
//   voice (optional)  settings to use instead of the current learner's (the setup screen's volume test uses the
//                     default child voice before any learner exists)
export function speak(text, kind = "auto", voice = settings) {
  if (!synth || !text) return;
  try {
    stopSequence();
    msgUtt = null;                    // anything spoken now replaces a message-bar playback
    synth.cancel();
    refreshVoices();
    const asSentence = kind === "sentence" || (kind === "auto" && isPhrase(text));
    const rate = asSentence
      ? (typeof voice.sentenceRate === "number" ? voice.sentenceRate : DEFAULT_SENTENCE_RATE)
      : voice.rate;
    synth.speak(makeUtterance(text, rate, voice));
  } catch (e) {
    console.warn("Speech failed:", e);
  }
}

// The message bar with "Pause between words" OFF: the whole sentence is ONE utterance at Sentence speed.
// We remember that utterance so a second tap on the bar can tell the sentence is still playing and stop it
// (see isMessagePlaying). Everything else about it is the same as speak(text, "sentence").
let msgUtt = null;        // the message-bar utterance that is playing, or null
let msgStart = 0;
export function speakMessage(text) {
  if (!synth || !text) return;
  try {
    stopSequence();
    synth.cancel();
    refreshVoices();
    const u = makeUtterance(text, sentenceRate());
    const done = () => { if (msgUtt === u) msgUtt = null; };
    u.onend = done;
    u.onerror = done;
    msgUtt = u;
    msgStart = performance.now();
    synth.speak(u);
  } catch (e) {
    console.warn("Speech failed:", e);
  }
}

// ---------- Playing the message bar one chip at a time ----------
// With "Pause between words" on, each chip is its own utterance (a chip of several words, such as
// "thank you", is one chunk) and the next starts after the chosen gap. All at Sentence speed.
// Tapping the message bar again stops it (app.js calls stopSpeech()).
let seq = null;   // the playback in progress: { id, polls }
let seqId = 0;

export const isSequencePlaying = () => !!seq;

// True while the message bar is being played, with pauses ON (a chip-by-chip sequence) or OFF (one
// utterance). The single utterance is trusted for as long as the speech engine also says it is busy;
// that way a voice that never reports "ended" cannot leave the bar stuck in "playing".
export function isMessagePlaying() {
  if (seq) return true;
  if (!msgUtt) return false;
  if (performance.now() - msgStart < 400) return true;           // some engines report "speaking" a moment late
  return !synth || synth.speaking || synth.pending;
}

function stopSequence() {
  if (!seq) return;
  const old = seq;
  seq = null;                       // events from the old utterances are now ignored
  clearInterval(old.poll);
  clearTimeout(old.timer);
  if (old.onEnd) old.onEnd(false);
}

// Stop everything that is being said, right now.
export function stopSpeech() {
  stopSequence();
  msgUtt = null;
  if (synth) { try { synth.cancel(); } catch (e) { /* ignore */ } }
}

// chunks = the texts to say, in order. gapMs = pause between them.
//   onChunk(i)   called as chunk i begins (the message bar highlights that chip)
//   onEnd(done)  called when it is over: done = true if it played to the end, false if it was stopped
export function speakSequence(chunks, gapMs, { onChunk, onEnd } = {}) {
  const list = chunks.filter(Boolean);
  if (!synth || !list.length) return;
  try {
    stopSequence();
    synth.cancel();
    refreshVoices();
    const me = { id: ++seqId, poll: null, timer: null, onEnd };
    seq = me;
    let i = 0;
    const next = () => {
      if (seq !== me) return;
      if (i >= list.length) { seq = null; if (onEnd) onEnd(true); return; }
      const idx = i++;
      if (onChunk) onChunk(idx);
      const u = makeUtterance(list[idx], sentenceRate());
      let advanced = false;
      const advance = () => {
        if (advanced || seq !== me) return;
        advanced = true;
        clearInterval(me.poll);
        if (i >= list.length) next();                     // that was the last one
        else me.timer = setTimeout(next, gapMs);          // the gap, then the next chip
      };
      u.onend = advance;
      u.onerror = advance;
      synth.speak(u);
      // Safety net: if the browser never reports the end of an utterance (it happens with some voices),
      // move on once the speech engine says it is idle.
      const started = performance.now();
      me.poll = setInterval(() => {
        if (performance.now() - started > 500 && !synth.speaking && !synth.pending) advance();
      }, 100);
    };
    next();
  } catch (e) {
    console.warn("Speech failed:", e);
  }
}
