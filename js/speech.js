// Text-to-speech using the browser's built-in Web Speech API.
// No audio files and no network are used.
import { load, save } from "./storage.js";

const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
let voices = [];
let voiceMode = load("voice", "child"); // "child" or "adult"

// Voice settings per mode. Pitch/rate are the only things we vary.
const PROFILES = {
  child: { pitch: 1.5, rate: 1.05 },
  adult: { pitch: 1.0, rate: 1.0 },
};

export function getVoiceMode() { return voiceMode; }
export function setVoiceMode(mode) {
  if (!PROFILES[mode]) return;
  voiceMode = mode;
  save("voice", mode);
}

// Voices load asynchronously on iOS/Chrome, so refresh when they arrive.
function refreshVoices() {
  if (synth) voices = synth.getVoices();
}

// Prefer en-US, then any English, then whatever the device offers.
function pickVoice() {
  return (
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

// Speak text right now, interrupting anything already being spoken.
export function speak(text) {
  if (!synth || !text) return;
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = "en-US"; }
    const p = PROFILES[voiceMode];
    u.pitch = p.pitch;
    u.rate = p.rate;
    synth.speak(u);
  } catch (e) {
    console.warn("Speech failed:", e);
  }
}
